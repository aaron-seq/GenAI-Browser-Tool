# Development Guide

This guide provides detailed information for developers working on the GenAI Browser Tool extension.

## Architecture Overview

The extension follows a modular architecture with clear separation of concerns:

```
┌────────────────────┐
│   Browser Extension    │
├────────────────────┤
│ Background Service     │
│ - AI Orchestration     │
│ - Context Menus        │
│ - Message Handling     │
├────────────────────┤
│ Content Scripts        │
│ - DOM Interaction      │
│ - Content Extraction   │
├────────────────────┤
│ User Interface         │
│ - Popup               │
│ - Options Page        │
│ - Notifications       │
└────────────────────┘
```

## Core Components

### Background Service Worker

**File**: `background.js`  
**Purpose**: Central coordination hub for extension functionality

**Key Responsibilities**:
- AI provider orchestration and fallback handling
- Context menu registration and event handling
- Message routing between components
- Storage management and data persistence
- Error handling and logging
- Performance analytics tracking

**Key Classes**:
- `BackgroundServiceOrchestrator`: Main service coordinator
- `AIProviderOrchestrator`: Manages multiple AI providers
- `ConfigurationManager`: Handles user preferences
- `StorageService`: Data persistence layer
- `NotificationManager`: User notification system

### Content Scripts

**File**: `content.js`  
**Purpose**: Interact with web page content and DOM

**Key Responsibilities**:
- Extract page content (text, metadata, structure)
- Handle text selection and context menu triggers
- Inject UI elements when needed
- Communicate with background service

### Popup Interface

**Files**: `popup.html`, `popup.js`, `popup.css`  
**Purpose**: Main user interface for extension

**Key Features**:
- Content summarization controls
- Q&A interface
- Translation tools
- Settings access
- History and saved items

### Options Page

**Files**: `options.html`, `options.js`, `options.css`  
**Purpose**: Extension configuration and preferences

**Key Features**:
- AI provider configuration
- API key management
- Customization options
- Export/import settings

## AI Provider System

### Provider Architecture

The extension supports multiple AI providers through a unified interface:

```javascript
class AIProvider {
  async initialize() { /* Provider-specific setup */ }
  async generateSummary(content, options) { /* Summarization */ }
  async answerQuestion(question, context) { /* Q&A */ }
  async translateText(text, targetLang) { /* Translation */ }
  async analyzeSentiment(text) { /* Sentiment analysis */ }
}
```

### Supported Providers

1. **OpenAI GPT**
   - Models: GPT-4, GPT-3.5-turbo
   - Features: Summarization, Q&A, analysis
   - Rate limits: Configurable

2. **Anthropic Claude**
   - Models: Claude-3 Sonnet, Haiku
   - Features: Long-form analysis, reasoning
   - Context length: Up to 200K tokens

3. **Google Gemini**
   - Models: Gemini Pro, Gemini Pro Vision
   - Features: Multimodal processing
   - Integration: Direct API

4. **Chrome Built-in AI** (Future)
   - Model: Gemini Nano
   - Features: Local processing
   - Privacy: No data leaves device

### Provider Selection Logic

```javascript
class AIProviderOrchestrator {
  async getOptimalProvider(task) {
    // 1. Check user preference
    // 2. Validate API availability
    // 3. Consider task requirements
    // 4. Implement fallback logic
    // 5. Return best available provider
  }
}
```

## Message Passing System

### Message Structure

```javascript
const message = {
  actionType: 'GENERATE_CONTENT_SUMMARY',
  requestId: 'unique-request-id',
  payload: {
    content: 'Content to process',
    options: { /* Task-specific options */ }
  }
};
```

### Supported Actions

- `GENERATE_CONTENT_SUMMARY`: Content summarization
- `ANSWER_CONTEXTUAL_QUESTION`: Q&A processing
- `TRANSLATE_CONTENT`: Text translation
- `ANALYZE_SENTIMENT`: Sentiment analysis
- `EXTRACT_PAGE_CONTENT`: DOM content extraction
- `SAVE_SMART_BOOKMARK`: Intelligent bookmarking
- `GET_USER_PREFERENCES`: Configuration retrieval
- `UPDATE_USER_PREFERENCES`: Settings update

### Error Handling

```javascript
const response = {
  success: false,
  error: 'Descriptive error message',
  errorCode: 'ERROR_CODE',
  requestId: 'matching-request-id',
  processingTime: 1250
};
```

## Storage System

### Data Structure

```javascript
const storageSchema = {
  // User preferences
  userPreferences: {
    aiProvider: 'openai',
    summaryLength: 'medium',
    language: 'en',
    theme: 'auto'
  },
  
  // Summary history
  summaryHistory: [
    {
      id: 'unique-id',
      originalContent: 'excerpt...',
      summary: 'Generated summary',
      timestamp: 1699123456789,
      provider: 'openai',
      options: { /* summarization options */ }
    }
  ],
  
  // Conversation history
  conversationHistory: [
    {
      question: 'User question',
      answer: 'AI response',
      context: 'Page context',
      timestamp: 1699123456789
    }
  ],
  
  // Smart bookmarks
  smartBookmarks: [
    {
      url: 'https://example.com',
      title: 'Page title',
      summary: 'AI-generated summary',
      tags: ['tag1', 'tag2'],
      timestamp: 1699123456789
    }
  ]
};
```

