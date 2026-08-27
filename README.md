# GenAI Browser Tool

A Chrome extension that summarizes, questions, translates, and analyses the page
you are on, using an AI provider and API key **you** supply.

Page text goes from your browser directly to the provider you configured. There
is no backend, no telemetry, and no third party in between.

---

## What it actually does

| Feature | Where | How it works |
| --- | --- | --- |
| Page summary | Popup → Summary | Four styles (key points, TL;DR, executive, technical) × four lengths. Long pages are summarized in sections — see below |
| Ask about the page | Popup → Chat | Grounded in the extracted page text, with the last few turns as context |
| Translate | Popup → Translate | Whole page or first 2,000 characters, with an optional source language |
| Sentiment | Popup → Analyze | A label plus a one-line reason |
| Key insights | Popup → Analyze | Up to seven bullet points |
| Entities | Popup → Analyze | People, organizations, places, products, dates |
| Smart tags | Popup → Analyze | 3–8 topic tags |
| Readability | Popup → Analyze | Flesch reading ease — computed locally, no API call |
| Page stats | Popup → Tools | Word/character/heading counts and read time, computed locally |
| Extract links | Popup → Tools | Read from the DOM, no API call |
| Export | Popup → Tools | Downloads saved summaries and chats as JSON |
| Right-click actions | Any page | Summarize / explain / translate / sentiment on a selection; summarize, insights, or tags on the page |
| `Ctrl+Shift+S` | Any page | Summarize the current page |

### Long pages

A page that exceeds 24,000 characters no longer gets silently truncated. It is
split on paragraph boundaries into sections, each summarized in its own request,
and the notes are merged into one summary — map-reduce, costing one request per
section plus one to merge.

This is capped at **8 sections (~192,000 characters, so 9 requests)** so a single
click cannot run away with your API budget. The popup always states the coverage
it achieved:

| What you see | Meaning |
| --- | --- |
| `Whole page` | Fit in one request |
| `Whole page, summarized across 4 sections` | Split, nothing dropped |
| `Very long page — summarized the first 8 sections, 51,000 characters not included` | Hit the cap |

Sections are summarized a few at a time rather than all at once — eight
simultaneous requests is a reliable way to trip a per-minute rate limit and fail
the very long pages the feature exists for.

Chat, translation, and the analysis actions still use a single request and
truncate at 24,000 characters. Chat says so in the thread the first time it
happens, so an answer drawn from part of a page never looks exhaustive.

### When a request fails

Transient failures — `429`, `500`, `502`, `503`, `504`, `529`, and network blips
— are retried twice with exponential backoff and jitter, honouring the
provider's `Retry-After` header when it sends one.

Errors that mean *this request is wrong* are **not** retried: `400`, `401`,
`403`, `404`. Retrying those burns quota and delays the message you need to see.
Timeouts are not retried either, since the request may still be running on the
provider's side and a retry risks paying for the same work twice.

If a section still fails after retries, the whole summary fails with the
provider's own message. A partial summary presented as complete would be worse
than an error.

### What it deliberately does not do

- **No on-device AI.** Chrome's built-in AI (`Summarizer`, `LanguageModel`) is
  not available in extension service workers, which is where this extension's AI
  calls run. Supporting it would mean routing every request through an offscreen
  document — tracked as follow-up work, not shipped.
- **No page modification.** The content script only reads.
- **No agentic browsing.** It does not click, type, or navigate for you.
- **Nothing without a key.** With no API key configured, AI actions report
  "no API key configured" rather than returning a fabricated answer.

---

## Install and run locally

```bash
git clone https://github.com/aaron-seq/GenAI-Browser-Tool.git
cd GenAI-Browser-Tool
npm ci
```

Load it in Chrome:

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** and select the **repository root** (not `dist/`)
4. The options page opens on first install — pick a provider and paste an API key

The repository root is the loadable extension: `manifest.json` references the
source files directly, and Chrome loads ES modules natively in MV3 service
workers, so **no build step is required for development**.

`npm run build` writes bundled, minified copies to `dist/` for packaging. There is
no `dist/manifest.json`, so `dist/` is not loadable on its own.

### Configuration

Everything is configured on the extension's options page. There is no `.env`
file — the extension reads nothing from the filesystem at runtime.

| Provider | Default model | Get a key |
| --- | --- | --- |
| Anthropic Claude | `claude-opus-5` | <https://console.anthropic.com> |
| OpenAI | `gpt-4o-mini` | <https://platform.openai.com/api-keys> |
| Google Gemini | `gemini-2.5-flash` | <https://aistudio.google.com/app/apikey> |

Model names are overridable per provider on the options page — useful when a
provider ships a newer model than the default here.

### Commands

| Command | What it does |
| --- | --- |
| `npm test` | Unit and integration tests (Vitest) |
| `npm run test:watch` | Tests in watch mode |
| `npm run test:coverage` | Coverage report |
| `npm run typecheck` | `tsc --noEmit` over the shipped source |
| `npm run lint` | ESLint |
| `npm run verify` | lint + typecheck + test |
| `npm run build` | Bundle to `dist/` |
| `npm run test:e2e` | Loads the extension into real Chrome and drives it (see below) |

