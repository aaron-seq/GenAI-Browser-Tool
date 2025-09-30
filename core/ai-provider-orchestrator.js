/**
 * @file core/ai-provider-orchestrator.js
 * @description Advanced AI provider management with fallback strategies
 */

import { ChromeAIProvider } from '../providers/chrome-ai-provider.js';
import { OpenAIProvider } from '../providers/openai-provider.js';
import { AnthropicProvider } from '../providers/anthropic-provider.js';
import { GeminiProvider } from '../providers/gemini-provider.js';
import { CohereProvider } from '../providers/cohere-provider.js';
import { Logger } from '../utils/logger.js';

export class AIProviderOrchestrator {
  constructor() {
    this.logger = new Logger('AIOrchestrator');
    this.providers = new Map();
    this.providerHealth = new Map();
    this.loadBalancer = new LoadBalancer();
    
    this.initializeProviders();
  }

  async initializeProviders() {
    const providerClasses = [
      ChromeAIProvider,
      OpenAIProvider,
      AnthropicProvider,
      GeminiProvider,
      CohereProvider
    ];

    for (const ProviderClass of providerClasses) {
      try {
        const provider = new ProviderClass();
        this.providers.set(provider.name, provider);
        
        // Initial health check
        const isHealthy = await this.checkProviderHealth(provider);
        this.providerHealth.set(provider.name, {
          isAvailable: isHealthy,
          lastChecked: Date.now(),
          responseTime: 0,
          successRate: 1.0
        });
        
        this.logger.info(`Initialized provider: ${provider.name}`, { isHealthy });
      } catch (error) {
        this.logger.error(`Failed to initialize provider: ${ProviderClass.name}`, error);
      }
    }
  }

  async getOptimalProvider(task = 'general') {
    const availableProviders = Array.from(this.providers.values())
      .filter(provider => this.isProviderHealthy(provider.name))
      .sort((a, b) => this.calculateProviderScore(b, task) - this.calculateProviderScore(a, task));

    if (availableProviders.length === 0) {
      throw new Error('No healthy AI providers available');
    }

    const selectedProvider = this.loadBalancer.selectProvider(availableProviders);
    this.logger.debug(`Selected provider: ${selectedProvider.name} for task: ${task}`);
    
    return selectedProvider;
  }

  calculateProviderScore(provider, task) {
    const health = this.providerHealth.get(provider.name);
    if (!health || !health.isAvailable) return 0;

    let score = health.successRate * 100;
    
    // Adjust score based on response time (lower is better)
    score -= Math.min(health.responseTime / 100, 50);
    
    // Task-specific optimizations
    const taskOptimizations = {
      'summarization': { 'chrome-ai': 20, 'openai': 15, 'anthropic': 25 },
      'question-answering': { 'openai': 25, 'anthropic': 20, 'gemini': 15 },
      'translation': { 'gemini': 25, 'openai': 20 },
      'sentiment-analysis': { 'openai': 20, 'cohere': 25 }
    };
    
    const taskBonus = taskOptimizations[task]?.[provider.name] || 0;
    score += taskBonus;
    
    return score;
  }

  async checkProviderHealth(provider) {
    try {
      const startTime = performance.now();
      const isAvailable = await provider.isAvailable();
      const responseTime = performance.now() - startTime;
      
      if (isAvailable) {
        this.updateProviderHealth(provider.name, true, responseTime);
      }
      
      return isAvailable;
    } catch (error) {
      this.updateProviderHealth(provider.name, false, 0);
      return false;
    }
  }

  updateProviderHealth(providerName, success, responseTime) {
    const health = this.providerHealth.get(providerName) || {};
    
    health.lastChecked = Date.now();
    health.responseTime = responseTime;
    health.isAvailable = success;
    
    // Update success rate with exponential moving average
    const alpha = 0.1;
    health.successRate = success 
      ? (health.successRate || 0) * (1 - alpha) + alpha
      : (health.successRate || 1) * (1 - alpha);
    
    this.providerHealth.set(providerName, health);
  }

  isProviderHealthy(providerName) {
    const health = this.providerHealth.get(providerName);
    if (!health) return false;
    
    const isRecent = Date.now() - health.lastChecked < 300000; // 5 minutes
    return health.isAvailable && health.successRate > 0.5 && isRecent;
  }

  async refreshProviderAvailability() {
    this.logger.info('Refreshing provider availability...');
    
    const healthCheckPromises = Array.from(this.providers.values())
      .map(provider => this.checkProviderHealth(provider));
    
    await Promise.allSettled(healthCheckPromises);
    
    const healthyProviders = Array.from(this.providers.keys())
      .filter(name => this.isProviderHealthy(name));
    
    this.logger.info(`Health check completed. Healthy providers: ${healthyProviders.join(', ')}`);
  }
}

class LoadBalancer {
  constructor() {
    this.requestCounts = new Map();
  }

  selectProvider(providers) {
    if (providers.length === 1) return providers[0];
    
    // Simple round-robin with health-based weighting
    let selectedProvider = providers[0];
    let minRequests = this.requestCounts.get(providers[0].name) || 0;
    
    for (const provider of providers) {
      const requestCount = this.requestCounts.get(provider.name) || 0;
      if (requestCount < minRequests) {
        selectedProvider = provider;
        minRequests = requestCount;
      }
    }
    
    // Update request count
    this.requestCounts.set(selectedProvider.name, minRequests + 1);
    
    return selectedProvider;
  }
}
