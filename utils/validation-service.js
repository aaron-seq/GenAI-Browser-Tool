/**
 * @file utils/validation-service.js
 * @description Validation for input crossing the extension's trust boundary.
 *
 * Deliberately small. The version this replaces exported a 14-method class of
 * which exactly two methods were ever called: URL checks, file-upload checks,
 * API-key format regexes, an HTML sanitizer, an entity decoder, and a schema
 * validator all had zero callers. They were deleted rather than maintained.
 *
 * The deleted set also included a `containsMaliciousContent` filter that guarded
 * `isValidQuestion`. It was worse than nothing:
 *
 *   1. Its patterns were instance fields carrying the `g` flag, and
 *      `RegExp.prototype.test` advances `lastIndex` on a global regex. Reusing
 *      one across calls meant the same question was blocked, then allowed, then
 *      blocked — a security check that alternated with call parity.
 *   2. `/on\w+\s*=/` rejected "Is there only one=1 result?", and `/<iframe/`
 *      rejected "What is the <iframe> for?".
 *
 * It also guarded nothing. A question is the user's own text, sent to the
 * provider the user configured. It is never evaluated, never interpolated into
 * markup, and reaches the DOM only through `renderMarkdown`, which escapes.
 */

/** Longest accepted question. Bounds token spend; not a security boundary. */
export const MAX_QUESTION_CHARS = 1000;

/**
 * Accept a `chrome.runtime` message only if it is well formed and came from
 * this extension.
 *
 * `externally_connectable` is not declared in the manifest, so Chrome should
 * never deliver a message from a web page or another extension. The sender-id
 * check is defence in depth against that assumption changing, not the primary
 * boundary. Unknown `actionType` values are rejected by the router's `default`
 * case before any work happens, so this does not duplicate that list.
 *
 * @param {any} message
 * @param {any} sender
 * @returns {boolean}
 */
export function validateMessage(message, sender) {
  if (!message || typeof message !== 'object') return false;
  if (typeof message.actionType !== 'string' || message.actionType.length === 0) return false;
  if (!sender) return false;

  const ownId = globalThis.chrome?.runtime?.id;
  return !ownId || sender.id === ownId;
}

/**
 * A question is valid when it is a non-empty string within the length cap.
 *
 * @param {any} question
 * @returns {boolean}
 */
export function isValidQuestion(question) {
  if (typeof question !== 'string') return false;
  const trimmed = question.trim();
  return trimmed.length > 0 && trimmed.length <= MAX_QUESTION_CHARS;
}
