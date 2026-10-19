# GenAI Browser Tool

Read a page, ask questions with source passages, and turn the material into a
study guide or a quiz. A Chrome 116+ extension using the AI provider and API key
you choose. Page text goes directly to that provider; there is no application
server or telemetry.

![Learning workspace with a question and its source passage](docs/product/images/learning-workspace.png)

The screenshot is from an automated browser test with an intercepted AI response.
It demonstrates the interface, not live model quality.

## Start here

```bash
git clone https://github.com/aaron-seq/GenAI-Browser-Tool.git
cd GenAI-Browser-Tool
npm ci
```

1. Open `chrome://extensions`, enable **Developer mode**, and choose **Load
   unpacked** → the repository root. No build step is needed.
2. In options, select a provider and enter its API key. **Test connection** sends
   one small request using the entered key and model. Settings save automatically
   when a field changes; connection testing is optional.
3. Open an article and click the extension. Check the word count and page title,
   then generate a summary or ask a question.
4. Choose **Open workspace** for a full-page reading area that stays open. You can
   also import a UTF-8 `.txt` or `.md` document there. Importing sends no AI request.
5. Use **Make a study guide** or **Quiz me** in Chat, then ask follow-up questions.
   Expand the sources to check the evidence used for each answer.

Development needs Node >=20.19 and npm >=10. The extension ships no runtime
dependencies. It is currently installed unpacked, not published in the Web Store.

## What works

| Action                 | Behavior                                                                                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Summary                | Key points, TL;DR, executive, or technical; four lengths. Matching saved results are reused without another provider call.                                    |
| Chat and study prompts | Search passages across the extracted document, send up to six passages to the model, and show their source labels and excerpts.                               |
| Remember this document | Restore the latest summary and up to 30 completed exchanges for the same URL and unchanged text. **Clear this chat** deletes that document's saved exchanges. |
| Import text            | Workspace accepts `.txt`/`.md`, up to 2,000,000 characters and 8 MB. Reimporting the same filename and text restores its thread.                              |
| Translate              | Choose source and target languages; preferences persist. Translate the page or an opening excerpt.                                                            |
| Analyze                | Sentiment, insights, entities, and topic tags; local readability score.                                                                                       |
| Tools                  | Local word counts, reading time, headings, links, and JSON export of saved history/settings without API keys.                                                 |
| Quick actions          | Right-click a selection/page; `Ctrl+Shift+S` (`Command+Shift+S` on Mac) requests a quick page summary.                                                        |

### Long documents and speed

Chat uses local **BM25 keyword retrieval** over the document, including its end.
The displayed passage count shows how much evidence reached the model. Broad
questions without matching words use representative passages from across the
document. This is retrieval followed by generation, not model training. Synonyms,
some languages, and questions requiring all chapters can exceed its recall.

Summaries process up to **eight sections of at most 24,000 characters**, with up
to three section requests in flight and one final merge: at most nine requests
before retries. Coverage is displayed, including any text omitted. A matching
summary cache includes the document, provider, model, style, and length.

Translation, other AI analyses, and quick context-menu actions still use the
first 24,000 characters. Popup translation/analysis reports partial coverage.
The quick notification actions are best for short text; use the Summary tab for
sectioned long-page summaries. Remaining long-task work is tracked in
[#17](https://github.com/aaron-seq/GenAI-Browser-Tool/issues/17).

AI response time depends on your provider, model, network, and document. The
[local benchmark](docs/product/RESEARCH.md#performance-evidence) measures retrieval
only; it does not establish instant book comprehension. PDF, EPUB, scanned books,
and OCR are [planned separately (#26)](https://github.com/aaron-seq/GenAI-Browser-Tool/issues/26).

## Providers and privacy

| Provider  | Default model           | Key                                                 |
| --------- | ----------------------- | --------------------------------------------------- |
| Anthropic | `claude-haiku-5-5`      | [Claude Console](https://console.anthropic.com)     |
| OpenAI    | `gpt-6-luna`            | [API keys](https://platform.openai.com/api-keys)    |
| Google    | `gemini-3.5-flash-lite` | [AI Studio](https://aistudio.google.com/app/apikey) |

Model IDs are configurable. Defaults were checked against official documentation;
live account access, cost, latency, and answer quality have not been measured.
See [provider evidence and selection](docs/product/RESEARCH.md#provider-selection).
AI actions require your key and may incur provider charges. Connection testing
does not gate saving; without a key, local extraction/statistics still work.

API keys are in `chrome.storage.sync`, which is not an encrypted secret store.
History is local to the browser profile: at most 1,000 summaries and 500 completed
exchanges, with daily cleanup of entries older than 90 days. **Save history** in
options disables new saves, cache reuse, and thread restoration. It does not erase
existing records; clear a document's chat before disabling it if needed. Imported
full documents and retrieval indexes are not persisted, but saved answers and
source excerpts may contain sensitive text. JSON export includes saved material.
If local storage fills, the generated result stays visible with a save warning;
copy it before closing the tab.
See [security and data handling](docs/SECURITY.md).

An optional private semantic retrieval service is being researched in
[#27](https://github.com/aaron-seq/GenAI-Browser-Tool/issues/27). No backend, local
model, or semantic embedding service is installed by this release.

Known settings gap: the context-menu and desktop-notification toggles are saved
but currently ignored by the worker. This is tracked in
[#31](https://github.com/aaron-seq/GenAI-Browser-Tool/issues/31).

## Troubleshooting

| Symptom                             | Next step                                                                                                                           |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| No API key / 401 / 403              | Check the selected provider, key, model access, and **Test connection** in options.                                                 |
| 429 / provider unavailable          | Check provider quota; transient failures retry twice. Authentication/configuration errors and timeouts are not retried.             |
| Cannot read a page                  | Browser pages, the Web Store, and PDF viewers are restricted. Dynamic pages may require reloading after the extension is installed. |
| Changed page starts a new chat      | Expected: text and URL identify a document, so another version cannot inherit unrelated answers.                                    |
| Summary is incomplete               | Read the coverage notice. Documents over the eight-section cap need smaller parts.                                                  |
| Changes are missing after an update | Reload at `chrome://extensions`, then reopen the popup/workspace.                                                                   |

## Develop and contribute

```bash
npm run verify
npm run test:coverage
npx playwright install chromium
npm run test:e2e
npm audit --audit-level=high
npm run benchmark:retrieval
```

Browser tests load the actual extension and intercept provider requests; no real
API key is required. CI checks Node 20/22/24, browser behavior, and an explicitly
allowlisted runtime ZIP. See [development](docs/DEVELOPMENT.md) and
[contributing](CONTRIBUTING.md).

The dedicated [product brief](docs/product/PRODUCT.md) records the goal, delivered
behavior, and next steps. Supporting research and verification are in
[RESEARCH.md](docs/product/RESEARCH.md); the supplied instructions are preserved
in [ENGINEERING-BRIEF.md](docs/product/ENGINEERING-BRIEF.md).

Issues: [GitHub](https://github.com/aaron-seq/GenAI-Browser-Tool/issues).
License: [MIT](LICENSE).
