# Contributing to GenAI Browser Tool

## Quick Start

Fork the repository, clone your fork, and create a short-lived branch from current
`main`. The extension loads directly from the repository root; see the
[installation guide](README.md#start-here).

## Development Setup

Use Node >=20.19, npm >=10, and Chrome >=116. Run `npm ci` to install
development tools and prepare Git hooks. Provider keys and model overrides belong
in the extension's options page, not an `.env` file.

[Local validation](docs/DEVELOPMENT.md#local-validation) is the authoritative
command list. Run `npm run verify` before a PR and the coverage/browser checks
appropriate to the change. Avoid repository-wide formatting unrelated to your work.

## Project Structure

See the [source map and message contract](docs/DEVELOPMENT.md#source-map).
All provider calls go through the worker and `providers/ai-client.js`.

To add a provider, update `PROVIDERS`, its manifest host permission, and the
options key/model inputs. Exercise request shaping and response/error handling in
[the provider tests](tests/providers/ai-client.test.js).

## Branching Model

Target final integration PRs at `main`; there is no long-lived `develop` branch.
A stacked PR may target an unmerged feature branch. Retarget when its base lands;
the [ancestry check](docs/DEVELOPMENT.md#pull-requests-and-packaging) describes
what CI detects.

## Commit Guidelines

Use Conventional Commits, for example `fix(content): handle empty pages` or
`docs(readme): clarify unpacked installation`. Keep the subject imperative,
at most 50 characters, without a trailing period. Wrap an optional body at 72
columns, explain consequential trade-offs, and link issues. Mark incompatible
changes with a `BREAKING CHANGE:` footer.

## Code Style Guidelines

Follow adjacent JavaScript and JSDoc conventions; ESLint, TypeScript's
`--noEmit` check, and Prettier are already configured. Prefer cohesive helpers
and test observable behavior. Keep UI controls keyboard accessible and show
progress/errors for asynchronous actions.

## Security & Privacy

Follow the [security policy](docs/SECURITY.md). Validate message boundaries,
preserve the manifest CSP, and escape untrusted output before adding the fixed
Markdown subset. Rendering uses a local escaping function, with no DOMPurify.
Keep API keys out of logs and exports, and user content out of logs; storage is plaintext at the
API level. Review permissions, provider hosts, and privacy opt-outs when changing
those paths. Report vulnerabilities privately using the policy's contact.

## Testing Requirements

Use the existing Vitest and Playwright suites. For example, this case in
[rendering.test.js](tests/popup/rendering.test.js) exercises the shipped renderer:

```js
it('escapes tags in model output before adding markup', () => {
  const html = renderMarkdown('<img src=x onerror=alert(1)>');
  expect(html).not.toContain('<img');
  expect(html).toContain('&lt;img');
});
```

Run that file with `npx vitest run tests/popup/rendering.test.js`.
For browser tests, reuse the [persistent Chromium fixture](tests/e2e/fixtures.js)
and [workspace examples](tests/e2e/learning-workspace.spec.js).
Coverage thresholds live in [vitest.config.js](vitest.config.js);
[validation limits](docs/DEVELOPMENT.md#local-validation) distinguish intercepted
provider tests from manual/live checks.

## Pull Request Workflow

Use the [PR template](.github/pull_request_template.md). Describe the problem,
linked issue, actual validation, gaps, and material risks. Include screenshots
when the UI changes. Add regression coverage for behavior changes and update the
relevant canonical guide.

## Review Process

Review correctness, security, privacy, compatibility, and maintainability.
Support findings with concrete behavior and tight source/test references.
Authors should address each actionable comment and provide measurements for
performance claims. Squash before merge unless the commit history is useful.

## Release Process

1. Align versions in `package.json`, `package-lock.json`, and `manifest.json`.
   `npm version` does not update the Chrome manifest.
2. Update [CHANGELOG.md](CHANGELOG.md) and run the
   [release checks and packaging workflow](docs/DEVELOPMENT.md#pull-requests-and-packaging).
3. Load the extension in Chrome and summarize a real page after a toolbar click;
   automated tests cannot grant that exact `activeTab` interaction.
4. Tag/push an approved release and distribute the inspected CI ZIP through a
   separate GitHub release. A merge is not publication to the Chrome Web Store.

## Issue Triage

Report bugs with reproduction steps, expected/actual results, extension/browser
versions, OS, and redacted logs. Link existing issues rather than duplicating
them; keep security disclosures private.

## Community Expectations

Be specific and constructive, respect privacy, and follow the
[Code of Conduct](CODE_OF_CONDUCT.md).
