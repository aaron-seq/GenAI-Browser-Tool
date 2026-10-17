# Integration review

Reviewed 17 October 2026 against `main` at
[`b915866`](https://github.com/aaron-seq/GenAI-Browser-Tool/commit/b91586665941d3456f7411557edabc51842892d9).

## Decision and scope

No PRs were open when this review began. [PR #24](https://github.com/aaron-seq/GenAI-Browser-Tool/pull/24)
had already recovered PRs #14 and #15 into `main`. Start the integration branch
from current `main`, preserve that implementation, and fix validation findings in
one PR targeting `main`.

Older refs were inspected and preserved. The old `feat/close-open-issues` branch
contains an alternative test suite superseded by the controllers and coverage
work in 5.2.0. The January `fix/critical-stub-implementations-and-provider-interface`
branch adds an unused abstract provider class for the removed provider system.
Neither represents an open PR or a reason to restore that architecture.

## Engineering review before implementation

| Area                      | Finding / decision                                                                                                                                              |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Known facts               | Latest `main` contains the recovered functionality; the local checkout was behind. Baseline typecheck and 219 tests passed.                                     |
| Unknown facts             | Live credential validity, provider model availability, and real toolbar permission behavior were not demonstrated.                                              |
| Assumptions               | `main`, confirmed as the repository default, is the requested integration destination. Preserve existing extension behavior.                                    |
| Clarification questions   | None required for this integration; merge authorization was explicit.                                                                                           |
| Success criteria          | Lint, types, coverage, browser tests, audit, package inspection, and PR CI pass before merging.                                                                 |
| Root cause                | Earlier stacked work targeted a base already merged; CI validated code without checking whether its destination still needed integration.                       |
| Architecture              | Keep the source-loaded MV3 extension and one selected-provider client. No build system or runtime dependencies added.                                           |
| Security                  | Patch vulnerable development dependencies; use read-only CI permissions; keep branch names out of shell interpolation; package explicit runtime paths.          |
| Performance / scalability | Keep request concurrency, chunk limits, history caps, and retry behavior. No runtime performance changes or new services.                                       |
| Maintainability           | Ignore old generated files, document the real interfaces, and test worker lifecycle behavior through registered listeners.                                      |
| Testing strategy          | Real temporary Git histories for the base guard, existing mocked worker integration tests, coverage floors, and persistent Chromium E2E.                        |
| Dependencies              | Compatible transitive updates only; no major upgrades, new dependencies, or changes to the shipped extension.                                                   |
| Alternatives              | Re-merging superseded branches adds dead code; a validation-only report leaves demonstrated audit and packaging problems unresolved.                            |
| Recommendation            | Apply the focused fixes and merge one tested integration PR.                                                                                                    |
| Risk                      | CI ancestry checks observe workflow-time Git history, not patch equivalence or future events; the explicit ZIP input list needs updating for new runtime paths. |
| Rollback                  | Revert the integration merge on `main` and rerun CI. Existing settings/history and old branches are preserved.                                                  |

Five whys: changes missed `main` because later PRs landed on an old feature branch;
that branch remained a target after its parent PR merged; stacking was valid when
work began; checks verified code but not the target's ancestry; there was no
automated destination check. [Issue #22](https://github.com/aaron-seq/GenAI-Browser-Tool/issues/22)
records the history and acceptance criteria.

The guard uses [Git's documented `--is-ancestor` status codes](https://git-scm.com/docs/git-merge-base),
[full-history checkout](https://github.com/actions/checkout#fetch-all-history-for-all-tags-and-branches),
and [GitHub's read-only workflow permissions](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#permissions).
It runs on PR opening, reopening, head updates, and edits. It does not continuously
monitor future base merges or detect squash/rebase equivalence. Branch protection
was absent at inspection; this PR adds a check without changing repository policy.

## Validation personally run

Windows, Node 22.18.0, npm 11.6.2. Provider HTTP calls were mocked/intercepted.

| Check                     | Baseline                                       | Integration result                                 |
| ------------------------- | ---------------------------------------------- | -------------------------------------------------- |
| Dependency installation   | `npm ci` succeeded                             | Compatible lockfile updates installed successfully |
| Lint                      | Failed on pre-existing generated `dist/` files | Passed with old output preserved and ignored       |
| Typecheck                 | Passed                                         | Passed                                             |
| Unit + integration tests  | 219 passed, 11 files                           | 241 passed, 12 files                               |
| Statement / line coverage | 91.28% / 93.88%                                | 92.80% / 95.59%                                    |
| Global branch coverage    | 77.00%, floor 72%                              | 80.47%, floor 78%                                  |
| Worker branch coverage    | 57.14%                                         | 83.92%, separate floor 75%                         |
| Worker function coverage  | 91.66%                                         | 100%                                               |
| Chromium E2E              | Earlier published results are in PR #24        | 13 passed on this branch                           |
| `npm audit`               | 3 high-severity vulnerable packages            | 0 vulnerabilities                                  |

The local extension ZIP contained 22 runtime/documentation files. All manifest
targets and 16 relative JavaScript/HTML references were present; tooling and
legacy output were excluded. GitHub's ZIP will also be inspected before merge.

The 22 additional cases cover merged/equal/open/missing Git bases and a renamed
default branch; context-menu page extraction, absent input and notification size;
commands with/without an active tab; install/update, startup failure, cleanup and
unrelated alarms; and unsuccessful extraction and sender-tab fallback. Sources:
[guard tests](../tests/ci/pr-base.test.js),
[worker tests](../tests/integration/extension-workflow.test.js), and
[coverage configuration](../vitest.config.js). These address
[issue #23](https://github.com/aaron-seq/GenAI-Browser-Tool/issues/23).

The first Chromium launch was cold; all 13 cases passed without retries. The
runner emitted an environment warning because both `NO_COLOR` and `FORCE_COLOR`
were set. This affects terminal coloring, not browser behavior.

## Dependency decisions

All changes remain within existing dependency ranges, add no runtime cost or
bundle content, retain upstream licenses, and require no application migration.
Rollback restores the prior lockfile, including its known vulnerabilities.

| Dependency        | Before → after  | Evidence                                                                                                                                             |
| ----------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `brace-expansion` | 5.0.9 → 5.0.12  | [Expansion DoS advisory](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr), [recursion advisory](https://github.com/advisories/GHSA-qhr7-859c-m2p7) |
| `source-map-js`   | 1.2.1 → 1.2.2   | [Indexed source-map DoS advisory](https://github.com/advisories/GHSA-68fv-2mgg-jv7q)                                                                 |
| `undici`          | 7.29.0 → 7.30.1 | [TLS validation advisory](https://github.com/advisories/GHSA-w293-vg96-wgc3); the fresh npm audit also reported retry/WebSocket/cache advisories     |

## Changed files and operational notes

| Files                                                                                          | Reason                                                                                         |
| ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `.github/workflows/ci.yml`, `.github/scripts/check-pr-base.mjs`                                | Base ancestry guard, read-only permissions, dependency audit, explicit ZIP inputs              |
| `.gitignore`, `eslint.config.js`                                                               | Preserve and ignore legacy output; recognize the Node-based CI script                          |
| `package-lock.json`                                                                            | Three security updates and root-version alignment with existing package/manifest version 5.2.0 |
| `tests/ci/pr-base.test.js`, `tests/integration/extension-workflow.test.js`, `vitest.config.js` | Regression cases and higher enforced branch floors                                             |
| `CONTRIBUTING.md`, `docs/DEVELOPMENT.md`, `CHANGELOG.md`, this review                          | Accurate prerequisites, actual runtime contracts, integration and validation evidence          |

Run the commands in [the development guide](DEVELOPMENT.md#local-validation).
The ZIP packages runtime inputs explicitly; it must contain every manifest,
relative import, and HTML asset target. CI produces an Actions artifact, not a
published store release. No data migration is required.

No performance benchmark, load/stress test, accessibility audit, Edge test, live
provider evaluation, or real toolbar-click smoke test was performed. Passing the
available automated checks does not establish those outcomes.

Remaining feature work stays in existing issues:
[#16](https://github.com/aaron-seq/GenAI-Browser-Tool/issues/16) provider key verification,
[#17](https://github.com/aaron-seq/GenAI-Browser-Tool/issues/17) long-page task coverage,
[#18](https://github.com/aaron-seq/GenAI-Browser-Tool/issues/18) translation preferences,
[#19](https://github.com/aaron-seq/GenAI-Browser-Tool/issues/19) import,
[#20](https://github.com/aaron-seq/GenAI-Browser-Tool/issues/20) repository formatting,
and [#21](https://github.com/aaron-seq/GenAI-Browser-Tool/issues/21) persistent chat UI.
