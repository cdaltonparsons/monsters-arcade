import { describe, expect, it } from 'vitest';
import { buddyFor, DEFAULT_AVATAR, OPTIONS } from './avatar';
import { closestWithin, leash, trotAfter } from './coop';

const limits = { maxDx: 800, maxDy: 1200 };

describe('leash', () => {
  it('leaves the push alone while the monsters are close', () => {
    expect(leash({ x: 1, y: -1 }, { x: 100, y: 100 }, { x: 0, y: 0 }, limits)).toEqual({ x: 1, y: -1 });
  });

  it('stops walking further away at the edge', () => {
    expect(leash({ x: 1, y: 0.5 }, { x: 800, y: 0 }, { x: 0, y: 0 }, limits)).toEqual({ x: 0, y: 0.5 });
    expect(leash({ x: 0.3, y: -1 }, { x: 0, y: -1300 }, { x: 0, y: 0 }, limits)).toEqual({ x: 0.3, y: 0 });
  });

  it('always lets you walk back', () => {
    expect(leash({ x: -1, y: 0 }, { x: 900, y: 0 }, { x: 0, y: 0 }, limits)).toEqual({ x: -1, y: 0 });
  });
});

describe('trotAfter', () => {
  it('stays put when close to the friend', () => {
    expect(trotAfter({ x: 0, y: 0 }, { x: 200, y: 0 })).toEqual({ x: 0, y: 0 });
  });

  it('heads towards the friend, faster when further behind', () => {
    const near = trotAfter({ x: 0, y: 0 }, { x: 400, y: 0 });
    const far = trotAfter({ x: 0, y: 0 }, { x: 2000, y: 0 });
    expect(near.x).toBeGreaterThan(0);
    expect(near.y).toBe(0);
    expect(far.x).toBeGreaterThan(near.x);
    expect(far.x).toBeLessThanOrEqual(1);
  });
});

describe('closestWithin', () => {
  it('picks the nearest player in reach', () => {
    expect(closestWithin([{ x: 0, y: 0 }, { x: 90, y: 0 }], { x: 100, y: 0 }, 150)).toBe(1);
  });

  it('gives -1 when nobody is near', () => {
    expect(closestWithin([{ x: 0, y: 0 }], { x: 500, y: 0 }, 150)).toBe(-1);
  });
});

describe('buddyFor', () => {
  it('never matches player 1, whatever colour or body they pick', () => {
    for (const color of OPTIONS.color) {
      for (const body of OPTIONS.body) {
        const buddy = buddyFor({ ...DEFAULT_AVATAR, color, body });
        expect(buddy.color).not.toBe(color);
        expect(buddy.body).not.toBe(body);
      }
    }
  });
});
