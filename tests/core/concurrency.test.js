import { describe, it, expect } from 'vitest';
import { mapWithConcurrency } from '../../background.js';

/** @param {number} ms */
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

describe('mapWithConcurrency', () => {
  it('preserves input order regardless of completion order', async () => {
    // Earlier items finish last, so a naive push-on-resolve would reorder them.
    const result = await mapWithConcurrency([30, 20, 10, 0], 2, async delay => {
      await sleep(delay);
      return delay;
    });

    expect(result).toEqual([30, 20, 10, 0]);
  });

  it('never exceeds the concurrency limit', async () => {
    let inFlight = 0;
    let peak = 0;

    await mapWithConcurrency(Array.from({ length: 8 }, (_, i) => i), 3, async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await sleep(5);
      inFlight -= 1;
    });

    // The whole point: eight sections must not become eight simultaneous
    // requests, which is a reliable way to trip a per-minute rate limit.
    expect(peak).toBeLessThanOrEqual(3);
    expect(peak).toBeGreaterThan(1);
  });

  it('passes the index through', async () => {
    const seen = await mapWithConcurrency(['a', 'b', 'c'], 2, async (item, index) =>
      `${index}:${item}`
    );
    expect(seen).toEqual(['0:a', '1:b', '2:c']);
  });

  it('handles an empty list without spawning workers', async () => {
    await expect(mapWithConcurrency([], 3, async () => 1)).resolves.toEqual([]);
  });

  it('handles fewer items than the limit', async () => {
    await expect(mapWithConcurrency([1, 2], 8, async n => n * 2)).resolves.toEqual([2, 4]);
  });

  it('propagates a rejection', async () => {
    await expect(
      mapWithConcurrency([1, 2, 3], 2, async n => {
        if (n === 2) throw new Error('section failed');
        return n;
      })
    ).rejects.toThrow('section failed');
  });
});
