# Security Policy

## Supported Versions

We actively support the following versions with security updates:

| Version | Supported          |
| ------- | ------------------ |
| 4.1.x   | :white_check_mark: |
| 4.0.x   | :white_check_mark: |
| < 4.0   | :x:                |

## Reporting a Vulnerability

### How to Report

If you discover a security vulnerability in GenAI Browser Tool, please report it responsibly:

1. **DO NOT** create a public GitHub issue
2. **DO NOT** disclose the vulnerability publicly until it has been addressed
3. **DO** email security concerns directly to: aaronsequeira12@gmail.com
4. **DO** provide detailed information about the vulnerability

### What to Include

When reporting a security vulnerability, please include:

- **Description**: Clear description of the vulnerability
- **Impact**: Potential impact and severity assessment
- **Reproduction**: Step-by-step instructions to reproduce
- **Evidence**: Screenshots, logs, or proof of concept (if applicable)
- **Environment**: Browser version, extension version, operating system
- **Contact**: Your preferred method of communication for follow-up

### Response Timeline

- **Acknowledgment**: Within 48 hours of report
- **Initial Assessment**: Within 5 business days
- **Status Updates**: Weekly until resolution
- **Resolution**: Target 30 days for critical issues, 90 days for others

## Security Measures

### Content Security Policy

```json
{
  "content_security_policy": {
    "extension_pages": "script-src 'self'; object-src 'self'"
  }
}
```

Extension pages load no remote scripts and no remote stylesheets. Network access
is limited to the three provider hosts declared in `host_permissions`.

### Input validation

- **Message validation** (`src/utils/validation-service.js`): every
  `chrome.runtime` message must carry a string `actionType` from a known set and
  a valid sender, or it is rejected before any work is done.
- **Content length cap**: page text is clipped to 24,000 characters
  (`MAX_CONTENT_CHARS`) before being sent to a provider.
- **Question length cap**: 1,000 characters.
- **Output escaping**: model output is escaped with `escapeHtml()` *before* the
  small markdown subset is applied, so no tag or attribute from page-derived
  text can reach the DOM as markup. Covered by tests in
  `tests/popup/rendering.test.js`.

There is no DOMPurify and no Zod in this project. Escaping is done by a small
local function because the only markup ever produced is a fixed set of tags this
code inserts itself.

### Prompt injection

Page content is untrusted: a page can contain text designed to steer the model.
Mitigations in `core/tasks.js`:

- Extracted text is fenced inside `<<<PAGE_CONTENT>>>` markers.
- Every system prompt states that the fenced region is untrusted data and that
  directives inside it must not be followed.
- Prompts instruct the model to answer only from the fenced content and to say so
  when the content does not answer the question.

This reduces but does not eliminate the risk. Treat model output about a hostile
page as untrusted, and never act on it automatically. The extension performs no
actions on the user's behalf, which bounds the blast radius.

### API key handling

- Keys are stored in `chrome.storage.sync` under `user_preferences.apiKeys`.
- **Keys are not encrypted.** `chrome.storage.sync` is plaintext at the API level
  and syncs to the user's Google account. Anything running in the extension's own
  context can read them, as can anyone with access to the browser profile.
- Keys are sent only to the matching provider host over HTTPS, in a request
  header — never in a URL, where they would land in logs and history.
- Keys are never written to logs and never included in error messages; there is a
  regression test for this in `tests/providers/ai-client.test.js`.
- A key entered for one provider is never sent to another: the client is
  constructed from the selected provider's own key or it throws.

Use an API key scoped and budgeted for this extension, and revoke it if the
browser profile is compromised.

### Data handling

- Page text is sent to the provider you configured, and to nobody else. There is
  no backend and no analytics.
- Summaries and completed chat exchanges are stored locally
  (`chrome.storage.local`); a daily alarm prunes old entries.
- Export writes a JSON file to your machine. Nothing is uploaded.
- The content script only reads the DOM. It never modifies the page and has no
  network access of its own.

## Security Best Practices

### For Users

1. **Keep Extension Updated**: Always use the latest version
2. **Secure API Keys**: Use separate API keys for different applications
3. **Review Permissions**: Understand what permissions the extension requests
4. **Monitor Usage**: Regularly review your API usage and costs
5. **Report Issues**: Report any suspicious behavior immediately

### For Developers

