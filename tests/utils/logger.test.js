import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Logger } from '../../utils/logger.js';

describe('Logger', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('tags every line with its context so service worker logs are traceable', () => {
    new Logger('BackgroundService').info('Service initialized');

    expect(console.info).toHaveBeenCalledWith('[BackgroundService] Service initialized', '');
  });

  it('passes structured data through when given', () => {
    new Logger('Test').warn('Retrying', { attempt: 2 });

    expect(console.warn).toHaveBeenCalledWith('[Test] Retrying', { attempt: 2 });
  });

  it('suppresses levels below the configured one', () => {
    // Default level is info, so debug should not reach the console.
    new Logger('Test').debug('noisy detail');

    expect(console.debug).not.toHaveBeenCalled();
  });

  it('emits every level at or above the configured one', () => {
    const logger = new Logger('Test');

    logger.info('i');
    logger.warn('w');
    logger.error('e');

    expect(console.info).toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalled();
    expect(console.error).toHaveBeenCalled();
  });

  it('can be turned up to debug for troubleshooting', () => {
    const logger = new Logger('Test');
    logger.setLogLevel('debug');

    logger.debug('now visible');

    expect(console.debug).toHaveBeenCalledWith('[Test] now visible', '');
  });

  it('can be turned down to error only', () => {
    const logger = new Logger('Test');
    logger.setLogLevel('error');

    logger.info('hidden');
    logger.warn('also hidden');
    logger.error('shown');

    expect(console.info).not.toHaveBeenCalled();
    expect(console.warn).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalled();
  });

  it('does not throw on an unrecognised level', () => {
    const logger = new Logger('Test');
    logger.setLogLevel('nonsense');

    expect(() => logger.info('still works')).not.toThrow();
  });

  it('defaults its context when none is given', () => {
    new Logger().info('anonymous');

    expect(console.info).toHaveBeenCalledWith('[GenAI] anonymous', '');
  });
});
