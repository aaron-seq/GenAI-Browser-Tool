# Changelog

All notable changes to the GenAI Browser Tool project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Comprehensive build system with rollup extension configuration
- MIT LICENSE file for legal compliance
- Comprehensive CONTRIBUTING.md with development guidelines
- Complete test framework with Vitest and Playwright
- Extension icons in all required sizes (16x16, 32x32, 48x48, 128x128)
- Environment configuration template (.env.example)
- GitHub pull request template
- Comprehensive test coverage for core functionality

### Fixed
- Manifest file paths corrected to match actual file structure
- Background service worker path updated for proper loading
- Content script paths aligned with project structure
- Extension icons now exist and are properly referenced
- Content Security Policy strengthened for better security

### Changed
- Improved development workflow with proper build configuration
- Enhanced security validation and input sanitization
- Updated project structure for better maintainability

### Security
- Strengthened Content Security Policy
- Added comprehensive input validation and sanitization
- Improved API key handling and storage security

## [4.1.0] - 2024-11-03

### Added
- Multi-provider AI support (OpenAI, Anthropic, Google Gemini)
- Advanced content summarization with customizable options
- Contextual Q&A functionality
- Translation capabilities
- Sentiment analysis features
- Smart bookmarking with AI-generated metadata
- Context menu integration for quick actions
- Keyboard shortcuts for common operations
- Comprehensive error handling and logging
- Analytics tracking for performance monitoring

### Security
- Content Security Policy implementation
- Input validation and sanitization
- Secure API key storage

## [4.0.0] - Previous Release

### Added
- Initial extension architecture
- Basic AI provider integration
- Popup interface
- Options page
- Background service worker
- Content scripts

---

## Release Guidelines

### Version Numbering
- **MAJOR**: Breaking changes that require user action
- **MINOR**: New features that are backward compatible
- **PATCH**: Bug fixes that are backward compatible

### Change Categories
- **Added**: New features
- **Changed**: Changes in existing functionality
- **Deprecated**: Soon-to-be removed features
- **Removed**: Removed features
- **Fixed**: Bug fixes
- **Security**: Security improvements

### Release Process
1. Update version in package.json and manifest.json
2. Update CHANGELOG.md with release notes
3. Create release branch
4. Run full test suite
5. Create GitHub release
6. Deploy to Chrome Web Store (maintainers only)