### End-to-end tests

`npm run test:e2e` launches real Chrome with this repository loaded as an
unpacked extension and exercises it through its own APIs: manifest validity,
service-worker registration, options-page rendering and key persistence, content
script extraction, the popup → background → content-script message path, and the
missing-key, auth-error, and restricted-page failure paths.

No API key and no network access are required — provider calls and the fixture
page are both intercepted. First run needs `npx playwright install chromium`.

One path is not automatable: Chrome grants the `activeTab` permission only on a
real toolbar-icon click, which Playwright cannot perform because the icon lives
in browser chrome. The tests therefore pass the tab id explicitly, exactly as the
popup does. Clicking the icon and summarizing a page is still worth doing by hand
after changing the popup's tab handling.

---

## Architecture

```
popup.html ─┐
options.html├─► chrome.runtime.sendMessage ─► background.js (service worker)
            │                                       │
content.js ─┘◄──── chrome.tabs.sendMessage ─────────┤
                                                    ▼
                                     core/configuration-manager.js
                                                    │  builds a client for the
                                                    ▼  provider you selected
                                     providers/ai-client.js ──► provider HTTPS API
                                                    ▲
                                     core/tasks.js (prompt construction)
```

| Path | Responsibility |
| --- | --- |
| `background.js` | Message router. Owns every AI call, context menu, and command. |
| `providers/ai-client.js` | One fetch client, shaped per provider. The only file that knows an API's wire format. |
| `core/tasks.js` | Prompt construction and response parsing for all seven tasks. |
| `core/configuration-manager.js` | Single source of truth for settings; builds the AI client. |
| `content.js` | Read-only DOM extraction. |
| `scripts/popup-main.js` | Popup UI. |
| `options.js` | Settings UI. |
| `services/storage-service.js` | Local history, bookmarks, export/import. |
| `src/utils/validation-service.js` | Message and input validation. |

### Design decisions

**One provider, chosen explicitly.** An earlier version scored five providers on
a health and latency heuristic and load-balanced between them. Four of those five
returned hardcoded stub strings, so the "winner" was usually a fake. Provider
choice is now the user's, and an unconfigured provider is an error rather than a
silent substitution.

**Prompts treat page content as data.** Extracted text is fenced in
`<<<PAGE_CONTENT>>>` markers, and every system prompt states that the fenced
region is untrusted data whose instructions must not be followed. See
[docs/SECURITY.md](docs/SECURITY.md).

**Failures are visible.** Every error carries a code (`MISSING_API_KEY`,
`AUTH_ERROR`, `CONTENT_SCRIPT_UNAVAILABLE`, `TIMEOUT`, …) and reaches the UI as
text. Nothing degrades into a plausible-looking fake result.

---

## Permissions

| Permission | Why |
| --- | --- |
| `storage` | Save settings, API keys, and local history |
| `activeTab` | Read the page you explicitly act on |
| `contextMenus` | Right-click actions |
| `notifications` | Show the result of a right-click action |
| `alarms` | Daily cleanup of old local history |
| `host_permissions` (3 API hosts) | Send requests to the provider you chose |

The content script matches `http://*/*` and `https://*/*` because summarizing a
page requires reading it. It has no network access of its own.

---

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| "No API key configured" | Open the options page and add a key for the selected provider |
| "Cannot read this page" | Content scripts cannot run on `chrome://` pages, the Chrome Web Store, or PDFs |
| "returned 401" | The key is wrong, revoked, or belongs to a different provider |
| "returned 429" | Rate limit, still hit after two retries — wait, or lower the request rate |
| "…characters not included" | Page exceeded the 8-section cap; see [Long pages](#long-pages) |
| A long page costs several requests | Expected — one per section plus one merge |
| Popup unchanged after an edit | Reload the extension at `chrome://extensions`, then reopen the popup |

Extension logs: `chrome://extensions` → **service worker** link under this
extension opens the background console.

---

## Known limitations

- Summarization handles long pages by sectioning, but chat, translation, and the
  analysis actions still truncate at 24,000 characters.
- Pages beyond ~192,000 characters are summarized only up to the 8-section cap.
- Only the primary content container is extracted; heavily JavaScript-rendered or
  shadow-DOM pages may yield little text.
- Multi-tab comparison and cross-page reasoning are not implemented.
- Chat history lives in popup memory and is lost when the popup closes. Saved
  summaries and completed exchanges do persist to local storage.
- API keys are stored in `chrome.storage.sync`, which is not an encrypted secret
  store. See [docs/SECURITY.md](docs/SECURITY.md).
- Chrome only. There is no Firefox or Edge build.
- Not published to the Chrome Web Store; install unpacked.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Run `npm run verify` before opening a PR.

Questions and bugs: <https://github.com/aaron-seq/GenAI-Browser-Tool/issues>

## License

MIT — see [LICENSE](LICENSE).
