# Security Policy

## Supported Versions

| Version | Supported with security updates |
| ------- | ------------------------------- |
| 5.3.x   | Yes                             |
| 5.2.x   | Yes                             |
| 5.1.x   | Yes                             |
| <5.1    | No                              |

Versions before 5.0 shipped stub AI providers and are not supported.

## Reporting a Vulnerability

### How to Report

Email **aaronsequeira12@gmail.com**, subject
`[SECURITY] GenAI Browser Tool - [Brief Description]`.
Do not file a public issue or disclose the vulnerability before it is addressed.

### What to Include

Send the impact, reproduction steps, redacted evidence, browser/extension/OS
versions, and a way to follow up. Do not send keys or unrelated private page data.

### Response Timeline

- Acknowledgment: within 48 hours.
- Initial assessment: within five business days.
- Status updates: weekly until resolution.
- Resolution targets: 30 days for critical issues, 90 days for others.

## Security Measures

### Content Security Policy

The [manifest](../manifest.json) sets
`script-src 'self'; object-src 'self'`. Extension pages load no remote scripts
or stylesheets. Provider hosts are explicitly declared in `host_permissions`.

### Input validation

[Message validation](../utils/validation-service.js) requires an object,
nonempty `actionType`, and this extension's sender ID. The worker rejects unknown
actions. Documents are capped at 2,000,000 characters; questions at 1,000.
The question cap bounds spend, not security.

Model output is HTML-escaped before the fixed Markdown subset is applied.
Questions are never evaluated and have no keyword-based content filter.
There is no DOMPurify or Zod dependency; [renderer tests](../tests/popup/rendering.test.js)
exercise the local escaping path.

### Prompt injection

[Task prompts](../core/tasks.js) fence page content, identify it as untrusted,
and instruct the model to ignore embedded directives and acknowledge missing
evidence. These measures cannot eliminate prompt injection. Treat answers about
hostile pages as untrusted; the extension performs no autonomous external actions.

Chat sends up to six passages of 2,800 characters. Summaries process up to eight
24,000-character sections plus a merge. Translation/other single-request tasks
use the first 24,000 characters. These bounds limit input, not model reliability.

### API key handling

Keys live in `chrome.storage.sync.user_preferences.apiKeys`.
**They are not encrypted at the API level** and sync with the browser profile;
extension-context code and people with profile access can read them.
Only the selected provider's key is sent, in an HTTPS header to its matching host,
never in a URL. [Client tests](../tests/providers/ai-client.test.js) cover key
redaction in errors. Keys are excluded from exports and logs.

Use a scoped, budgeted key and revoke it if the profile is compromised.

### Data handling

- User-triggered AI actions send page/document text to the configured provider.
  There is no application backend or analytics. Extraction/import alone makes
  no provider request; the optional connection test sends a small request.
- Unreadable settings cannot authorize optional desktop notices/history or
  replacement updates. Generated output remains visible if saving fails; copy it
  before closing. See [settings-failure evidence](security-testing-evidence.md).
- Local history holds up to 1,000 summaries and 500 completed exchanges, including
  source excerpts. Daily cleanup prunes entries older than 90 days; records without
  timestamps remain.
- URL/text hashes identify documents; they are not encryption. Changed documents
  start new threads. Old unscoped history remains exportable without restoration.
- Full imported text and BM25 indexes stay in memory. Saved answers/excerpts may
  contain sensitive text. JSON export writes saved material to the user's machine.
- Save history off disables saves, cache reuse, and restoration; it does not delete
  past records. Clear this chat removes matching exchanges even when memory is off.
- The content script only reads the page; it neither modifies it nor makes
  provider requests.

## Security Best Practices

All code changes require security review. Regularly scan dependencies and retain
automated security regression checks in CI. Review this policy quarterly.
Contributors must preserve validation, output escaping, CSP, minimum permissions,
HTTPS endpoints, and user privacy choices. Never log keys or private page content.
Use [local checks](DEVELOPMENT.md#local-validation) and meaningful regressions for
changes to these boundaries.

## Known Security Considerations

Plaintext keys, third-party processing, and prompt injection remain material risks.
Do not submit content you would not send to the chosen provider yourself.
Escaping and CSP address executable markup; they do not make model claims reliable.
Provider traffic uses HTTPS without certificate pinning or request signing.
The [architecture/storage contracts](DEVELOPMENT.md) describe the implementation.

## Assurance limits

The repository provides no independent security audit, legal compliance
assessment, or Chrome Web Store approval. Tests demonstrate bounded behaviors,
not certification. No semantic backend or training service is deployed.
Scanner gaps are tracked in [#41](https://github.com/aaron-seq/GenAI-Browser-Tool/issues/41);
an absent analysis is not a clean scan.

## Incident Response

The primary contact assesses impact, contains the issue, investigates scope,
develops/tests a fix, communicates relevant advisories, and documents prevention.
Follow the private reporting process for sensitive details.

## Security Updates

Security fixes take priority. Test patches and publish release notes/advisories
when appropriate. This extension is installed unpacked: users must obtain the
updated source/package and reload it; a GitHub merge does not update installations.

## Resources

- [Chrome extension security](https://developer.chrome.com/docs/extensions/develop/security-privacy/stay-secure)
- [Chrome storage behavior](https://developer.chrome.com/docs/extensions/reference/api/storage)
- [Settings regression evidence](security-testing-evidence.md)
- [CI trust and validation](ci-modernization-evidence.md)

## Contact

Aaron Sequeira: **aaronsequeira12@gmail.com**.
PGP key available on request under this policy; no public key is verified here.
