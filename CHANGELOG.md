# Changelog

All notable changes to the GenAI Browser Tool project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed
- **The coverage gate enforced nothing.** Thresholds were nested under a
  `global` key — the Jest shape. Vitest reads them flat and treated `global` as
  a glob matching no file, so `test:coverage` reported success while the suite
  sat below the 70% it claimed to require. Now flat, enforced, and set to the
  level the suite actually holds.
- Coverage now reports on every shipped source file (`all: true`). Files no test
  imported were previously absent from the table entirely, which read as "fine"
  rather than "uncovered".

### Added
- Unit tests for the three DOM controllers that had no unit coverage at all:
  `content.js` 0% → 96%, `options.js` 0% → 99%, `scripts/popup-main.js`
  33% → 84%. Overall 63% → 84%.
- A regression guard asserting `content.js` stays free of ESM syntax. A
  declarative MV3 content script is a *classic* script, so an `export` there is
  a parse error that silently stops all extraction — caught previously only by
  a full browser launch, now in a millisecond.
- Tests for `utils/logger.js` level filtering (0 → 100%).

## [5.1.0]

### Added
- **Automatic retry on transient provider failures.** `429`, `5xx`, and network
  blips are retried twice with exponential backoff and jitter, honouring
  `Retry-After`. Errors meaning the request itself is wrong (`400`, `401`,
  `403`, `404`) are never retried — that burns quota and delays the message the
  user needs. Timeouts are not retried either, since the request may still be
  running provider side.

  This became necessary because of chunking below: turning one request into up
  to nine meant a single transient failure discarded every section that had
  already succeeded.
- **Bounded section concurrency.** Sections are summarized three at a time
  rather than all at once. Firing eight simultaneous requests is a reliable way
  to trip the per-minute rate limit and fail exactly the long pages the feature
  exists for.
- Chat now states, once per session, when a page is too long to fit a single
  request, so an answer drawn from part of a page never looks exhaustive.
- **Chunked summarization.** Pages over 24,000 characters are split on paragraph
  boundaries, summarized section by section, and merged into one summary instead
  of being silently truncated. Capped at 8 sections (9 requests) so one click
  cannot run away with an API budget; the popup always states the coverage it
  achieved.
- Entity extraction is now reachable from the Analyze tab. The backend action
  existed but no button called it.
- Translation honours the "From" language selector, which was previously only
  used by the swap button and never sent to the provider.

### Fixed
- The popup ignored saved preferences. Summary style, summary length, target
  language, and theme were stored by the options page but never applied, so
  changing them appeared to do nothing.
- Theme choice is now persisted rather than reset on every popup open.

### Removed
- Four controls with no handler behind them: "Save Summary", "Speak", "Create
  Bookmark", and the "Preserve formatting" checkbox. Summaries are already saved
  to history automatically when generated.

## [5.0.0]

Makes the extension actually perform AI work. Prior versions shipped stub
providers that returned hardcoded strings.

### Fixed
- **AI calls returned hardcoded stubs.** Four of five providers
  (`anthropic`, `gemini`, `cohere`, `chrome-ai`) returned literal strings such as
  `"Anthropic Summary Stub"`. Because they all reported `isAvailable() === true`,
  the orchestrator's load balancer usually selected a stub over the one real
  provider, so a configured user still received fake output.
- **API keys were written and read from different storage keys.** The options
  page saved to `user_preferences.apiKeys.openai`; the OpenAI provider read
  `chrome.storage.sync.get(['openai_api_key'])`. A correctly entered key was
  never found, so the only real provider always failed authentication.
- **Every popup-initiated page extraction failed.** `EXTRACT_PAGE_CONTENT` read
  `sender.tab?.id`, which is `undefined` for messages from a popup, and ignored
  the `tabId` the popup supplied — so it always threw "No active tab".
- **The options page crashed on load.** It read `settings.features.smartBookmarks`
  and set `.checked` on a provider radio that did not exist in the markup;
  `defaultSettings` had no `features` key. Both threw `TypeError`.
- **`npm run build` failed.** `build:web` ran `vite build` against a `web/`
  directory that does not exist in the repository.
- **Notifications never appeared.** `iconUrl: 'icon.png'` does not resolve to a
  packaged file, so Chrome silently dropped every notification.
- The content script injected `popup.css` into every page visited.
- `manifest.json` declared an `offscreen` key, which is not a manifest key —
  offscreen documents are created via `chrome.offscreen.createDocument()`, which
  was never called. The offscreen document was dead code.

### Changed
- Replaced five provider classes, the scoring orchestrator, and the load balancer
  (~350 lines) with one 190-line `providers/ai-client.js`. Provider choice is now
  the user's explicit setting; an unconfigured provider is a `MISSING_API_KEY`
  error rather than a silent substitution.
- Prompt construction moved to `core/tasks.js`, which fences page content in
  `<<<PAGE_CONTENT>>>` markers and instructs the model to treat it as untrusted
  data — a prompt-injection mitigation that did not previously exist.
- All errors now carry a machine-readable code and reach the UI as text.
- Dropped `tabs`, `bookmarks`, `history`, `scripting`, and `offscreen`
  permissions, and the Cohere and HuggingFace host permissions.
- Typecheck now covers the shipped source and reports zero errors (was 285).

### Added
- Real implementations for translation, sentiment, key insights, smart tags, and
  entity extraction — previously stubs returning `{}` or a success toast.
- Locally computed readability (Flesch) and page statistics — no API call.
- `GET_PROVIDER_STATUS` action and a popup badge showing whether a key is set.
- 84 tests (was 27), covering provider request shaping, auth and network failure
  modes, prompt injection defences, output escaping, and the message router.
- `npm run verify` (lint + typecheck + test).

### Removed
- Zero runtime dependencies: all ten were unused
  (`dompurify`, `zod`, `marked`, `idb`, `validator`, `ai`, `@ai-sdk/*`,
  `@google-ai/generativelanguage`). Vulnerabilities dropped from 49 to 23, all
  in dev tooling.
- Dead duplicates: `popup.js`, `content-scripts/content-main.js`, `src/popup/`,
  `src/services/`, `src/ui/`, `src/utils/event-manager.js`,
  `src/utils/error-handler.js`, `services/ai-service.js`,
  `services/content-extractor.js`, `services/analytics-tracker.js`.
- `vercel.json`, `railway.toml`, `render.yaml`, `vite.config.js`,
  `rollup.config.js`, `.env.example`, `test_results.txt` — deployment and build
  config for a web app this repository does not contain.

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