// GenAI Browser Tool - Offscreen Document Script
// Handles operations requiring DOM access in Manifest V3

class OffscreenManager {
  constructor() {
    this.clipboardArea = document.getElementById('clipboard-area');
    this.processingArea = document.getElementById('processing-area');
    this.imageCanvas = document.getElementById('image-canvas');
    this.canvasContext = this.imageCanvas.getContext('2d');
    
    this.setupMessageHandlers();
    console.log('Offscreen document initialized');
  }

  setupMessageHandlers() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      this.handleMessage(request, sender, sendResponse);
      return true; // Keep the message channel open for async responses
    });
  }

  async handleMessage(request, sender, sendResponse) {
    try {
      const { action, data } = request;

      switch (action) {
        case 'clipboard-write':
          const writeSuccess = await this.writeToClipboard(data.text);
          sendResponse({ success: writeSuccess });
          break;

        case 'clipboard-read':
          const clipboardText = await this.readFromClipboard();
          sendResponse({ success: true, data: clipboardText });
          break;

        case 'dom-parser':
          const parsedContent = this.parseHTMLContent(data.html);
          sendResponse({ success: true, data: parsedContent });
          break;

        case 'text-processing':
          const processedText = this.processText(data.text, data.options);
          sendResponse({ success: true, data: processedText });
          break;

        case 'url-validation':
          const isValid = this.validateURLs(data.urls);
          sendResponse({ success: true, data: isValid });
          break;

        case 'local-storage-operation':
          const storageResult = await this.handleLocalStorage(data.operation, data.key, data.value);
          sendResponse({ success: true, data: storageResult });
          break;

        case 'file-processing':
          const fileResult = await this.processFile(data.file, data.type);
          sendResponse({ success: true, data: fileResult });
          break;

        case 'image-processing':
          const imageResult = await this.processImage(data.imageData, data.operations);
          sendResponse({ success: true, data: imageResult });
          break;

        case 'csv-generation':
          const csvData = this.generateCSV(data.data, data.headers);
          sendResponse({ success: true, data: csvData });
          break;

        case 'pdf-generation':
          const pdfResult = await this.generatePDF(data.content, data.options);
          sendResponse({ success: true, data: pdfResult });
          break;

        case 'markdown-conversion':
          const markdownResult = this.convertToMarkdown(data.content, data.type);
          sendResponse({ success: true, data: markdownResult });
          break;

        default:
          sendResponse({ success: false, error: 'Unknown action' });
      }
    } catch (error) {
      console.error('Error in offscreen operation:', error);
      sendResponse({ success: false, error: error.message });
    }
  }

  // Clipboard operations
  async writeToClipboard(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      } else {
        // Fallback method
        this.clipboardArea.value = text;
        this.clipboardArea.select();
        this.clipboardArea.setSelectionRange(0, 99999);
        const success = document.execCommand('copy');
        this.clipboardArea.value = '';
        return success;
      }
    } catch (error) {
      console.error('Clipboard write error:', error);
      return false;
    }
  }

  async readFromClipboard() {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        return await navigator.clipboard.readText();
      } else {
        // Fallback - focus on textarea and paste
        this.clipboardArea.focus();
        this.clipboardArea.value = '';
        document.execCommand('paste');
        const text = this.clipboardArea.value;
        this.clipboardArea.value = '';
        return text;
      }
    } catch (error) {
      console.error('Clipboard read error:', error);
      return '';
    }
  }

  // HTML parsing and content extraction
  parseHTMLContent(html) {
    try {
      // Create a temporary container for parsing
      const container = document.createElement('div');
      container.innerHTML = html;

      const parsed = {
        text: container.textContent || container.innerText || '',
        links: [],
        images: [],
        headings: [],
        lists: [],
        tables: []
      };

      // Extract links
      const links = container.querySelectorAll('a[href]');
      links.forEach(link => {
        parsed.links.push({
          href: link.href,
          text: link.textContent?.trim() || '',
          title: link.title || ''
        });
      });

      // Extract images
      const images = container.querySelectorAll('img[src]');
      images.forEach(img => {
        parsed.images.push({
          src: img.src,
          alt: img.alt || '',
          title: img.title || ''
        });
      });

      // Extract headings
      const headings = container.querySelectorAll('h1, h2, h3, h4, h5, h6');
      headings.forEach(heading => {
        parsed.headings.push({
          level: parseInt(heading.tagName[1]),
          text: heading.textContent?.trim() || ''
        });
      });

      // Extract lists
      const lists = container.querySelectorAll('ul, ol');
      lists.forEach(list => {
        const items = [];
        const listItems = list.querySelectorAll('li');
        listItems.forEach(li => {
          items.push(li.textContent?.trim() || '');
        });
        parsed.lists.push({
          type: list.tagName.toLowerCase(),
          items
        });
      });

      // Extract tables
      const tables = container.querySelectorAll('table');
      tables.forEach(table => {
        const data = [];
        const rows = table.querySelectorAll('tr');
        rows.forEach(row => {
          const cells = [];
          const cellElements = row.querySelectorAll('td, th');
          cellElements.forEach(cell => {
            cells.push(cell.textContent?.trim() || '');
          });
          if (cells.length > 0) {
            data.push(cells);
          }
        });
        parsed.tables.push({ data });
      });

      return parsed;
    } catch (error) {
      console.error('HTML parsing error:', error);
      return { text: '', links: [], images: [], headings: [], lists: [], tables: [] };
    }
  }

  // Text processing operations
  processText(text, options = {}) {
    try {
      let processed = text;

      if (options.clean) {
        // Remove extra whitespace and clean up text
        processed = processed.replace(/\s+/g, ' ').trim();
        processed = processed.replace(/\n\s*\n/g, '\n\n'); // Normalize line breaks
      }

      if (options.removePunctuation) {
        processed = processed.replace(/[^\w\s]/g, '');
      }

      if (options.toLowerCase) {
        processed = processed.toLowerCase();
      }

      if (options.removeStopWords && options.language === 'en') {
        const stopWords = ['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by'];
        const words = processed.split(/\s+/);
        processed = words.filter(word => !stopWords.includes(word.toLowerCase())).join(' ');
      }

      if (options.extractKeywords) {
        const words = processed.split(/\s+/);
        const wordCount = {};
        
        words.forEach(word => {
          const cleanWord = word.toLowerCase().replace(/[^\w]/g, '');
          if (cleanWord.length > 3) {
            wordCount[cleanWord] = (wordCount[cleanWord] || 0) + 1;
          }
        });

        const keywords = Object.entries(wordCount)
          .sort(([,a], [,b]) => b - a)
          .slice(0, 10)
          .map(([word]) => word);

        return { processed, keywords };
      }

      return { processed };
    } catch (error) {
      console.error('Text processing error:', error);
      return { processed: text };
    }
  }

  // URL validation
  validateURLs(urls) {
    const results = [];
    
    urls.forEach(url => {
      try {
        const urlObj = new URL(url);
        results.push({
          url,
          isValid: true,
          protocol: urlObj.protocol,
          hostname: urlObj.hostname,
          pathname: urlObj.pathname
        });
      } catch (error) {
        results.push({
          url,
          isValid: false,
          error: error.message
        });
      }
    });

    return results;
  }

  // Local storage operations (for migration and backup)
  async handleLocalStorage(operation, key, value) {
    try {
      switch (operation) {
        case 'get':
          return localStorage.getItem(key);
        
        case 'set':
          localStorage.setItem(key, value);
          return true;
        
        case 'remove':
          localStorage.removeItem(key);
          return true;
        
        case 'clear':
          localStorage.clear();
          return true;
        
        case 'getAll':
          const allData = {};
          for (let i = 0; i < localStorage.length; i++) {
            const storageKey = localStorage.key(i);
            allData[storageKey] = localStorage.getItem(storageKey);
          }
          return allData;
        
        default:
          throw new Error('Unknown localStorage operation');
      }
    } catch (error) {
      console.error('LocalStorage operation error:', error);
      throw error;
    }
  }

  // File processing
  async processFile(fileData, type) {
    try {
      switch (type) {
        case 'text':
          return this.processTextFile(fileData);
        
        case 'json':
          return this.processJSONFile(fileData);
        
        case 'csv':
          return this.processCSVFile(fileData);
        
        case 'image':
          return await this.processImageFile(fileData);
        
        default:
          throw new Error('Unsupported file type');
      }
    } catch (error) {
      console.error('File processing error:', error);
      throw error;
    }
  }

  processTextFile(fileData) {
    const text = new TextDecoder().decode(fileData);
    return {
      content: text,
      wordCount: text.split(/\s+/).length,
      lineCount: text.split('\n').length,
      charCount: text.length
    };
  }

  processJSONFile(fileData) {
    const text = new TextDecoder().decode(fileData);
    const json = JSON.parse(text);
    return {
      content: json,
      isValid: true,
      keys: Object.keys(json).length
    };
  }

  processCSVFile(fileData) {
    const text = new TextDecoder().decode(fileData);
    const lines = text.split('\n').map(line => line.trim()).filter(line => line);
    const data = lines.map(line => line.split(',').map(cell => cell.trim()));
    
    return {
      content: data,
      rows: data.length,
      columns: data.length > 0 ? data[0].length : 0,
      headers: data.length > 0 ? data[0] : []
    };
  }

  async processImageFile(fileData) {
    return new Promise((resolve, reject) => {
      const blob = new Blob([fileData]);
      const img = new Image();
      
      img.onload = () => {
        this.imageCanvas.width = img.width;
        this.imageCanvas.height = img.height;
        this.canvasContext.drawImage(img, 0, 0);
        
        const imageInfo = {
          width: img.width,
          height: img.height,
          aspectRatio: img.width / img.height,
          dataURL: this.imageCanvas.toDataURL()
        };
        
        resolve(imageInfo);
      };
      
      img.onerror = () => {
        reject(new Error('Failed to load image'));
      };
      
      img.src = URL.createObjectURL(blob);
    });
  }

  // Image processing operations
  async processImage(imageData, operations) {
    try {
      return new Promise((resolve, reject) => {
        const img = new Image();
        
        img.onload = () => {
          this.imageCanvas.width = img.width;
          this.imageCanvas.height = img.height;
          this.canvasContext.drawImage(img, 0, 0);
          
          // Apply operations
          operations.forEach(operation => {
            switch (operation.type) {
              case 'resize':
                this.resizeImage(operation.width, operation.height);
                break;
              case 'grayscale':
                this.applyGrayscale();
                break;
              case 'brightness':
                this.adjustBrightness(operation.value);
                break;
            }
          });
          
          const result = {
            dataURL: this.imageCanvas.toDataURL(),
            width: this.imageCanvas.width,
            height: this.imageCanvas.height
          };
          
          resolve(result);
        };
        
        img.onerror = () => {
          reject(new Error('Failed to load image for processing'));
        };
        
        img.src = imageData;
      });
    } catch (error) {
      console.error('Image processing error:', error);
      throw error;
    }
  }

  resizeImage(newWidth, newHeight) {
    const tempCanvas = document.createElement('canvas');
    const tempContext = tempCanvas.getContext('2d');
    
    tempCanvas.width = newWidth;
    tempCanvas.height = newHeight;
    
    tempContext.drawImage(this.imageCanvas, 0, 0, newWidth, newHeight);
    
    this.imageCanvas.width = newWidth;
    this.imageCanvas.height = newHeight;
    this.canvasContext.drawImage(tempCanvas, 0, 0);
  }

  applyGrayscale() {
    const imageData = this.canvasContext.getImageData(0, 0, this.imageCanvas.width, this.imageCanvas.height);
    const data = imageData.data;
    
    for (let i = 0; i < data.length; i += 4) {
      const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      data[i] = gray;
      data[i + 1] = gray;
      data[i + 2] = gray;
    }
    
    this.canvasContext.putImageData(imageData, 0, 0);
  }

  adjustBrightness(value) {
    const imageData = this.canvasContext.getImageData(0, 0, this.imageCanvas.width, this.imageCanvas.height);
    const data = imageData.data;
    
    for (let i = 0; i < data.length; i += 4) {
      data[i] += value;     // Red
      data[i + 1] += value; // Green
      data[i + 2] += value; // Blue
    }
    
    this.canvasContext.putImageData(imageData, 0, 0);
  }

  // CSV generation
  generateCSV(data, headers = null) {
    try {
      let csv = '';
      
      // Add headers if provided
      if (headers && Array.isArray(headers)) {
        csv += headers.map(header => this.escapeCSVValue(header)).join(',') + '\n';
      }
      
      // Add data rows
      if (Array.isArray(data)) {
        data.forEach(row => {
          if (Array.isArray(row)) {
            csv += row.map(cell => this.escapeCSVValue(cell)).join(',') + '\n';
          } else if (typeof row === 'object') {
            const values = headers ? headers.map(header => row[header] || '') : Object.values(row);
            csv += values.map(value => this.escapeCSVValue(value)).join(',') + '\n';
          }
        });
      }
      
      return csv;
    } catch (error) {
      console.error('CSV generation error:', error);
      throw error;
    }
  }

  escapeCSVValue(value) {
    if (value === null || value === undefined) return '';
    
    const stringValue = String(value);
    
    if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
      return `"${stringValue.replace(/"/g, '""')}"`;
    }
    
    return stringValue;
  }

  // Markdown conversion
  convertToMarkdown(content, type) {
    try {
      switch (type) {
        case 'html':
          return this.htmlToMarkdown(content);
        
        case 'text':
          return this.textToMarkdown(content);
        
        case 'json':
          return this.jsonToMarkdown(content);
        
        default:
          return content;
      }
    } catch (error) {
      console.error('Markdown conversion error:', error);
      return content;
    }
  }

  htmlToMarkdown(html) {
    const container = document.createElement('div');
    container.innerHTML = html;
    
    let markdown = '';
    
    // Convert headings
    const headings = container.querySelectorAll('h1, h2, h3, h4, h5, h6');
    headings.forEach(heading => {
      const level = parseInt(heading.tagName[1]);
      const text = heading.textContent?.trim();
      if (text) {
        markdown += `${'#'.repeat(level)} ${text}\n\n`;
      }
    });
    
    // Convert paragraphs
    const paragraphs = container.querySelectorAll('p');
    paragraphs.forEach(p => {
      const text = p.textContent?.trim();
      if (text) {
        markdown += `${text}\n\n`;
      }
    });
    
    // Convert lists
    const lists = container.querySelectorAll('ul, ol');
    lists.forEach(list => {
      const items = list.querySelectorAll('li');
      items.forEach((item, index) => {
        const text = item.textContent?.trim();
        if (text) {
          const prefix = list.tagName === 'OL' ? `${index + 1}.` : '-';
          markdown += `${prefix} ${text}\n`;
        }
      });
      markdown += '\n';
    });
    
    return markdown;
  }

  textToMarkdown(text) {
    // Simple text to markdown conversion
    return text
      .split('\n\n')
      .map(paragraph => paragraph.trim())
      .filter(paragraph => paragraph)
      .join('\n\n');
  }

  jsonToMarkdown(json) {
    let markdown = '# JSON Data\n\n';
    
    const traverse = (obj, level = 0) => {
      const indent = '  '.repeat(level);
      
      if (Array.isArray(obj)) {
        obj.forEach((item, index) => {
          markdown += `${indent}- **Item ${index + 1}:**\n`;
          traverse(item, level + 1);
        });
      } else if (typeof obj === 'object' && obj !== null) {
        Object.entries(obj).forEach(([key, value]) => {
          markdown += `${indent}- **${key}:** `;
          if (typeof value === 'object') {
            markdown += '\n';
            traverse(value, level + 1);
          } else {
            markdown += `${value}\n`;
          }
        });
      } else {
        markdown += `${indent}${obj}\n`;
      }
    };
    
    traverse(json);
    return markdown;
  }
}

// Initialize offscreen manager
new OffscreenManager();