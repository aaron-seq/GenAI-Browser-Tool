# Product research and engineering evidence

Reviewed 19–20 October 2026. This appendix supports the concise
[product brief](PRODUCT.md). Published capabilities, implementation evidence, and
tests run locally are distinguished below.

## Findings and scope

The baseline on main was [PR #25](https://github.com/aaron-seq/GenAI-Browser-Tool/pull/25),
merged as `02fed79688b74ecfe0dccb3d37c89f121772e1dc`. It consolidated the latest
applicable code and passed its CI; no other open PRs were present at that review.
See the [integration review](../INTEGRATION-REVIEW.md) for branch decisions,
dependency advisories, tests, and package verification.

Code inspection found chat clipped to the opening 24,000 characters, the popup
kept its thread only in memory, stored conversations lacked document identity,
and the history preference did not consistently control persistence. The current
[worker](../../background.js), [retrieval](../../core/retrieval.js),
[UI](../../scripts/popup-main.js), and [storage](../../services/storage-service.js)
implement the changes described in PRODUCT.md. No runtime dependency was added.

The broad [engineering brief](ENGINEERING-BRIEF.md) is a review standard, not a
requirement to add every named framework. The user subsequently prioritized
reading speed, useful learning conversations, documentation, and open-source RAG
research. The product brief is the repo-specific update to that direction.

## Experience comparison

[Comet's official getting-started guide](https://www.perplexity.ai/comet/gettingstarted)
describes an assistant working with the current page, summaries, translation,
and additional browser context. These are reported vendor capabilities; Comet was
not installed or benchmarked during this work.

| Reading need                | This release                                                | Remaining gap                                                                     |
| --------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Know what is being analyzed | Source title, word count, outline, status                   | Dynamic extraction and restricted viewers remain limited.                         |
| Keep the assistant open     | Workspace tab tied to its original source tab               | No cross-tab comparison or browsing agent.                                        |
| Follow evidence             | Passage labels and expandable excerpts                      | Labels identify supplied evidence, not verified model citations or PDF pages.     |
| Continue learning           | Restored document-specific turns, guide/quiz starters       | No spaced repetition, grading, or learning-progress profile.                      |
| Read a book                 | Local text/Markdown import and whole-document keyword index | PDF/EPUB/OCR is [#26](https://github.com/aaron-seq/GenAI-Browser-Tool/issues/26). |
| Reduce repeated work        | Cached summaries and up to three in-memory indexes          | Network generation is still provider-dependent; no answer-quality benchmark.      |

A full-page extension tab reuses the tested interface and existing permissions.
Chrome also offers [Side Panel API](https://developer.chrome.com/docs/extensions/reference/api/sidePanel),
which requires the `sidePanel` permission and user-action rules. A side panel can
be evaluated later; it is not necessary to make this iteration usable.

## Engineering review

**Facts:** source inspection and tests show the opening-only chat boundary and
missing scoped restoration. Existing cloud provider clients, context menus,
export, summary sectioning, retries, and local statistics already worked. The
[original integration evidence](../INTEGRATION-REVIEW.md) records their baseline.

**Unknowns:** live model access, response faithfulness, provider p95 latency,
real multilingual retrieval recall, complex book parsing, and browser memory
under diverse maximum-size documents have not been measured. An account-specific
connection test can check access, not quality.

**Assumptions and open decision:** the first useful increment is a single-reader,
single-document workflow. A private local backend is the proposed first semantic
service option; local versus shared deployment remains a product choice in
[#27](https://github.com/aaron-seq/GenAI-Browser-Tool/issues/27). No deployment or
training expense is needed for the delivered browser retrieval.

**Success checks:** late-document evidence reaches the question prompt; opening
or importing a document makes no AI request; reopening restores only the same
URL/content; summary reuse makes no second request; history-off saves nothing;
clear-chat removes only that document; auth/network failures remain visible;
all existing checks and coverage floors continue to pass. These are exercised in
[retrieval tests](../../tests/core/retrieval.test.js),
[workflow tests](../../tests/integration/extension-workflow.test.js), and
[browser tests](../../tests/e2e/learning-workspace.spec.js).

### Root cause and five whys

1. Why did a question miss a book's ending? Only the first 24,000 characters
   reached the model.
2. Why that boundary? Every task reused a bounded single-request prompt.
3. Why no selection from the rest? No document index or retrieval stage existed.
4. Why did reopening also lose context? The UI held the thread in memory and
   saved exchanges had no URL/content identity for restoration.
5. Why did this escape the workflow? Previous tests covered extraction and
   provider routing, but not a late-evidence document reopened across UI lifetimes.

The correction is a bounded local retrieval stage, stable document identity,
scoped restoration, and regression tests for that user journey. Increasing the
prompt limit alone would increase cost and keep the lifecycle problem.

### Alternatives and decision

| Option                     | Benefit                                                               | Cost / reason                                                                                 |
| -------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Send the entire book       | Simple prompt                                                         | Larger latency/cost; provider context limits; no persistence fix.                             |
| Local BM25, current choice | No model download/service; exact source offsets; fast bounded queries | Keyword overlap limits paraphrase and multilingual recall.                                    |
| Browser embedding model    | Private semantic candidates                                           | Model download, startup, browser resource and worker lifecycle work; requires measurement.    |
| Private hybrid backend     | Dense + lexical retrieval, reranking, larger collections              | Deployment, model resources, authentication, retention, and new extension host configuration. |

The index splits into at most 2,800-character overlapping passages (200-character
overlap), scores BM25 (`k1=1.2`, `b=0.75`), and sends at most six. Short follow-ups
can reuse the previous user question's terms. No-match queries sample beginning,
middle, and end. This is a lexical RAG baseline, not semantic retrieval or training.
Its context budget stays below the existing 24,000-character prompt boundary.

### Security, performance, maintenance, and rollback

All provider requests still originate in the worker. No new host or extension
permission is added. Imported text is treated as untrusted page data; source
excerpts use `textContent`, and model output remains escaped. Prompt fencing is
a mitigation, not proof against prompt injection. See [security](../SECURITY.md).

Document identity is SHA-256 over URL and trimmed text; a changed page starts a
new thread. This is identification, not encryption. The index retains at most
three documents in worker memory and is rebuilt after worker suspension. Full
imports are not stored, while saved excerpts and answers remain sensitive local
data. History writes/clear/cleanup are serialized per key to avoid losing turns
from simultaneous extension pages; failed reads cannot overwrite existing history.

Summary cache keys include a prompt-format version, document identity, provider,
model, style, and length. Prompt changes that affect summary meaning require
bumping `summary-v1`. History-off disables cache use and restoration; turning it
off does not delete earlier data. A provider test uses 16 output tokens, a ten
second timeout, and no automatic retries; it never persists the entered key.

No remote service, migration, or extra package is required. New history fields are
additive; old unscoped records remain exportable but are not shown as another
page's chat. Rollback is a normal revert to the prior main revision and extension
reload. Existing records remain readable by the old export path. To roll back
only a provider default, change that provider's model in options.

## Open-source backend research

The following are candidates, not installed services. Documentation and license
files were checked; release metadata below was read from the projects' GitHub
release APIs on 19 October 2026. A newer release is not itself a recommendation
to upgrade an unmeasured deployment.

| Component          | Evidence                                                                                                                                                                                                                                                                                                                   | Fit and trade-off                                                                                                                               |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Ollama             | [Embeddings](https://docs.ollama.com/capabilities/embeddings), [chat](https://docs.ollama.com/api/chat), [MIT server license](https://github.com/ollama/ollama/blob/main/LICENSE); [v0.40.6](https://github.com/ollama/ollama/releases/tag/v0.40.6), 16 Oct 2026                                                           | Local generation/embeddings. Each model has separate weights, license, download size, and hardware requirements.                                |
| Qdrant + FastEmbed | [Hybrid-search tutorial](https://qdrant.tech/documentation/tutorials-develop/hybrid-search-fastembed/), [Apache-2.0](https://github.com/qdrant/qdrant/blob/master/LICENSE); [v1.19.2](https://github.com/qdrant/qdrant/releases/tag/v1.19.2), 5 Oct 2026                                                                   | Dense/sparse retrieval and filtering. Useful when collections outgrow a page index; adds an operating service and tenant-isolation obligations. |
| Haystack           | [Pipeline guide](https://docs.haystack.deepset.ai/docs/creating-pipelines), [concepts](https://docs.haystack.deepset.ai/docs/concepts-overview), [Apache-2.0 metadata](https://github.com/deepset-ai/haystack/blob/main/pyproject.toml); [v3.4.0](https://github.com/deepset-ai/haystack/releases/tag/v3.4.0), 15 Oct 2026 | Composable ingestion/retrieval/generation. Adds Python orchestration and dependencies; not required for one browser document.                   |

Proposed evaluation: a local authenticated API with separate indexing/query
endpoints, Ollama embeddings/generation, and Qdrant hybrid retrieval. Add an
orchestrator only if ingestion complexity justifies it. Indexing chunks and
computing embeddings does **not** train model weights. Initial downloads and
embedding computation take time; cached retrieval can then be fast.

Before implementation: select supported hardware and models; build a real-book
and paraphrase/multilingual fixture set; compare recall@6, answer faithfulness,
first-answer p50/p95, peak memory, and total cost against BM25. Require explicit
document consent, per-user collection isolation, size/rate limits, authenticated
access, deletion, safe URL fetching if added, and cancellation. These are concrete
acceptance conditions in [#27](https://github.com/aaron-seq/GenAI-Browser-Tool/issues/27),
not claims of completed backend security or model training.

## Provider selection

Defaults favor each vendor's documented efficient text model for interactive
reading. Existing custom model overrides are retained. Official documentation,
not a live provider benchmark, supports these choices:

- OpenAI lists [GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna)
  with Chat Completions support; its [latest-model guide](https://developers.openai.com/api/docs/guides/latest-model)
  describes the current family. The older [GPT-4o mini](https://developers.openai.com/api/docs/models/gpt-4o-mini)
  and [GPT-4.1 mini](https://developers.openai.com/api/docs/models/gpt-4.1-mini)
  pages mark those models deprecated. The default Luna request sets
  `reasoning_effort: none`; custom slugs are not given that parameter automatically.
- Anthropic's [model overview](https://platform.claude.com/docs/en/models/overview)
  documents `claude-haiku-5-5` for fast high-volume use. The prior default was
  `claude-opus-5`.
- Google's [model directory](https://ai.google.dev/gemini-api/docs/models)
  lists stable `gemini-3.5-flash-lite`; it documents access limits on the older
  Gemini 2.5 family for new projects. The prior default was `gemini-2.5-flash`.

Connection testing addresses [#16](https://github.com/aaron-seq/GenAI-Browser-Tool/issues/16);
default modernization is [#29](https://github.com/aaron-seq/GenAI-Browser-Tool/issues/29).
No real key was used during development. Requests were intercepted, so these
checks do not establish account access, output quality, provider cost, or speed.

## Performance evidence

Run `npm run benchmark:retrieval`. The reproducible
[script](../../.github/scripts/benchmark-retrieval.mjs) records CPU, Node version,
time, percentiles, and exact-evidence hits in [benchmark-results.json](benchmark-results.json).
Five index builds and fifty queries are measured at each size. On the recorded
Windows / Node 22.18 / Intel Core Ultra 7 155H run:

| Text size            | Index p50 / p95  | Query p50 / p95  | Exact late-evidence hits |
| -------------------- | ---------------- | ---------------- | ------------------------ |
| 50,000 characters    | 2.25 / 5.41 ms   | 0.026 / 0.096 ms | 50/50                    |
| 500,000 characters   | 9.61 / 14.35 ms  | 0.041 / 0.147 ms | 50/50                    |
| 2,000,000 characters | 36.84 / 38.62 ms | 0.114 / 0.218 ms | 50/50                    |

The previous opening-only 24,000-character context contains the answer in none
of these fixtures. This demonstrates that exact late evidence can be selected,
not a statistically representative recall improvement. The repeated-background,
low-vocabulary fixture and repeated identical question make this a narrow
microbenchmark. It excludes provider/network latency, semantic paraphrases, real
book diversity, PDF/OCR, and end-to-end browser memory. No production p95 or
instant-reading promise follows from these numbers.

## Verification and remaining issues

Locally run on the implementation before release: lint with zero warnings,
TypeScript checking, **281 unit/integration tests**, and **17 real-Chromium browser
tests**, all passing. Unit coverage: **94.00% statements, 83.00% branches,
94.04% functions, 96.18% lines**; worker branch coverage **87.50%**. Coverage floors
remain unchanged, and every global measure exceeds the PR #25 baseline.
Browser requests are intercepted; the workspace screenshot was visually checked.
CI and package verification for the product PR are recorded in its checks and
description, separately from these local results.

Addressed work: provider test (#16), persisted languages (#18), restored chat
(#21), history-off behavior (#28), and model defaults (#29). Still open: whole
long-task coverage (#17), user-data import/export (#19), repository-wide
formatting (#20), book formats (#26), and semantic service evaluation (#27).
The final source review also found the saved context-menu and notification
toggles are not consulted by their worker paths; this existing gap is recorded
with code evidence and acceptance checks in
[#31](https://github.com/aaron-seq/GenAI-Browser-Tool/issues/31).
These are tracked gaps; they are not hidden behind an “all features complete” claim.
