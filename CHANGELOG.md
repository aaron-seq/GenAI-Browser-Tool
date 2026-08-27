# Changelog

All notable changes to the GenAI Browser Tool project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [5.2.0]

Correctness and toolchain work. No change to what the extension does; several
changes to whether it does it reliably, and a large reduction in code that was
never reached.

### Fixed
- **Question validation returned a different answer each time it was called.**
  `isValidQuestion` was guarded by a filter holding `/gi` regexes as instance
  fields and testing them with `RegExp.prototype.test`, which advances
  `lastIndex` on a global regex. The same question was blocked, then allowed,
  then blocked, purely by call parity. The filter also rejected legitimate
  questions — `/on\w+\s*=/` matched "Is there only one=1 result?" and
  `/<iframe/` matched "What is the <iframe> for?" — while protecting nothing: a
  question is the user's own text, is never evaluated, and reaches the DOM only
  through `renderMarkdown`, which escapes. Removed; the length cap stays.
- **Export reported settings the user had never chosen.** `StorageService` held
  a second preferences system reading a `chrome.storage.local` key nothing ever
  wrote, so it always returned its own defaults — including
  `aiProvider: "chrome-ai"`, a provider removed in 5.0.0. The user's real
  configuration appeared nowhere in the exported file.
- **The exported file was double-encoded.** Export returned a JSON *string*
  which the popup then stringified again, so the download was a quoted string
  literal containing escaped JSON rather than a JSON document.
- **The coverage gate enforced nothing.** Thresholds were declared under a
  `thresholds.global` key, which is the c8 / Vitest 0.x shape; Vitest reads flat
  keys and ignored the object entirely. CI reported 63.78% against a 70%
  threshold and exited 0.
- **`npm run lint` linted zero files from a dotted checkout path.** eslintrc
  ignored anything whose path from the working directory crossed a
  dot-directory, so from a worktree the command exited 2 claiming every file was
  ignored. Fixed by the move to flat config.
- **The pre-commit hook never ran.** `prepare` pointed `core.hooksPath` at a
  `.husky` directory containing no hook files, so the `lint-staged` config was
  inert — and an empty hooks directory also disabled the developer's other hooks.
- Old history entries carrying no `timestamp` were silently deleted by the daily
  cleanup, because `undefined > cutoff` is false. They are now kept.
- A failed storage write during cleanup no longer runs on every alarm when there
  is nothing to remove.

### Removed
- The Rollup build. CI built `dist/` and then excluded it from the packaged zip,
  so nothing consumed the output; the manifest points at source files and Chrome
  loads ES modules natively in MV3. Removes seven devDependencies.
- Thirteen devDependencies in total, including six ESLint plugins that were
  installed but never referenced by any config.
- Eleven of the fourteen methods on `ValidationService`, all with zero callers.
  `validateApiKey`'s patterns were stale as well: `/^sk-[a-zA-Z0-9]{48,}$/` does
  not match a modern `sk-proj-` OpenAI key, so it warned on valid keys.
- Bookmark storage, import, and storage-usage reporting from `StorageService` —
  no UI, no message route, and no way to reach any of them. Import could not
  have read an export in any case.
- Two stylesheets no page loads: the root `popup.css` (the popup loads
  `styles/popup.css`) and `styles/content-overlay.css`.
- The `src/` tree, which held one file while a sibling `utils/` already existed.

### Changed
- Toolchain: ESLint 8 → 10 (flat config), Vitest 1 → 4, jsdom 23 → 29, husky
  8 → 9, lint-staged 15 → 16, Playwright 1.57 → 1.62, and the `@types` packages.
  `npm audit` goes from 24 vulnerabilities (2 critical, 17 high) to 0. All
  dev-only; the extension still ships zero runtime dependencies.
- Node 18 is no longer supported. It reached end of life in April 2025 and is
  below the floor of ESLint 10, Vitest 4, and jsdom 29. CI runs 20, 22, and 24.
- `crypto.randomUUID()` replaces a hand-rolled `Date.now()` + `Math.random()`
  id generator.

### Added
- Unit tests for the three DOM controllers that had none: `content.js` (0% →
  97.9%), `options.js` (0% → 96%), and the popup controller (6.6% → 88.1%). The
  popup tests drive the shipped `popup.html` rather than a fixture, so a renamed
  element id fails a test instead of passing one.
- Overall coverage 44.6% → 90.5% statements, 93.0% lines. Tests 128 → 205.

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