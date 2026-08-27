import { describe, it, expect } from 'vitest';
import {
  MAX_QUESTION_CHARS,
  isValidQuestion,
  validateMessage
} from '../../utils/validation-service.js';

describe('validateMessage', () => {
  const sender = { id: 'mock-extension-id' };

  it('accepts a well-formed message from this extension', () => {
    expect(validateMessage({ actionType: 'GET_PROVIDER_STATUS' }, sender)).toBe(true);
  });

  it.each([
    ['null message', null],
    ['a non-object message', 'GET_HISTORY'],
    ['a missing actionType', {}],
    ['an empty actionType', { actionType: '' }],
    ['a non-string actionType', { actionType: 42 }]
  ])('rejects %s', (_label, message) => {
    expect(validateMessage(message, sender)).toBe(false);
  });

  it('rejects a message with no sender', () => {
    expect(validateMessage({ actionType: 'GET_HISTORY' }, null)).toBe(false);
  });

  // `externally_connectable` is not declared, so Chrome should never deliver
  // one of these. Defence in depth against that assumption changing.
  it('rejects a sender that is not this extension', () => {
    expect(validateMessage({ actionType: 'GET_HISTORY' }, { id: 'some-other-extension' }))
      .toBe(false);
  });
});

describe('isValidQuestion', () => {
  it('accepts an ordinary question', () => {
    expect(isValidQuestion('What is this page about?')).toBe(true);
  });

  it('rejects empty and whitespace-only questions', () => {
    expect(isValidQuestion('')).toBe(false);
    expect(isValidQuestion('   \n ')).toBe(false);
  });

  it('rejects non-strings', () => {
    expect(isValidQuestion(undefined)).toBe(false);
    expect(isValidQuestion(null)).toBe(false);
    expect(isValidQuestion(12)).toBe(false);
  });

  it('caps question length', () => {
    expect(isValidQuestion('x'.repeat(MAX_QUESTION_CHARS))).toBe(true);
    expect(isValidQuestion('x'.repeat(MAX_QUESTION_CHARS + 1))).toBe(false);
  });

  // Regression: the filter this replaced held /gi regexes as instance fields
  // and called `.test()` on them, so `lastIndex` persisted between calls and
  // the same question was blocked, then allowed, then blocked again.
  it('returns the same verdict for the same question every time', () => {
    const question = 'What does javascript: mean, and what is the <iframe> for?';
    const verdicts = Array.from({ length: 6 }, () => isValidQuestion(question));

    expect(new Set(verdicts).size).toBe(1);
  });

  // Regression: /on\w+\s*=/ and /<iframe/ rejected these outright.
  it.each([
    'Is there only one=1 result?',
    'What does the onclick= attribute do on this page?',
    'What is the <iframe> for?',
    'Summarise the section on eval (x)'
  ])('accepts the legitimate question %j', question => {
    expect(isValidQuestion(question)).toBe(true);
  });
});
