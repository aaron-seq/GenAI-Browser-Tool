# Reading workspace reliability evidence

Delivery: [PR #39](https://github.com/aaron-seq/GenAI-Browser-Tool/pull/39),
[milestone 3](https://github.com/aaron-seq/GenAI-Browser-Tool/milestone/3).
Baseline: [d544b8e](https://github.com/aaron-seq/GenAI-Browser-Tool/commit/d544b8e7936e9e1959eb71bcc9ebbe6da2dce7b1),
which already includes main bd0e0f7 and the reading-interface changes.
The [checkpoint](product/PROJECT-STATUS.md) records remaining work.

## Requirements and regression evidence

| Issue                                                            | Behavior and regression oracle                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [#46](https://github.com/aaron-seq/GenAI-Browser-Tool/issues/46) | One worker writer queues initialize/update/reset; overlapping field/map edits survive. [Core](../tests/core/configuration-manager.test.js), [Options](../tests/options/settings.test.js), [router](../tests/integration/extension-workflow.test.js), and [two-context browser tests](../tests/e2e/settings-concurrency.spec.js) check ordering, failure recovery, final native storage and writer ownership. Popup changes save only the edited language; explicit swap saves both. |
| [#47](https://github.com/aaron-seq/GenAI-Browser-Tool/issues/47) | Delayed extraction/analysis/links successes and errors cannot populate an imported document. [Popup](../tests/popup/interface.test.js) and [browser races](../tests/e2e/workspace-races.spec.js) check the selected title, result panels and document context.                                                                                                                                                                                                                      |
| [#48](https://github.com/aaron-seq/GenAI-Browser-Tool/issues/48) | Old history cannot undo successful clear/new chat. Same-document summary restoration remains independent, and fresh summaries win. Tests check DOM, subsequent prompt history and actual cleared storage; a failed clear still permits restoration.                                                                                                                                                                                                                                 |
| [#49](https://github.com/aaron-seq/GenAI-Browser-Tool/issues/49) | [Mapper](../tests/core/concurrency.test.js)/worker tests hold sibling requests, fail the first, then release siblings: three calls stay three, with no merge/history save. Already-started calls may finish.                                                                                                                                                                                                                                                                        |
| [#50](https://github.com/aaron-seq/GenAI-Browser-Tool/issues/50) | Worker lifecycle tests preserve an existing scheduled time, create missing alarms and contain get/create failures while registering listeners synchronously. Timing/restarts are simulated, not a real 24-hour run.                                                                                                                                                                                                                                                                 |
| [#51](https://github.com/aaron-seq/GenAI-Browser-Tool/issues/51) | [Provider tests](../tests/providers/ai-client.test.js) delay 200/503/401 bodies past the deadline: terminal TIMEOUT and one call. Malformed success JSON is not retried as a network error.                                                                                                                                                                                                                                                                                         |
| [#52](https://github.com/aaron-seq/GenAI-Browser-Tool/issues/52) | [Extraction unit tests](../tests/content/extraction.test.js) and [real Chromium](../tests/e2e/extension-loading.spec.js) check hidden text, collapsed disclosures/ancestors, visible blocks/inline words and unchanged source HTML. Extraction-to-chunking preserves all 30 fixture paragraphs across two chunks.                                                                                                                                                                   |

The implementation sessions ran new failing regressions before their respective
fixes. Primary-session checks independently reproduced the UI races and reran
provider/worker suites. Fresh agent review caught shared-response summary restoration,
stale popup language payloads, collapsed disclosures and paragraph chunking gaps.
Each was reproduced, corrected, and rechecked, including actual Chromium diagnostics.
Agent review is not independent human approval.

## Validation — 2 November 2026

The primary session ran combined checks on source revision
[9c3db4b](https://github.com/aaron-seq/GenAI-Browser-Tool/commit/9c3db4b6c3793bc756d4ec6d2211dd5c520419c5),
followed by documentation-only updates. Environment: Windows, Node 22.18.0,
npm 11.6.2. Current-head hosted CI and ZIP inspection are recorded in the PR body.

| Command/check                                | Observed result                                                                                                                       |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run verify`                             | Lint/typecheck and 361 tests in 13 files pass.                                                                                        |
| `npm run test:coverage`                      | 361 pass; statements 95.01%, branches 85.16%, functions 95.60%, lines 97.02%. Existing floors retained.                               |
| `npm run test:e2e`                           | 33 real-Chromium cases pass, including UI keyboard/layout, settings, extraction and delayed-response flows.                           |
| `npm audit --json --audit-level=high`        | Exit 0; five moderate affected development packages, zero high/critical.                                                              |
| `npm pack --dry-run --json --ignore-scripts` | 25 files; no tests/docs/tooling/dependencies. Read-only reference check resolves 26 manifest/HTML/JS targets within that inventory.   |
| Visual inspection                            | Generated 320px light workspace, desktop dark Chat and populated source-excerpt views inspected; no clipping observed in those views. |

A primary-session native Node fetch diagnostic used a loopback server that sent
headers and an incomplete JSON body. With a 150ms deadline, statuses 200/503/401
returned TIMEOUT in 168/164/155ms, signal aborted, one request each despite retries
being enabled. Only the destination was substituted; no real provider/key was used.
This diagnostic is distinct from the committed fake-timer regressions and does not
establish live-provider quality or latency.

The fresh baseline audit reports five moderate affected development packages,
zero high/critical; [#54](https://github.com/aaron-seq/GenAI-Browser-Tool/issues/54)
tracks the published minimatch advisory. Passing `--audit-level=high` is not a clean
audit. This delivery changes no dependency, scanner configuration, permission,
provider/model default, storage schema, or deployed service.

Browser tests load the unpacked extension and intercept fixture/provider traffic;
the race harness delays delivery after the real worker responds. Two-context
settings tests hold writes but use native Chrome reads/persistence. No live-provider,
native-toolbar/OS notification, minimum-version, screen-reader, or real-book
quality/performance claim follows. The original interface verification and visual
decisions remain in [INTERFACE.md](product/INTERFACE.md).

Rollback reverts the combined PR and reloads the extension; no migration is needed.
That restores the defects, so it is a recovery option rather than a permanent fix.
