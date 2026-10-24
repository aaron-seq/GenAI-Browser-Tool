# Settings-failure assessment and evidence

23 October 2026. Selected scope: [issue #38](https://github.com/aaron-seq/GenAI-Browser-Tool/issues/38),
under [milestone 1](https://github.com/aaron-seq/GenAI-Browser-Tool/milestone/1).
Runtime/test fix: [`ec3eef9`](https://github.com/aaron-seq/GenAI-Browser-Tool/commit/ec3eef91d4f463e0e416e1296601524adf7e8bbe),
based on main [`b584f4e`](https://github.com/aaron-seq/GenAI-Browser-Tool/commit/b584f4e839308d6468968b7791d3a7af39f2bc43).
This is a bounded local assessment, not a repository-wide audit or certification.

## Decision and demonstrated defect

A rejected settings read returned enabled defaults. Controlled failures reproduced
unwanted desktop delivery, optional history persistence, and replacement settings
writes despite saved opt-outs. No remote trigger, live disclosure, or exploitation
was established. Qualitative impact: moderate potential confidentiality/integrity
impact; priority P2; high confidence in the reproduced local behavior. This issue
was already public; restricted findings are tracked separately and excluded here.

Chosen fix: make the [shared reader reject with `SETTINGS_UNAVAILABLE`](https://github.com/aaron-seq/GenAI-Browser-Tool/blob/ec3eef91d4f463e0e416e1296601524adf7e8bbe/core/configuration-manager.js#L61-L81).
An actually absent record still receives defaults. The alternative of changing
only notification delivery would leave unsafe updates and history consumers;
caching old settings would introduce stale opt-in decisions and extra state.

[Notification delivery](https://github.com/aaron-seq/GenAI-Browser-Tool/blob/ec3eef91d4f463e0e416e1296601524adf7e8bbe/background.js#L701-L726)
now requires a successful current read. [Optional history](https://github.com/aaron-seq/GenAI-Browser-Tool/blob/ec3eef91d4f463e0e416e1296601524adf7e8bbe/background.js#L379-L394)
skips saving on failure while returning the generated result and warning.
[Settings startup](https://github.com/aaron-seq/GenAI-Browser-Tool/blob/ec3eef91d4f463e0e416e1296601524adf7e8bbe/options.js#L19-L36)
blocks edits/reset with a persistent reload notice. Confirmed reset handles write
failure and renders known written defaults without an unnecessary reread.
Installation menu failure is logged generically and first-install Options still opens.

No new permission, dependency, storage schema, provider, backend, CI workflow,
deployed configuration, or repository security setting changed. No migration is
needed. Rollback is a revert of the fix commit, which restores the documented
failure behavior; it is not an acceptable permanent mitigation.

## Threat boundaries and assessment coverage

Actors are the local reader, an untrusted page/document/model response, and the
configured provider. Assets are API keys, page text, saved preferences and history.
Flow: page or local TXT/MD → extension UI → same-extension worker message →
provider HTTPS; settings use sync storage and optional history uses local storage.
The extension has no application server, account system, shared tenant, database,
cookie session, payment flow, deployment target, or autonomous external actions.

| Area                        | Assessment and limits                                                                                                                                                                                                                           |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity / authorization    | Source review of sender validation/router and existing negative tests; no account/tenant model to test. Not a full compromised-extension-context assessment.                                                                                    |
| Browser / input / injection | Source review of escaping, CSP and fenced prompts; existing rendering/validation tests rerun. Prompt injection resistance and live model quality remain unmeasured.                                                                             |
| Provider / API boundary     | Existing mocked auth, timeout, retry, parsing and redaction tests rerun. No live provider requests, credentials or production targets used.                                                                                                     |
| Privacy / state integrity   | New controlled failed reads before action, before update, and after generation; no notification/save/write on unknown preferences; recovery and reset tested. Concurrent settings writers remain outside this milestone.                        |
| Files / network             | Existing import limits and fixed provider endpoints reviewed; imports exercised with a benign TXT fixture. No parser fuzzing, PDF/EPUB/OCR, SSRF service or upload server assessment.                                                           |
| Secrets / cryptography      | Plaintext sync-key design documented; no new encryption. Accessible repository alerts inspected read-only; restricted triage remains private. This was not a complete history scan or credential validation.                                    |
| Dependencies / Actions      | `npm audit --audit-level=high` reported no vulnerabilities in the installed locked graph. Existing Node matrix, read-only token permissions and allowlisted ZIP reviewed; audit does not verify action integrity. CI modernization remains #32. |
| Platform / infrastructure   | Real extension in Playwright Chromium on Windows; CI covers Linux. No containers, deployed infrastructure, load test or recovery drill in scope. Native OS notifications and real menu/shortcut invocation remain #40.                          |

Platform reference: Chrome documents [asynchronous storage](https://developer.chrome.com/docs/extensions/reference/api/storage#concepts-and-usage),
and recommends [minimal privileges and HTTPS](https://developer.chrome.com/docs/extensions/develop/security-privacy/stay-secure).
Actions review used GitHub's [secure-use guidance](https://docs.github.com/en/actions/reference/security/secure-use).
These references inform selected checks, not a compliance claim.

## Requirement → regression → oracle

| Requirement                                            | Evidence / expected behavior                                                                                                                                                                                                      |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1: missing and unreadable settings differ             | [Configuration tests](../tests/core/configuration-manager.test.js): new-install defaults and older record merging remain; rejected read returns a generic typed error without private detail.                                     |
| R2: update requires known current values               | Same file: failed update performs no write; a later successful update preserves saved keys/flags. [Actual Options browser flow](../tests/e2e/settings-failure.spec.js) checks the stored object and retry success.                |
| R3: no optional desktop delivery on unknown opt-in     | [Worker regressions](../tests/integration/extension-workflow.test.js): menu/shortcut callback × provider success/error, continuing read failure, no notification call; continuing failure also makes no provider/extraction call. |
| R4: generated result survives an optional save failure | Summary and answer worker tests assert text plus warning and no history write. Browser Summary click verifies visible text, Not saved notice, and absent real local history keys.                                                 |
| R5: recovery is actionable                             | [Options tests](../tests/options/settings.test.js) and browser test check blocked controls, persistent reload alert, unchanged saved state, reload recovery, reset success and write failure.                                     |
| R6: installation remains usable                        | Worker lifecycle tests cover install/update failure, correct Options opening, generic log, no provider/notification, and successful next menu initialization.                                                                     |

The oracle is saved-choice preservation: unavailable storage provides no evidence
of permission for optional effects or replacement writes. A user-confirmed reset
is an explicit write and can render the known successful value. Tests assert state
and effects, not merely successful completion. No tests were disabled or coverage
floors lowered. The former test requiring defaults on read failure was changed
because it encoded the reported defect; the fix commit explains that contract change.

## Reproduction and validation record

Commands below were run in the parent Codex session on Windows with Node 22.18.0,
npm 11.6.2, Vitest/coverage 4.1.12, Vite 8.2.4 and Playwright 1.62.1. Provider calls
were stubbed/intercepted with synthetic keys; storage faults were injected locally.
No install/lockfile change was needed. Unit tests mock Chrome; browser tests load
the actual unpacked extension but deliberately substitute provider and failing reads.

| Run                                                                                                                                                                              | Revision/state                                                | Observed result                                                                                                                                                         |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run verify`                                                                                                                                                                 | clean main b584f4e before edits                               | Lint/typecheck and 297 tests passed, exit 0.                                                                                                                            |
| `npx playwright test tests/e2e/preferences.spec.js`                                                                                                                              | same baseline                                                 | 1 passed, exit 0.                                                                                                                                                       |
| `npm audit --audit-level=high`                                                                                                                                                   | unchanged locked graph                                        | No vulnerabilities reported, exit 0; no claim about repository alerts or all supply-chain risk.                                                                         |
| `npx vitest run tests/core/configuration-manager.test.js tests/integration/extension-workflow.test.js -t 'unavailable settings\|does not replace saved\|settings read failures'` | new tests, original runtime                                   | 10 intended failures: enabled-default behavior violated R1–R4.                                                                                                          |
| `npx playwright test tests/e2e/settings-failure.spec.js`                                                                                                                         | new tests, original runtime                                   | 2 intended failures: replacement update reported saved; unwanted history save lacked Not saved notice.                                                                  |
| Two new reset cases in `tests/options/settings.test.js`                                                                                                                          | throwing reader, before reset adaptation                      | 2 failures and unhandled rejections; reset depended on reread and did not handle write failure. Exact original filter was not retained.                                 |
| `npx vitest run tests/integration/extension-workflow.test.js -t 'handles unavailable settings during'`                                                                           | throwing reader, before installation adaptation               | 2 intended rejected-listener failures. Agent source finding independently reproduced by parent.                                                                         |
| `npm run lint -- --max-warnings 0` and `npm run typecheck`                                                                                                                       | final runtime, dirty before ec3eef9                           | Both passed. One intermediate missing-argument type error was fixed; no checks suppressed.                                                                              |
| `npm run test:coverage`                                                                                                                                                          | same runtime before commit                                    | 311 tests / 13 files passed, exit 0; statements 94.57%, branches 84.44%, functions 94.71%, lines 96.68%. Existing global/worker floors retained.                        |
| `npm run test:e2e`                                                                                                                                                               | same runtime before commit                                    | 20 passed, exit 0.                                                                                                                                                      |
| `npx playwright test tests/e2e/settings-failure.spec.js --repeat-each=10`                                                                                                        | same settings/Options/runtime; before installation-only catch | 20/20 passed, exit 0; no retry used to hide failures.                                                                                                                   |
| `npx vitest run tests/core/configuration-manager.test.js tests/integration/extension-workflow.test.js tests/options/settings.test.js --sequence.shuffle --sequence.seed=3810`    | final runtime before commit                                   | 118 passed, exit 0. Initial shuffle exposed an existing persistent local-write rejection leaking into alarm cleanup; resetting that mock between tests fixed isolation. |

An intermediate lifecycle assertion expected one logger argument rather than two;
it was corrected and rerun. A final test-only console-spy cleanup was followed by
12 configuration tests passing. Precommit applied repository ESLint/Prettier rules;
CI must validate the resulting pushed head. Final CI evidence is maintained on
[issue #38](https://github.com/aaron-seq/GenAI-Browser-Tool/issues/38), with its exact
head/run links; a later documentation commit does not change the runtime revision above.

Fresh agent `settings_fix_review` inspected the diff and all settings-reader
consumers read-only. It reported 116 mocked tests passing and found the missed
installation catch. The parent reproduced and fixed that finding, independently
ran the broader suite, and reran shuffled tests. The agent retested the two
installation cases successfully. These are agent checks, not independent human
review, penetration testing, or approval.

## Known gaps and next checks

- [#40](https://github.com/aaron-seq/GenAI-Browser-Tool/issues/40): real native menu,
  keyboard dispatch and OS notification presentation. An exploratory headless
  `Control+Shift+S` attempt made no provider request within five seconds; this is a
  harness/platform gap, not proof of a product defect. It was not retained as a
  passing or silently skipped test. The older sentiment browser test was renamed
  to describe its actual message route; its assertions remain.
- [#41](https://github.com/aaron-seq/GenAI-Browser-Tool/issues/41): Dependabot alert
  API returned disabled (403); code scanning returned no analysis (404). Neither
  is a clean scan. Settings were inspected only. Propose scanner setup and obtain
  covering authorization before enabling repository security settings.
- [#32](https://github.com/aaron-seq/GenAI-Browser-Tool/issues/32): Actions/runtime
  modernization remains separate. No CI trust changes were bundled here.
- Untested: Chrome 116 minimum, macOS, native accessibility technology, live
  providers, malicious model reliability, concurrent settings edits, real-document
  recall/latency/cost, production recovery and the separate UI draft #39 combined
  with this fix. No instant comprehension or production-readiness claim follows.
