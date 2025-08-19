// GenAI Browser Tool - Utility Functions
// Common utility functions used across the extension

export class Utils {
  constructor() {
    this.readingWordsPerMinute = 200; // Average reading speed
  }

  // Generate unique ID
  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  // Estimate reading time for text
  estimateReadingTime(text) {
    if (!text || typeof text !== 'string') return 0;
    
    const words = this.countWords(text);
    const minutes = Math.ceil(words / this.readingWordsPerMinute);
    return minutes;
  }

  // Count words in text
  countWords(text) {
    if (!text || typeof text !== 'string') return 0;
    
    return text.trim().split(/\s+/).filter(word => word.length > 0).length;
  }

  // Check if URL is valid for processing
  isValidUrl(url) {
    if (!url) return false;
    
    const invalidPrefixes = [
      'chrome://',
      'chrome-extension://',
      'edge://',
      'about:',
      'moz-extension://',
      'safari-extension://'
    ];
    
    return !invalidPrefixes.some(prefix => url.startsWith(prefix));
  }

  // Sanitize text for safe display
  sanitizeText(text) {
    if (!text) return '';
    
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Format timestamp to human readable
  formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} minutes ago`;
    if (diffHours < 24) return `${diffHours} hours ago`;
    if (diffDays < 7) return `${diffDays} days ago`;
    
    return date.toLocaleDateString();
  }

  // Truncate text with ellipsis
  truncateText(text, maxLength = 100) {
    if (!text || text.length <= maxLength) return text;
    
    return text.substring(0, maxLength).trim() + '...';
  }

  // Extract domain from URL
  extractDomain(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch (error) {
      return url;
    }
  }

  // Detect language of text (basic detection)
  detectLanguage(text) {
    if (!text) return 'unknown';
    
    // Simple language detection based on character patterns
    const patterns = {
      'chinese': /[\u4e00-\u9fff]/,
      'japanese': /[\u3040-\u309f\u30a0-\u30ff]/,
      'korean': /[\uac00-\ud7af]/,
      'arabic': /[\u0600-\u06ff]/,
      'russian': /[\u0400-\u04ff]/,
      'greek': /[\u0370-\u03ff]/,
      'hindi': /[\u0900-\u097f]/
    };

    for (const [lang, pattern] of Object.entries(patterns)) {
      if (pattern.test(text)) {
        return lang;
      }
    }

    return 'english'; // Default fallback
  }

  // Convert data to CSV format
  convertToCSV(data) {
    try {
      let csv = '';
      
      if (data.bookmarks && Array.isArray(data.bookmarks)) {
        csv += 'Bookmarks\n';
        csv += 'Title,URL,Tags,Reading Time,Word Count,Timestamp\n';
        
        data.bookmarks.forEach(bookmark => {
          const row = [
            this.escapeCSV(bookmark.title || ''),
            this.escapeCSV(bookmark.url || ''),
            this.escapeCSV((bookmark.tags || []).join('; ')),
            bookmark.readingTime || 0,
            bookmark.wordCount || 0,
            this.formatTimestamp(bookmark.timestamp)
          ];
          csv += row.join(',') + '\n';
        });
        csv += '\n';
      }

      return csv;
    } catch (error) {
      console.error('Error converting to CSV:', error);
      return '';
    }
  }

  // Convert data to Markdown format
  convertToMarkdown(data) {
    try {
      let markdown = '# GenAI Browser Tool Export\n\n';
      markdown += `Generated on: ${new Date().toISOString()}\n\n`;

      if (data.bookmarks && Array.isArray(data.bookmarks)) {
        markdown += '## Bookmarks\n\n';
        
        data.bookmarks.forEach(bookmark => {
          markdown += `### ${bookmark.title || 'Untitled'}\n\n`;
          markdown += `**URL:** ${bookmark.url}\n\n`;
          if (bookmark.tags && bookmark.tags.length > 0) {
            markdown += `**Tags:** ${bookmark.tags.join(', ')}\n\n`;
          }
          markdown += `**Reading Time:** ${bookmark.readingTime} minutes\n\n`;
          markdown += `**Added:** ${this.formatTimestamp(bookmark.timestamp)}\n\n`;
          if (bookmark.content) {
            markdown += `**Summary:** ${bookmark.content}\n\n`;
          }
          markdown += '---\n\n';
        });
      }

      return markdown;
    } catch (error) {
      console.error('Error converting to Markdown:', error);
      return '';
    }
  }

  // Escape CSV values
  escapeCSV(value) {
    if (typeof value !== 'string') return value;
    
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  // Debounce function for performance
  debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  // Throttle function for performance
  throttle(func, limit) {
    let inThrottle;
    return function(...args) {
      if (!inThrottle) {
        func.apply(this, args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  }

  // Copy text to clipboard
  async copyToClipboard(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      } else {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        
        const success = document.execCommand('copy');
        textArea.remove();
        return success;
      }
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
      return false;
    }
  }

  // Download text as file
  downloadAsFile(content, filename, mimeType = 'text/plain') {
    try {
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      URL.revokeObjectURL(url);
      return true;
    } catch (error) {
      console.error('Failed to download file:', error);
      return false;
    }
  }

  // Format file size
  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  // Validate email format
  isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  // Validate URL format
  isValidURL(string) {
    try {
      new URL(string);
      return true;
    } catch (_) {
      return false;
    }
  }

  // Extract text from HTML
  extractTextFromHTML(html) {
    const div = document.createElement('div');
    div.innerHTML = html;
    return div.textContent || div.innerText || '';
  }

  // Highlight search terms in text
  highlightText(text, searchTerm) {
    if (!searchTerm) return text;
    
    const regex = new RegExp(`(${this.escapeRegex(searchTerm)})`, 'gi');
    return text.replace(regex, '<mark>$1</mark>');
  }

  // Escape special regex characters
  escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // Check if element is in viewport
  isInViewport(element) {
    const rect = element.getBoundingClientRect();
    return (
      rect.top >= 0 &&
      rect.left >= 0 &&
      rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
      rect.right <= (window.innerWidth || document.documentElement.clientWidth)
    );
  }

  // Smooth scroll to element
  scrollToElement(element, offset = 0) {
    const elementPosition = element.getBoundingClientRect().top;
    const offsetPosition = elementPosition + window.pageYOffset - offset;

    window.scrollTo({
      top: offsetPosition,
      behavior: 'smooth'
    });
  }

  // Generate random color
  generateRandomColor() {
    const hue = Math.floor(Math.random() * 360);
    return `hsl(${hue}, 70%, 50%)`;
  }

  // Parse URL parameters
  parseURLParams(url) {
    try {
      const urlObj = new URL(url);
      const params = {};
      
      for (const [key, value] of urlObj.searchParams) {
        params[key] = value;
      }
      
      return params;
    } catch (error) {
      return {};
    }
  }

  // Format number with commas
  formatNumber(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  // Calculate percentage
  calculatePercentage(value, total) {
    if (total === 0) return 0;
    return Math.round((value / total) * 100);
  }

  // Deep clone object
  deepClone(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (obj instanceof Date) return new Date(obj.getTime());
    if (obj instanceof Array) return obj.map(item => this.deepClone(item));
    if (typeof obj === 'object') {
      const clonedObj = {};
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          clonedObj[key] = this.deepClone(obj[key]);
        }
      }
      return clonedObj;
    }
  }

  // Check if object is empty
  isEmpty(obj) {
    if (obj == null) return true;
    if (Array.isArray(obj) || typeof obj === 'string') return obj.length === 0;
    return Object.keys(obj).length === 0;
  }

  // Retry function with exponential backoff
  async retry(fn, maxAttempts = 3, delay = 1000) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        
        if (attempt === maxAttempts) {
          throw lastError;
        }
        
        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, attempt - 1)));
      }
    }
  }

  // Get system theme
  getSystemTheme() {
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
    return 'light';
  }

  // Log with timestamp
  log(message, level = 'info') {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
    
    switch (level) {
      case 'error':
        console.error(logMessage);
        break;
      case 'warn':
        console.warn(logMessage);
        break;
      case 'debug':
        console.debug(logMessage);
        break;
      default:
        console.log(logMessage);
    }
  }
}