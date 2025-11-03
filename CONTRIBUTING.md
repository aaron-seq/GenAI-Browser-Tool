# Contributing to GenAI Browser Tool

Thank you for your interest in contributing to the GenAI Browser Tool project. This document provides comprehensive guidelines for contributing to ensure high-quality, maintainable code and a positive collaborative environment.

## Development Environment Setup

### Prerequisites

- **Node.js**: Version 18.0.0 or higher
- **npm**: Version 9.0.0 or higher
- **Git**: Latest stable version
- **Chrome/Edge**: For extension testing (Version 88+)

### Initial Setup

1. **Fork and Clone**
   ```bash
   git clone https://github.com/[your-username]/GenAI-Browser-Tool.git
   cd GenAI-Browser-Tool
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Environment Configuration**
   ```bash
   cp .env.example .env
   # Configure your API keys and settings
   ```

4. **Build Extension**
   ```bash
   npm run build:extension
   ```

5. **Load Extension in Browser**
   - Open Chrome/Edge and navigate to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked" and select the project directory

## Development Workflow

### Branch Naming Conventions

- **Feature branches**: `feature/description-of-feature`
- **Bug fixes**: `fix/description-of-bug`
- **Documentation**: `docs/description-of-changes`
- **Refactoring**: `refactor/description-of-refactor`
- **Testing**: `test/description-of-test-changes`

### Commit Message Guidelines

Follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
type(scope): description

[optional body]

[optional footer]
```

**Types**:
- `feat`: New feature implementation
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, missing semicolons, etc.)
- `refactor`: Code refactoring without functional changes
- `perf`: Performance improvements
- `test`: Adding or updating tests
- `chore`: Build process or auxiliary tool changes

**Examples**:
```
feat(ai-providers): add Claude 3.5 Sonnet support
fix(content-extraction): handle edge cases in DOM parsing
docs(contributing): update development setup instructions
```

## Code Quality Standards

### JavaScript/TypeScript Guidelines

1. **ESLint Configuration**: Follow the existing `.eslintrc.json` rules
2. **Prettier Formatting**: Code must pass `npm run format`
3. **Type Safety**: Use TypeScript interfaces and proper typing
4. **Error Handling**: Implement comprehensive error handling with try-catch blocks
5. **Security**: Validate all user inputs and sanitize data

### Code Style Requirements

```javascript
// Use modern ES6+ syntax
const processContent = async (content) => {
  try {
    const result = await aiProvider.process(content);
    return { success: true, data: result };
  } catch (error) {
    logger.error('Content processing failed', error);
    throw new ProcessingError('Failed to process content', error);
  }
};

// Proper JSDoc documentation
/**
 * Processes content using AI provider
 * @param {string} content - The content to process
 * @returns {Promise<ProcessingResult>} Processing result
 * @throws {ProcessingError} When processing fails
 */
```

### File Structure Guidelines

```
src/
├── background/          # Service worker files
├── content/            # Content scripts
├── popup/              # Extension popup interface
├── options/            # Settings and configuration
├── core/               # Core functionality modules
├── services/           # Service classes
├── utils/              # Utility functions
├── providers/          # AI provider implementations
├── styles/             # CSS and styling
└── tests/              # Test files
```

## Testing Requirements

### Unit Tests

- Write tests for all new functionality using Vitest
- Maintain minimum 80% code coverage
- Test both success and failure scenarios

```javascript
// Example test structure
import { describe, it, expect, vi } from 'vitest';
import { ContentProcessor } from '../src/services/content-processor.js';

describe('ContentProcessor', () => {
  it('should process content successfully', async () => {
    const processor = new ContentProcessor();
    const result = await processor.process('test content');
    
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
  });

  it('should handle processing errors gracefully', async () => {
    const processor = new ContentProcessor();
    vi.spyOn(processor, 'callAI').mockRejectedValue(new Error('API Error'));
    
    await expect(processor.process('test')).rejects.toThrow('Processing failed');
  });
});
```

### End-to-End Tests

