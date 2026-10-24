# CI action and runner migration

24 October 2026. [Issue #32](https://github.com/aaron-seq/GenAI-Browser-Tool/issues/32) ·
[milestone 2](https://github.com/aaron-seq/GenAI-Browser-Tool/milestone/2).
Branch `codex/issue-32-ci-modernization` was prepared on
[PR #42](https://github.com/aaron-seq/GenAI-Browser-Tool/pull/42) at
`8f0bddeb53f28dfc1f8f69d05b12c8620a881c60`. The application code is unchanged
relative to that baseline; the separate UI draft #39 is outside this validation.
PR #42 merged into main at `f0c71db938dfd551dc9797afdb756e734ca7655c`;
[PR #43](https://github.com/aaron-seq/GenAI-Browser-Tool/pull/43) now targets main.
Workflow change: [`0058986`](https://github.com/aaron-seq/GenAI-Browser-Tool/commit/0058986094ee8bf537faf22dc9ae5ecd3d9f24b9).
The final head, merge state, inspected CI runs and artifact results are maintained on #32.

## Decision, scope and risk

Replace Node-20-era action releases and floating major tags with verified release
commits. Select `ubuntu-26.04` explicitly to exercise the announced transition;
GitHub's [migration notice](https://github.com/actions/runner-images/issues/14748)
identifies the label and rollback option. Playwright's current
[system requirements](https://playwright.dev/docs/intro#system-requirements)
list Ubuntu 26.04; the hosted run must establish compatibility for our locked tools.

| Action          | Selected release / immutable commit                                                                                                                                                        | Reviewed contract                                                                                                                                                           |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| checkout        | [7.0.1](https://github.com/actions/checkout/releases/tag/v7.0.1) / [`3d3c42e`](https://github.com/actions/checkout/blob/3d3c42e5aac5ba805825da76410c181273ba90b1/action.yml)               | Node 24; full history still supported; unsafe privileged fork checkout is off by default. All jobs disable persisted credentials; the guard performs local Git checks only. |
| setup-node      | [7.1.0](https://github.com/actions/setup-node/releases/tag/v7.1.0) / [`949feb2`](https://github.com/actions/setup-node/blob/949feb2413d6458794dcd2491c4babbbce0c15c1/action.yml)           | Node 24; explicit npm cache and lockfile in install jobs; automatic caching off in the guard. No registry-url/auth configuration is used.                                   |
| upload-artifact | [7.0.2](https://github.com/actions/upload-artifact/releases/tag/v7.0.2) / [`cf430e0`](https://github.com/actions/upload-artifact/blob/cf430e030ddbb5b0abf93d22962f4752f3646cd9/action.yml) | Node 24; archive default remains true; existing artifact paths/names and 7/14-day retention preserved.                                                                      |
| Codecov         | [7.1.1](https://github.com/codecov/codecov-action/releases/tag/v7.1.1) / [`303a32d`](https://github.com/codecov/codecov-action/blob/303a32d7a59b442fa8d48b6a1cc6825c09c847a5/action.yml)   | Composite wrapper with a pinned Node-24 github-script step. Existing token input and nonfatal failure policy remain; OIDC and skip-validation stay off.                     |

The parent resolved official release tags through GitHub's Git object API and read
the pinned action manifests. Codecov's annotated tag resolved to the commit above
and GitHub reported its signature valid. This verifies provenance, not absence of
malicious or vulnerable code. The [Codecov wrapper](https://github.com/codecov/codecov-action/blob/303a32d7a59b442fa8d48b6a1cc6825c09c847a5/dist/codecov.sh)
downloads a separate CLI and checks its signature with the published verification
key. Pinning the action does not pin that CLI, the runner image, or Node patch releases.
No validation bypass was added. GitHub documents the rationale for
[full action SHA pins and least privilege](https://docs.github.com/en/actions/reference/security/secure-use).

Threat boundary: contributed source/dependency lifecycle scripts execute in a
disposable hosted runner. Preserve `pull_request` (no privileged trigger),
`contents: read`, GitHub's ordinary fork-secret boundary, and the existing optional
Codecov token reference. There are no new secrets, scopes, OIDC, repository settings,
scanner setup, runtime dependency, paid service, or deployment changes.

Risk is action-major/runner compatibility: Git credentials, caching, package
availability, browser dependencies, Codecov's external verification/download, and
artifact behavior. Changing only `ubuntu-latest` would not address old actions;
retaining floating tags would permit later action changes without a reviewed diff.
The Node 20/22/24 application matrix is preserved for compatibility; it is distinct
from each action's execution runtime and does not claim upstream Node support.

Rollback: revert this workflow/docs change on the feature branch and rerun CI;
that restores previous action/runner notices. No application migration is needed.
CI is rerun against main after retargeting. The ancestry guard is independent
of the verify job, so it does not itself block packaging; required-check policy
is a repository setting and was not changed.

## Acceptance and evidence

| Requirement                 | Verification / oracle                                                                                                                                               |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Preserve trust and behavior | Compare the full diff with 8f0bdde: same triggers, permissions, matrix, audit, coverage floors, dependency edges, token input and upload failure policy.            |
| Preserve ancestry checks    | Existing `tests/ci/pr-base.test.js` uses real temporary Git histories. Hosted stacked-PR job must see both remote refs with fetch-depth 0 and no stored credential. |
| Preserve install/cache      | Hosted setup-node logs must show npm cache behavior and successful `npm ci` for all legs. A later run may be needed to demonstrate a warm cache.                    |
| Validate selected runner    | All six hosted jobs must pass on Ubuntu 26.04 at the final head, including 311 unit/integration tests per Node leg and 20 intercepted-provider browser tests.       |
| Report coverage honestly    | Inspect Node 22 Codecov logs for actual signature/report/upload outcome; nonfatal action success is not an upload-success oracle.                                   |
| Preserve package            | Download the successful CI ZIP; compare every file to the checkout, resolve runtime references, and confirm runtime allowlist and excluded tooling.                 |

Parent local commands on Windows / Node 22.18.0 / npm 11.6.2:

- Clean main b584f4e: `npm run verify` passed lint, typecheck and 297 tests.
- Stacked candidate: `npm run verify` and `npm run test:coverage` passed 311 tests
  in 13 files; statements 94.57%, branches 84.44%, functions 94.71%, lines 96.68%.
- `npx prettier --check .github/workflows/ci.yml` passed after formatting; the
  first formatting check failed and was corrected. `git diff --check` passed.
- `npm audit --audit-level=high` reported no vulnerabilities, exit 0.
- `npm run test:e2e` passed 20 tests in 56.4 seconds with actual unpacked Chromium
  and intercepted provider responses. No live provider/key validation is implied.

This is workflow maintenance, not a newly reproduced product logic defect.
The test alternative to Red/Green is verified upstream contracts, existing
meaningful regression tests, and hosted execution of the changed workflow.
No YAML-mirroring test, artificial product failure, lowered gate or silent skip
was introduced. Test/tool versions and privacy-failure cases remain in the
[prior assessment](security-testing-evidence.md).

Fresh read-only agent `ci_risk_review` ran the seven guard cases successfully and
reviewed the candidate workflow diff; it found no blocking defect. The parent read
the cited guard/diff and independently ran the full suite, including those seven
cases. The agent did not verify upstream release provenance or hosted execution;
those are parent checks. Agent review is not independent human approval.

Not exercised locally: Ubuntu runner execution, authenticated fork/tokenless
Codecov uploads, failed-test report upload, cache poisoning/adversarial PR execution,
GitHub Enterprise/self-hosted runners, native menu/OS notices, or the UI draft
combined with this branch. A successful normal hosted run does not establish
fork/failure-path behavior. #40 and #41 retain the native-browser/scanner gaps;
the existing restricted record remains private and unresolved under owner instruction.