### Storage Management

- **Chrome Storage API**: Persistent data storage
- **Quota Management**: 5MB limit handling
- **Data Cleanup**: Automatic old data removal
- **Sync Support**: Cross-device synchronization

## Security Model

### Input Validation

```javascript
class SecurityValidator {
  validateMessage(message, sender) {
    // Validate message structure
    // Check sender permissions
    // Verify action type
    // Sanitize payload data
  }
  
  sanitizeHtml(htmlContent) {
    // Use DOMPurify for HTML sanitization
    // Remove script tags and dangerous attributes
    // Preserve safe formatting
  }
  
  validateApiKey(provider, key) {
    // Check key format and length
    // Validate against provider patterns
    // Ensure key is not exposed
  }
}
```

### Content Security Policy

```json
{
  "content_security_policy": {
    "extension_pages": "script-src 'self'; object-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://api.openai.com https://api.anthropic.com https://generativelanguage.googleapis.com;"
  }
}
```

### API Key Security

- **Encrypted Storage**: API keys encrypted at rest
- **Memory Protection**: Keys cleared after use
- **Transmission Security**: HTTPS-only communication
- **Access Control**: Restricted to authorized contexts

## Performance Optimization

### Bundle Optimization

- **Tree Shaking**: Remove unused code
- **Code Splitting**: Lazy load components
- **Minification**: Compress production builds
- **Source Maps**: Debug-friendly development

### Runtime Performance

```javascript
class PerformanceTracker {
  trackActionPerformance(action, duration) {
    // Log performance metrics
    // Identify slow operations
    // Generate optimization recommendations
  }
  
  monitorMemoryUsage() {
    // Track memory consumption
    // Detect memory leaks
    // Implement cleanup strategies
  }
}
```

### Caching Strategy

- **Content Caching**: Cache processed content
- **API Response Caching**: Reduce duplicate requests
- **Configuration Caching**: Optimize settings access
- **TTL Management**: Automatic cache expiration

## Testing Strategy

### Unit Testing

```javascript
// Example test structure
describe('AIProviderOrchestrator', () => {
  it('should select optimal provider', async () => {
    const orchestrator = new AIProviderOrchestrator();
    const provider = await orchestrator.getOptimalProvider('summarization');
    expect(provider).toBeDefined();
    expect(provider.name).toMatch(/openai|anthropic|google/);
  });
});
```

### E2E Testing

```javascript
// Extension loading test
test('should load extension', async ({ page, context }) => {
  await page.goto('https://example.com');
  const serviceWorkers = await context.serviceWorkers();
  expect(serviceWorkers.length).toBeGreaterThan(0);
});
```

### Testing Tools

- **Vitest**: Unit and integration testing
- **Playwright**: E2E browser testing
- **Chrome DevTools**: Performance profiling
- **Coverage Reports**: Code coverage analysis

## Build System

### Development Build

```bash
npm run dev              # Start development server
npm run build:extension  # Build extension files
npm run watch           # Watch for changes
```

### Production Build

```bash
npm run build           # Full production build
npm run build:web       # Web interface build
npm run optimize        # Bundle optimization
```

### Build Configuration

- **Rollup**: Extension bundling
- **Vite**: Web interface building
- **TypeScript**: Type checking
- **PostCSS**: CSS processing

## Deployment

### Chrome Web Store

1. Build production version
2. Test in multiple environments
3. Create store listing assets
4. Submit for review
5. Monitor user feedback

### Development Installation

1. Clone repository
2. Install dependencies
3. Build extension
4. Load unpacked in Chrome
5. Test functionality

## Troubleshooting

### Common Issues

**Extension won't load**
- Check manifest.json syntax
- Verify file paths
- Review console errors

**API calls failing**
- Validate API keys
- Check network connectivity
- Review rate limits

**Performance issues**
- Profile memory usage
- Analyze bundle size
- Review caching strategy

### Debugging Tools

- **Chrome DevTools**: Extension inspection
- **Extension DevTools**: Service worker debugging
- **Network Panel**: API call monitoring
- **Performance Panel**: Runtime profiling

## Contributing

See [CONTRIBUTING.md](../CONTRIBUTING.md) for detailed contribution guidelines.

## Resources

- [Chrome Extension Documentation](https://developer.chrome.com/docs/extensions/)
- [Manifest V3 Migration Guide](https://developer.chrome.com/docs/extensions/migrating/)
- [Web Extension APIs](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions)
- [AI Provider Documentation](docs/AI_PROVIDERS.md)