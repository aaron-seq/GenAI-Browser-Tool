# Integration review

Historical review: 17 October 2026, base
[`b915866`](https://github.com/aaron-seq/GenAI-Browser-Tool/commit/b91586665941d3456f7411557edabc51842892d9).
The [full original record](https://github.com/aaron-seq/GenAI-Browser-Tool/blob/6e8288550ef4935684a6a44c87cbbed77b818d14/docs/INTEGRATION-REVIEW.md)
preserves the detailed inventory and run notes; results below are historical,
not tests rerun by each reader.

## Decision and scope

[PR #24](https://github.com/aaron-seq/GenAI-Browser-Tool/pull/24) had recovered
PRs #14/#15; no PR was open when the review began. Integrate from current main,
preserve the source-loaded MV3 runtime, and fix demonstrated validation problems.

Preserve older refs without restoring their superseded test suite or unused
abstract provider implementation. The delivery problem was a stacked base already
merged into main, not missing runtime functionality.
[Issue #22](https://github.com/aaron-seq/GenAI-Browser-Tool/issues/22) records the
ancestry guard; [#23](https://github.com/aaron-seq/GenAI-Browser-Tool/issues/23)
records worker regression coverage. Current behavior and guard limits belong in
[DEVELOPMENT.md](DEVELOPMENT.md#pull-requests-and-packaging).

## Validation personally run

The original session ran on Windows / Node 22.18.0 / npm 11.6.2, with
mocked/intercepted provider requests.

| Check                    | Before                                      | Integration result                              |
| ------------------------ | ------------------------------------------- | ----------------------------------------------- |
| Lint / types             | Lint failed on legacy `dist/`; types passed | Both passed; legacy output retained and ignored |
| Unit/integration         | 219 tests / 11 files                        | 241 / 12                                        |
| Statements / lines       | 91.28% / 93.88%                             | 92.80% / 95.59%                                 |
| Global / worker branches | 77.00% / 57.14%                             | 80.47% / 83.92%; floors 78% / 75%               |
| Chromium E2E             | Earlier evidence on PR #24                  | 13 passed, no retries                           |
| npm audit                | Three high-severity vulnerable packages     | Zero vulnerabilities reported                   |

The local ZIP had 22 files and all manifest targets/16 relative runtime references;
tooling and legacy output were excluded. This is the historical package, not the
current release count. Added tests used real temporary Git histories and worker
listeners for menu/command/lifecycle/alarm/extraction branches.
Run current checks from [local validation](DEVELOPMENT.md#local-validation).

## Dependency decisions

Compatible transitive updates retained licenses, added no runtime dependency,
and needed no application migration:

- `brace-expansion` 5.0.9 → 5.0.12:
  [expansion DoS](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr) and
  [recursion advisory](https://github.com/advisories/GHSA-qhr7-859c-m2p7).
- `source-map-js` 1.2.1 → 1.2.2:
  [indexed source-map DoS](https://github.com/advisories/GHSA-68fv-2mgg-jv7q).
- `undici` 7.29.0 → 7.30.1:
  [TLS validation advisory](https://github.com/advisories/GHSA-w293-vg96-wgc3);
  npm also reported retry/WebSocket/cache advisories.

Reverting restores the prior workflow/lockfile, including known vulnerabilities.
No benchmark, load test, accessibility audit, Edge/live-provider test, or real
toolbar-click check was performed. CI artifacts are not store publication.
Remaining product work is maintained in the [product brief](product/PRODUCT.md)
and [current checkpoint](product/PROJECT-STATUS.md).
