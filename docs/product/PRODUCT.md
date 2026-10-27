# Reading and learning workspace

Updated 27 October 2026 for version 5.3.0. This is the maintained product brief;
the [supplied engineering brief](ENGINEERING-BRIEF.md) is preserved separately.

## Objective

Help a reader understand a long page or text document, check the evidence behind
an answer, and keep learning through follow-up questions. Make extraction and
repeat work fast without representing sampled evidence as complete understanding.

## Delivered behavior

- A persistent full-page workspace, page readiness/outline, and text/Markdown
  import up to 2,000,000 characters.
- Local passage retrieval across the document for chat, visible sources, and
  study-guide/quiz prompts. No remote index or training is needed.
- Document-specific restored chats, a clear-chat control, and cached summaries
  keyed by content, provider, model, style, and length.
- Persisted language selection, explicit coverage notices, and optional provider
  connection tests using the entered configuration.

[README](../../README.md) explains installation and use. [Browser tests](../../tests/e2e/learning-workspace.spec.js)
demonstrate these flows with intercepted provider responses. They do not prove
live model answer quality. The [research and verification record](RESEARCH.md)
contains the comparison, technical decisions, measurements, and evidence gaps.

## Decisions and limits

Keep the extension dependency-free at runtime. Use the existing worker and an
optional full-page tab; no new permission or deployed service is required.
Local BM25 retrieval supplies up to six passages, not exhaustive book coverage.
Summary processing still caps at eight sections; translation and other analyses
retain a disclosed 24,000-character limit. API generation still requires a user key.

The direction borrows page-context assistance and a persistent reading surface
from [Perplexity Comet's documented experience](https://www.perplexity.ai/comet/gettingstarted).
This comparison is based on its documentation, not a hands-on latency or quality test.

## Next steps and material gaps

[Cleanup #35](https://github.com/aaron-seq/GenAI-Browser-Tool/issues/35) corrects
contribution examples and consolidates documentation/packaging. Current delivery
and validation are linked from the [checkpoint](PROJECT-STATUS.md).

The [settings-failure milestone](https://github.com/aaron-seq/GenAI-Browser-Tool/milestone/1)
protects saved privacy choices and recovery without adding a backend or permission.
Its implementation merged through [PR #42](https://github.com/aaron-seq/GenAI-Browser-Tool/pull/42);
see the [checkpoint](PROJECT-STATUS.md)
and [verification record](../security-testing-evidence.md). The separate
[reading-interface draft #39](https://github.com/aaron-seq/GenAI-Browser-Tool/pull/39)
also awaits review. The [private dashboard](https://github.com/users/aaron-seq/projects/6)
tracks both without counting an issue and its PR as separate outcomes.

CI action and runner validation is delivered through
[PR #43 / issue #32](https://github.com/aaron-seq/GenAI-Browser-Tool/issues/32),
under [milestone 2](https://github.com/aaron-seq/GenAI-Browser-Tool/milestone/2).
It exercises the privacy fix with updated CI actions; application behavior and
runtime dependencies are unchanged by that milestone.
Remaining verification work: [native menu/shortcut entry points (#40)](https://github.com/aaron-seq/GenAI-Browser-Tool/issues/40),
[repository scanning (#41)](https://github.com/aaron-seq/GenAI-Browser-Tool/issues/41),
with the delivery state recorded in the checkpoint.

| Work                                                                                          | Completion condition                                                                                                          |
| --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| [Long translation/analysis (#17)](https://github.com/aaron-seq/GenAI-Browser-Tool/issues/17)  | Whole-document processing with explicit request budgets and coverage tests.                                                   |
| [PDF/EPUB/OCR (#26)](https://github.com/aaron-seq/GenAI-Browser-Tool/issues/26)               | Real representative books parse with stable page/chapter citations and failure recovery.                                      |
| [Private semantic retrieval (#27)](https://github.com/aaron-seq/GenAI-Browser-Tool/issues/27) | A measured recall gain on paraphrases/multilingual questions, tenant isolation, deletion, and a documented deployment choice. |
| [Import/export (#19)](https://github.com/aaron-seq/GenAI-Browser-Tool/issues/19)              | Versioned user-data import and validation; text import is already available.                                                  |

Before claiming instant analysis, measure real-document recall, faithfulness,
first-answer latency, memory, and API cost. No live provider evaluation, shared
backend, model training, or production deployment is evidenced in this release.