- Use Playwright for browser extension testing
- Test critical user workflows
- Verify extension functionality across Chrome and Edge

### Running Tests

```bash
# Unit tests
npm test

# E2E tests
npm run test:e2e

# Coverage report
npm run test:coverage
```

## Security Guidelines

### Input Validation

```javascript
import { z } from 'zod';
import DOMPurify from 'dompurify';

// Schema validation
const UserInputSchema = z.object({
  content: z.string().min(1).max(10000),
  type: z.enum(['summarize', 'translate', 'analyze'])
});

// Sanitization
const sanitizeHtml = (html) => {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'em'],
    ALLOWED_ATTR: []
  });
};
```

### API Key Management

- Never commit API keys to version control
- Use Chrome storage API for secure key storage
- Implement key rotation mechanisms
- Validate API responses before processing

## Pull Request Process

### Before Submitting

1. **Code Quality Checks**
   ```bash
   npm run lint
   npm run format
   npm run typecheck
   npm test
   ```

2. **Manual Testing**
   - Test extension functionality in Chrome/Edge
   - Verify all features work as expected
   - Test error scenarios and edge cases

3. **Documentation Updates**
   - Update README.md if adding new features
   - Add JSDoc comments for new functions
   - Update CHANGELOG.md with your changes

### Pull Request Template

```markdown
## Description
Brief description of changes made

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
- [ ] Unit tests pass
- [ ] E2E tests pass
- [ ] Manual testing completed
- [ ] Cross-browser compatibility verified

## Screenshots
[Include screenshots for UI changes]

## Checklist
- [ ] Code follows project style guidelines
- [ ] Self-review completed
- [ ] Documentation updated
- [ ] Tests added/updated
- [ ] No breaking changes (or breaking changes documented)
```

### Review Process

1. **Automated Checks**: All CI checks must pass
2. **Code Review**: At least one maintainer review required
3. **Testing**: Reviewer will test functionality
4. **Approval**: Changes approved by maintainer
5. **Merge**: Squash and merge to main branch

## Release Process

### Version Numbering

We follow [Semantic Versioning](https://semver.org/):
- **MAJOR**: Breaking changes
- **MINOR**: New features (backward compatible)
- **PATCH**: Bug fixes (backward compatible)

### Release Checklist

1. Update version in `package.json` and `manifest.json`
2. Update `CHANGELOG.md` with release notes
3. Create release branch: `release/v[version]`
4. Run full test suite
5. Create GitHub release with changelog
6. Deploy to Chrome Web Store (maintainers only)

## Getting Help

### Communication Channels

- **Issues**: Use GitHub Issues for bug reports and feature requests
- **Discussions**: Use GitHub Discussions for questions and ideas
- **Email**: Contact maintainers directly for security issues

### Issue Templates

When creating issues, use the appropriate template:
- **Bug Report**: Include steps to reproduce, expected behavior, and environment details
- **Feature Request**: Describe the problem and proposed solution
- **Documentation**: Specify what documentation needs improvement

### Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](https://www.contributor-covenant.org/version/2/1/code_of_conduct/). Please read and follow these guidelines to ensure a welcoming environment for all contributors.

## Performance Guidelines

### Extension Performance

- Minimize memory usage in content scripts
- Use efficient DOM manipulation techniques
- Implement proper cleanup in service workers
- Optimize API calls with caching and debouncing

### AI Provider Integration

- Implement proper error handling and retries
- Use streaming responses for large content
- Cache frequently requested content
- Implement rate limiting to prevent API abuse

## Deployment Guidelines

### Environment Configuration

```javascript
// config/environments.js
export const environments = {
  development: {
    apiTimeout: 10000,
    logLevel: 'debug',
    enableAnalytics: false
  },
  production: {
    apiTimeout: 5000,
    logLevel: 'error',
    enableAnalytics: true
  }
};
```

### Build Optimization

- Minimize bundle size using tree shaking
- Optimize images and assets
- Use compression for production builds
- Implement proper source maps for debugging

Thank you for contributing to GenAI Browser Tool. Your contributions help make this project better for everyone.