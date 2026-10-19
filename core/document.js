/** Shared identity and input limits for a page or an imported text book. */
export const MAX_DOCUMENT_CHARS = 2_000_000;

/** @param {string} text */
export function validateDocument(text) {
  if (typeof text !== 'string' || !text.trim())
    throw new Error('No readable document text');
  if (text.length > MAX_DOCUMENT_CHARS) {
    throw new Error(
      'This document exceeds 2,000,000 characters. Open or import a smaller part.'
    );
  }
}

/**
 * Include the content so a changed page at the same URL starts a fresh thread.
 * @param {string} url
 * @param {string} text
 * @returns {Promise<string>}
 */
export async function documentKey(url, text) {
  validateDocument(text);
  const bytes = new TextEncoder().encode(
    JSON.stringify([url || '', text.trim()])
  );
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), byte =>
    byte.toString(16).padStart(2, '0')
  ).join('');
}
