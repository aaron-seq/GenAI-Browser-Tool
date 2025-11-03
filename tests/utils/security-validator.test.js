import { describe, it, expect, beforeEach } from 'vitest';
import { SecurityValidator } from '../../utils/security-validator.js';

describe('SecurityValidator', () => {
  let validator;

  beforeEach(() => {
    validator = new SecurityValidator();
  });

  describe('message validation', () => {
    it('should validate proper message structure', () => {
      const validMessage = {
        actionType: 'GENERATE_CONTENT_SUMMARY',
        requestId: 'test-123',
        payload: { content: 'Test content' }
      };
      
      const validSender = {
        tab: { id: 1, url: 'https://example.com' },
        origin: 'https://example.com'
      };

      expect(validator.validateMessage(validMessage, validSender)).toBe(true);
    });

    it('should reject messages with missing required fields', () => {
      const invalidMessage = {
        actionType: 'GENERATE_CONTENT_SUMMARY'
        // missing requestId and payload
      };
      
      const validSender = {
        tab: { id: 1, url: 'https://example.com' }
      };

      expect(validator.validateMessage(invalidMessage, validSender)).toBe(false);
    });

    it('should reject messages with invalid action types', () => {
      const invalidMessage = {
        actionType: 'INVALID_ACTION',
        requestId: 'test-123',
        payload: {}
      };
      
      const validSender = {
        tab: { id: 1, url: 'https://example.com' }
      };

      expect(validator.validateMessage(invalidMessage, validSender)).toBe(false);
    });
  });

  describe('input sanitization', () => {
    it('should sanitize HTML content', () => {
      const maliciousHtml = '<script>alert("xss")</script><p>Safe content</p>';
      const sanitized = validator.sanitizeHtml(maliciousHtml);
      
      expect(sanitized).not.toContain('<script>');
      expect(sanitized).toContain('<p>Safe content</p>');
    });

    it('should validate and sanitize user input', () => {
      const userInput = {
        content: '<script>alert("xss")</script>Clean text',
        type: 'summarize'
      };
      
      const sanitized = validator.sanitizeUserInput(userInput);
      
      expect(sanitized.content).not.toContain('<script>');
      expect(sanitized.content).toContain('Clean text');
      expect(sanitized.type).toBe('summarize');
    });

    it('should reject excessively long input', () => {
      const oversizedInput = {
        content: 'x'.repeat(100000), // 100KB content
        type: 'summarize'
      };
      
      expect(() => validator.sanitizeUserInput(oversizedInput))
        .toThrow('Input content exceeds maximum allowed size');
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
        expect(validator.isValidUrl(url)).toBe(true);
      });
    });

    it('should reject unsafe URLs', () => {
      const unsafeUrls = [
        'javascript:alert(1)',
        'data:text/html,<script>alert(1)</script>',
        'file:///etc/passwd',
        'chrome-extension://malicious-id/page.html'
      ];
      
      unsafeUrls.forEach(url => {
        expect(validator.isValidUrl(url)).toBe(false);
      });
    });
  });

  describe('API key validation', () => {
    it('should validate API key format', () => {
      const validKeys = {
        openai: 'sk-1234567890abcdef1234567890abcdef12345678',
        anthropic: 'sk-ant-1234567890abcdef1234567890abcdef',
        google: 'AIza1234567890abcdef1234567890abcdef123'
      };
      
      Object.entries(validKeys).forEach(([provider, key]) => {
        expect(validator.validateApiKey(provider, key)).toBe(true);
      });
    });

    it('should reject invalid API key formats', () => {
      const invalidKeys = {
        openai: 'invalid-key',
        anthropic: 'sk-1234', // too short
        google: 'wrong-prefix-1234567890abcdef'
      };
      
      Object.entries(invalidKeys).forEach(([provider, key]) => {
        expect(validator.validateApiKey(provider, key)).toBe(false);
      });
    });
  });
});