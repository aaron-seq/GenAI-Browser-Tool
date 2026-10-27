# Settings-failure assessment and evidence

Historical assessment, 23 October 2026:
[issue #38](https://github.com/aaron-seq/GenAI-Browser-Tool/issues/38),
[merged PR #42](https://github.com/aaron-seq/GenAI-Browser-Tool/pull/42).
Fix [`ec3eef9`](https://github.com/aaron-seq/GenAI-Browser-Tool/commit/ec3eef91d4f463e0e416e1296601524adf7e8bbe)
was based on main `b584f4e839308d6468968b7791d3a7af39f2bc43`.
The [original detailed record](https://github.com/aaron-seq/GenAI-Browser-Tool/blob/6e8288550ef4935684a6a44c87cbbed77b818d14/docs/security-testing-evidence.md)
retains the full threat table, commands, intermediate failures, and review notes.
This was a bounded assessment, not a full audit or certification.

## Decision and demonstrated defect

A rejected settings read returned enabled defaults. Injected failures reproduced
unwanted notifications/history saves and replacement settings writes despite
saved opt-outs. No remote trigger, exploitation, or live disclosure was established.
The public issue was classified P2 with moderate potential confidentiality/integrity
impact; restricted triage remains separate.

The [shared reader](https://github.com/aaron-seq/GenAI-Browser-Tool/blob/ec3eef91d4f463e0e416e1296601524adf7e8bbe/core/configuration-manager.js#L61-L81)
now throws `SETTINGS_UNAVAILABLE`; absent records still receive defaults.
Optional effects and replacement updates require readable preferences. Generated
results remain visible with a save warning. Settings blocks edits on startup
failure and offers reload; confirmed reset handles write failure without requiring
a second read. First-install Options still opens if menu initialization fails.

Changing only notification delivery would leave other consumers unsafe; caching
old opt-ins adds stale state. No permission, dependency, schema, backend, CI,
or deployed setting changed. No migration is needed. Reverting restores the defect,
so rollback is not a permanent mitigation.

## Threat boundaries and assessment coverage

The reviewed flow was page/local TXT/MD → extension UI → same-extension worker →
configured HTTPS provider, with sync settings and local history. Source review
and existing tests covered sender validation, escaping/CSP, fenced prompts,
import bounds, fixed endpoints, provider auth/retry/error redaction, and storage.
There is no application server, tenant/account/session/payment model or autonomous
external action.

[Chrome storage](https://developer.chrome.com/docs/extensions/reference/api/storage#concepts-and-usage)
is asynchronous. Read failure gives no evidence of permission for optional effects.
Plaintext key storage and incomplete prompt-injection resistance remain documented
in [SECURITY.md](SECURITY.md). This assessment did not include a full history scan,
credential validation, parser fuzzing, concurrent settings writers, or compromised
extension contexts.

## Requirement → regression → oracle

| Requirement                               | Regression and observable result                                                                                                                                                 |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1: absent ≠ unreadable                   | [Configuration tests](../tests/core/configuration-manager.test.js): defaults only for absent records; read errors are generic and typed                                          |
| R2: preserve unknown saved choices        | Same tests plus [Options browser flow](../tests/e2e/settings-failure.spec.js): no failed-update write; later success preserves keys/flags                                        |
| R3: no optional notices on unknown opt-in | [Worker tests](../tests/integration/extension-workflow.test.js): menu/shortcut × success/error, no notification; continuing read failure also prevents extraction/provider calls |
| R4: retain generated output               | Worker/browser summary and chat cases: text plus save warning, no history write                                                                                                  |
| R5: actionable recovery                   | [Options tests](../tests/options/settings.test.js): disabled controls, reload recovery, reset success/write failure; browser checks stored state                                 |
| R6: usable installation                   | Worker lifecycle cases: correct Options opening, generic log, no provider/notice, next menu initialization succeeds                                                              |

No meaningful assertion was removed or coverage floor lowered. The old test
requiring defaults on read failure changed because it encoded the defect.

## Reproduction and validation record

The original session used Windows / Node 22.18.0 / npm 11.6.2,
Vitest/coverage 4.1.12, Vite 8.2.4, and Playwright 1.62.1.
Unit tests mocked Chrome APIs; browser tests loaded the actual unpacked extension
with synthetic keys, intercepted providers, and injected storage faults.

| State / command                                                           | Observed result                                                                                 |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Clean base: `npm run verify`                                              | Lint/types and 297 tests passed                                                                 |
| New regressions against original runtime                                  | 10 intended unit failures and 2 browser failures demonstrated unsafe defaults/update/save paths |
| Throwing reader before consumer adaptations                               | Two reset failures/unhandled rejections and two rejected lifecycle listeners                    |
| Final `npm run lint -- --max-warnings 0`, `npm run typecheck`             | Passed after correcting an intermediate missing argument                                        |
| `npm run test:coverage`                                                   | 311 tests / 13 files; statements 94.57%, branches 84.44%, functions 94.71%, lines 96.68%        |
| `npm run test:e2e`                                                        | 20 passed                                                                                       |
| `npx playwright test tests/e2e/settings-failure.spec.js --repeat-each=10` | 20/20 passed before installation-only catch; no retry used                                      |
| Three affected Vitest files, `--sequence.shuffle --sequence.seed=3810`    | 118 passed after isolating a persistent local-write rejection between tests                     |
| `npm audit --audit-level=high`                                            | Zero vulnerabilities reported in the locked graph                                               |

Final CI is recorded on [#38](https://github.com/aaron-seq/GenAI-Browser-Tool/issues/38)
at exact heads. A read-only agent found the missed installation catch; the primary
session reproduced/fixed it and independently ran the full/shuffled suites.
The agent retested installation cases. This is not independent human approval.

## Known gaps and next checks

- [#40](https://github.com/aaron-seq/GenAI-Browser-Tool/issues/40): native menus,
  keyboard dispatch, OS notification presentation. A headless shortcut attempt
  produced no request within five seconds; that is a harness gap, not a proven bug.
- [#41](https://github.com/aaron-seq/GenAI-Browser-Tool/issues/41): Dependabot API
  returned disabled/403 and code scanning no analysis/404. Neither is a clean scan.
  Scanner settings require covering authorization.
- Action/runtime work subsequently merged separately; see [CI evidence](ci-modernization-evidence.md).
- Unverified: Chrome 116 minimum, macOS/assistive technology, live provider quality,
  malicious-model reliability, concurrent settings edits, document recall/latency/
  cost, production recovery, and the separate UI draft combined with this fix.
