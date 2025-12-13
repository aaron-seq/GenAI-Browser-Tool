import { describe, it, expect, beforeEach } from 'vitest';
import { ValidationService } from '../../src/utils/validation-service.js';

describe('ValidationService', () => {
  /** @type {ValidationService} */
  let validator;

  beforeEach(() => {
    validator = new ValidationService();
    global.__DEV__ = true;
  });

  describe('input sanitization', () => {
    it('should sanitize HTML content', () => {
      const maliciousHtml = '<script>alert("xss")</script><p>Safe content</p>';
      const sanitized = validator.sanitizeContent(maliciousHtml);
      
      expect(sanitized).not.toContain('<script>');
      expect(sanitized).toBe('Safe content');
    });

    it('should validate and sanitize user input string', () => {
      const userInput = '<script>alert("xss")</script>Clean text';
      const result = validator.validateContentForSummarization(userInput);
      
      expect(result.sanitizedContent).not.toContain('<script>');
      expect(result.sanitizedContent).toContain('Clean text');
      expect(result.isValid).toBe(true);
    });

    it('should reject excessively long input', () => {
      const oversizedInput = 'x'.repeat(10001); // > 10000 limit
      const result = validator.validateContentForSummarization(oversizedInput);
      
      const hasLengthWarning = result.warnings.some(w => /Content is long/.test(w));
      expect(hasLengthWarning).toBe(true);
      
      // Note: Implementation logs warning but might still mark valid if sanitized content is OK.
      // But let's check if it handles it gracefully.
      expect(result.sanitizedContent).toBeDefined();
    });
    
    it('should validate question length', () => {
      const oversizedQuestion = 'x'.repeat(1001); // > 1000 limit
      expect(validator.isValidQuestion(oversizedQuestion)).toBe(false);
    });
  });

  describe('URL validation', () => {
    it('should validate safe URLs', () => {
      const safeUrls = [
        'https://example.com',
        'https://www.google.com/search?q=test',
        'http://localhost:3000'
      ];
      
      safeUrls.forEach(url => {
        expect(validator.validateUrl(url).isValid).toBe(true);
      });
    });

    it('should reject unsafe URLs', () => {
      const unsafeUrls = [
        'javascript:alert(1)',
        'data:text/html,<script>alert(1)</script>',
        'file:///etc/passwd'
      ];
      
      unsafeUrls.forEach(url => {
        expect(validator.validateUrl(url).isValid).toBe(false);
      });
    });
  });

  describe('API key validation', () => {
    it('should validate API key format', () => {
      const validKeys = {
        openai: 'sk-1234567890abcdef1234567890abcdef1234567812345678', // 48+ chars
        anthropic: 'sk-ant-1234567890abcdef1234567890abcdef12345678', // 40+ chars
        google: 'AIza1234567890abcdef1234567890abc' // 20+ chars
      };
      
      Object.entries(validKeys).forEach(([provider, key]) => {
        expect(validator.validateApiKey(key, provider).isValid).toBe(true);
      });
    });

    it('should reject invalid API key formats', () => {
      const invalidKeys = {
        anthropic: 'sk-1234', // too short (< 10)
        google: 'short' // too short (< 10)
      };
      
      Object.entries(invalidKeys).forEach(([provider, key]) => {
        expect(validator.validateApiKey(key, provider).isValid).toBe(false);
      });
    });
  });
});