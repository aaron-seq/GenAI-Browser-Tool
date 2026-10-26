# CI action and runner migration

Historical delivery: [PR #43](https://github.com/aaron-seq/GenAI-Browser-Tool/pull/43),
[issue #32](https://github.com/aaron-seq/GenAI-Browser-Tool/issues/32).
Workflow change [`0058986`](https://github.com/aaron-seq/GenAI-Browser-Tool/commit/0058986094ee8bf537faf22dc9ae5ecd3d9f24b9)
was based on `8f0bddeb53f28dfc1f8f69d05b12c8620a881c60` (PR #42).
Main merge: [`6e82885`](https://github.com/aaron-seq/GenAI-Browser-Tool/commit/6e8288550ef4935684a6a44c87cbbed77b818d14).
[Original review/run detail](https://github.com/aaron-seq/GenAI-Browser-Tool/blob/6e8288550ef4935684a6a44c87cbbed77b818d14/docs/ci-modernization-evidence.md)
remains available without duplicating the delivery checklist here.

## Decision, scope and risk

Use immutable action release commits and explicit Ubuntu 26.04. The
[runner migration notice](https://github.com/actions/runner-images/issues/14748)
and [Playwright requirements](https://playwright.dev/docs/intro#system-requirements)
informed the change; hosted execution established compatibility with this lockfile.

| Action          | Selected release and pinned manifest                                                                                                                                                      |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| checkout        | [7.0.1](https://github.com/actions/checkout/releases/tag/v7.0.1), [`3d3c42e`](https://github.com/actions/checkout/blob/3d3c42e5aac5ba805825da76410c181273ba90b1/action.yml)               |
| setup-node      | [7.1.0](https://github.com/actions/setup-node/releases/tag/v7.1.0), [`949feb2`](https://github.com/actions/setup-node/blob/949feb2413d6458794dcd2491c4babbbce0c15c1/action.yml)           |
| upload-artifact | [7.0.2](https://github.com/actions/upload-artifact/releases/tag/v7.0.2), [`cf430e0`](https://github.com/actions/upload-artifact/blob/cf430e030ddbb5b0abf93d22962f4752f3646cd9/action.yml) |
| Codecov         | [7.1.1](https://github.com/codecov/codecov-action/releases/tag/v7.1.1), [`303a32d`](https://github.com/codecov/codecov-action/blob/303a32d7a59b442fa8d48b6a1cc6825c09c847a5/action.yml)   |

Release tags and pinned manifests were checked against upstream Git objects.
The first three execute on Node 24; Codecov's composite wrapper pins its Node-24
github-script step. These runtimes are distinct from the Node 20/22/24 application
matrix. SHA pins follow [GitHub's guidance](https://docs.github.com/en/actions/reference/security/secure-use);
they do not establish absence of malicious/vulnerable code.

Trust boundaries stay unchanged: `pull_request`, `contents: read`, ordinary fork
secret restrictions, existing optional Codecov token, and no retained checkout
credentials. The guard fetches full history; install jobs explicitly cache npm
against the lockfile, and automatic caching is off in the guard. Artifact names,
paths, archive default, and 7/14-day retention remain.

The [Codecov wrapper](https://github.com/codecov/codecov-action/blob/303a32d7a59b442fa8d48b6a1cc6825c09c847a5/dist/codecov.sh)
downloads a separate CLI and checks its signature. The CLI, runner image, and Node
patch releases are not pinned by the action SHA. Signature checking was not
bypassed; Codecov's nonfatal policy remains. Inspect upload logs separately from
job status.

No application behavior, dependency, permission, scanner setting, secret, OIDC,
or deployment changed. Rollback reverts this workflow/docs change and restores
old action/runner notices. The ancestry guard is independent of verify/packaging;
required-check policy is separate.

## Acceptance and evidence

The original local Windows / Node 22.18.0 / npm 11.6.2 session passed:

- `npm run verify` and `npm run test:coverage`: 311 tests / 13 files;
  statements 94.57%, branches 84.44%, functions 94.71%, lines 96.68%.
- Workflow Prettier and `git diff --check` after correcting initial formatting.
- `npm audit --audit-level=high`: zero vulnerabilities reported.
- `npm run test:e2e`: 20 unpacked-Chromium tests with intercepted providers.

The [post-merge run on 6e82885](https://github.com/aaron-seq/GenAI-Browser-Tool/actions/runs/40081266808)
passed the hosted matrix, browser, and package jobs; the PR-only ancestry guard
was skipped on that push event. Its inspected ZIP had
24 files and all 21 relative runtime references, matching the checkout. The
[issue delivery record](https://github.com/aaron-seq/GenAI-Browser-Tool/issues/32)
retains per-head CI, cache, Codecov, and artifact evidence.
A read-only agent review also ran seven guard tests; the primary session reran
the full suite. Neither is independent human approval.

Normal green execution does not establish fork/tokenless uploads, failed-test
report uploads, adversarial PR/cache behavior, Enterprise/self-hosted runners,
or compatibility with the separate UI draft #39. Native entry/OS verification
remains [#40](https://github.com/aaron-seq/GenAI-Browser-Tool/issues/40), scanning
setup [#41](https://github.com/aaron-seq/GenAI-Browser-Tool/issues/41).