1. **Code Review**: All code changes require security review
2. **Dependency Scanning**: Regular dependency vulnerability scanning
3. **Security Testing**: Automated security testing in CI/CD
4. **Principle of Least Privilege**: Minimal permission requests
5. **Input Validation**: Validate all inputs at boundaries

## Known Security Considerations

These are accepted risks, stated plainly rather than claimed as solved.

### API key exposure

**Risk**: keys are readable by anything with access to the extension context or
the browser profile, and they sync to the user's Google account.
**Mitigation**: keys stay out of logs, error messages, and URLs; only the
selected provider's key is ever loaded.
**Residual risk**: real. `chrome.storage.sync` is not a secret store, and Chrome
offers extensions no encrypted alternative. Scope and budget the key accordingly.

### Cross-site scripting

**Risk**: page text — and model output derived from it — could reach the DOM as
markup.
**Mitigation**: all such text is HTML-escaped before the fixed markdown subset is
applied; the extension pages run under `script-src 'self'`.
**Residual risk**: low. Tested in `tests/popup/rendering.test.js`.

### Prompt injection

**Risk**: a hostile page steers the model's output.
**Mitigation**: content fencing and explicit system-prompt instructions (above).
**Residual risk**: real — no prompt-level defence is complete. Bounded by the
extension taking no actions on the user's behalf.

### Data sent to third parties

**Risk**: page content, including anything sensitive on the page, is sent to the
configured AI provider.
**Mitigation**: the user chooses the provider and triggers each action
explicitly; content is capped at 24,000 characters; nothing is sent
automatically or in the background.
**Residual risk**: inherent to the product. Do not run AI actions on pages with
data you would not paste into that provider's console.

### Network interception

**Risk**: API traffic intercepted in transit.
**Mitigation**: HTTPS only, enforced by the CSP and by `host_permissions`.
There is no certificate pinning and no request signing — extensions cannot
pin certificates, and providers do not offer request signing.

## Compliance

### Privacy Regulations

- **GDPR**: European privacy regulation compliance
- **CCPA**: California privacy law compliance
- **Data Minimization**: Collect only necessary data
- **Right to Deletion**: Users can delete their data

### Security Standards

- **OWASP Top 10**: Address common vulnerabilities
- **Chrome Web Store Policies**: Compliance with store requirements
- **Security by Design**: Security considerations in all features

## Incident Response

### Response Team

- **Primary Contact**: Aaron Sequeira (aaronsequeira12@gmail.com)
- **Technical Lead**: Development team
- **Security Advisor**: External security consultant (if needed)

### Response Process

1. **Detection**: Vulnerability identified or reported
2. **Assessment**: Evaluate severity and impact
3. **Containment**: Implement immediate mitigations
4. **Investigation**: Determine root cause and scope
5. **Resolution**: Develop and deploy fix
6. **Communication**: Notify affected users
7. **Documentation**: Update security documentation
8. **Prevention**: Implement measures to prevent recurrence

### Severity Classification

**Critical**: 
- Remote code execution
- Arbitrary file access
- API key theft
- Complete system compromise

**High**: 
- Privilege escalation
- Significant data exposure
- Authentication bypass
- Persistent XSS

**Medium**: 
- Limited data exposure
- Reflected XSS
- CSRF vulnerabilities
- Information disclosure

**Low**: 
- Minor information leakage
- Configuration issues
- Non-security functionality issues

## Security Updates

### Update Process

1. Security fixes prioritized over feature development
2. Patches tested thoroughly before release
3. Emergency releases for critical vulnerabilities
4. Security advisories published when appropriate

### User Notification

- **Critical Issues**: Immediate notification via extension update
- **Important Issues**: Email notification to registered users
- **General Issues**: Release notes and changelog

## Resources

- [Chrome Extension Security](https://developer.chrome.com/docs/extensions/mv3/security/)
- [OWASP Web Application Security](https://owasp.org/www-project-top-ten/)
- [Mozilla Web Security Guidelines](https://infosec.mozilla.org/guidelines/web_security)
- [Google Security Best Practices](https://developers.google.com/web/fundamentals/security/)

## Contact

For security-related questions or concerns:

- **Email**: aaronsequeira12@gmail.com
- **Subject Line**: [SECURITY] GenAI Browser Tool - [Brief Description]
- **PGP Key**: Available upon request

---

*This security policy is reviewed and updated quarterly. Last updated: November 2024*