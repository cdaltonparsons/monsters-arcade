import { describe, expect, it } from 'vitest';
import {
  closestHiddenFriend,
  closestSpot,
  FIELD_HEIGHT,
  FIELD_WIDTH,
  fillSpots,
  friendsForRound,
  generateField,
  hidePoint,
  hintFor,
  rustleEvery,
  SEARCH_REACH,
  seekerMayStart,
  seekerRoute,
  spotsToSearch,
  type Spot,
} from './rules';

/** Small seeded random numbers, so a failing field can be reproduced. */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const SEEDS = Array.from({ length: 500 }, (_, index) => index + 1);

const bushAt = (x: number, y: number): Spot => ({ kind: 'bush', x, y });

describe('generateField', () => {
  it('keeps every spot on the field, far apart, and with room to hide', () => {
    for (const seed of SEEDS) {
      const { spots } = generateField(seeded(seed));
      expect(spots).toHaveLength(14);
      spots.forEach((spot, index) => {
        const hide = hidePoint(spot);
        expect(hide.x).toBeGreaterThan(90);
        expect(hide.x).toBeLessThan(FIELD_WIDTH - 90);
        expect(hide.y).toBeGreaterThan(90);
        expect(spot.y).toBeLessThan(FIELD_HEIGHT);
        for (const other of spots.slice(index + 1)) {
          expect(Math.hypot(spot.x - other.x, spot.y - other.y)).toBeGreaterThan(350);
        }
      });
    }
  });

  it('never starts the hero already touching a spot', () => {
    for (const seed of SEEDS) {
      const field = generateField(seeded(seed));
      expect(spotsToSearch(field.start, field.spots, new Set())).toEqual([]);
    }
  });

  it('always has some of every kind of spot', () => {
    for (const seed of SEEDS) {
      const kinds = new Set(generateField(seeded(seed)).spots.map((spot) => spot.kind));
      expect(kinds).toEqual(new Set(['bush', 'tree', 'boulder', 'crate']));
    }
  });
});

describe('friendsForRound', () => {
  it('adds a friend each round, up to a limit', () => {
    expect([1, 2, 3, 4, 5, 50].map(friendsForRound)).toEqual([3, 4, 5, 6, 6, 6]);
  });
});

describe('fillSpots', () => {
  it('hides exactly the right number of friends, with a surprise everywhere else', () => {
    for (const seed of SEEDS) {
      const surprises = fillSpots(14, 4, seeded(seed));
      expect(surprises).toHaveLength(14);
      expect(surprises.filter((surprise) => surprise === 'friend')).toHaveLength(4);
      expect(surprises.filter((surprise) => surprise === 'star').length).toBeGreaterThan(0);
      expect(surprises.filter((surprise) => surprise === 'butterfly').length).toBeGreaterThan(0);
    }
  });

  it('copes with more friends than spots', () => {
    expect(fillSpots(2, 5)).toEqual(['friend', 'friend']);
  });
});

describe('spotsToSearch', () => {
  const spots = [bushAt(500, 500), bushAt(1500, 500)];

  it('finds spots in reach, and skips ones already searched', () => {
    const nearFirst = hidePoint(spots[0]);
    expect(spotsToSearch(nearFirst, spots, new Set())).toEqual([0]);
    expect(spotsToSearch(nearFirst, spots, new Set([0]))).toEqual([]);
  });

  it('ignores spots out of reach', () => {
    const { x, y } = hidePoint(spots[0]);
    expect(spotsToSearch({ x: x + SEARCH_REACH + 1, y }, spots, new Set())).toEqual([]);
  });
});

describe('closestSpot', () => {
  const spots = [bushAt(500, 500), bushAt(1500, 500)];

  it('picks the nearest one', () => {
    expect(closestSpot({ x: 1400, y: 400 }, spots)).toBe(1);
  });

  it('gives null when nothing is in reach', () => {
    expect(closestSpot({ x: 1000, y: 400 }, spots, 100)).toBeNull();
  });
});

describe('closestHiddenFriend', () => {
  const spots = [bushAt(500, 500), bushAt(1000, 500), bushAt(1500, 500)];

  it('ignores spots with no friend and friends already found', () => {
    const surprises = ['friend', 'star', 'friend'] as const;
    expect(closestHiddenFriend({ x: 1000, y: 400 }, spots, surprises, new Set([0]))).toBe(2);
  });

  it('gives null when everyone is found', () => {
    expect(closestHiddenFriend({ x: 0, y: 0 }, spots, ['friend', 'star', 'star'], new Set([0]))).toBeNull();
  });
});

describe('hints', () => {
  it('get stronger with time', () => {
    expect([0, 11999, 12000, 24999, 25000].map(hintFor)).toEqual(['rustle', 'rustle', 'peek', 'peek', 'arrow']);
  });

  it('come faster the closer the hero gets', () => {
    expect(rustleEvery(300)).toBeLessThan(rustleEvery(800));
    expect(rustleEvery(800)).toBeLessThan(rustleEvery(2000));
  });
});

describe('seekerMayStart', () => {
  it('waits for the count and for the hero to settle', () => {
    expect(seekerMayStart(4, 5000)).toBe(false);
    expect(seekerMayStart(5, 0)).toBe(false);
    expect(seekerMayStart(5, 800)).toBe(true);
  });
});

describe('seekerRoute', () => {
  it('makes a few different wrong guesses, then always finds the hero', () => {
    for (const seed of SEEDS) {
      const field = generateField(seeded(seed));
      const heroSpot = seed % field.spots.length;
      const route = seekerRoute(field.start, field.spots, heroSpot, seeded(seed));

      expect(route[route.length - 1]).toBe(heroSpot);
      expect(route.length).toBeGreaterThanOrEqual(3);
      expect(route.length).toBeLessThanOrEqual(5);
      expect(new Set(route).size).toBe(route.length);
    }
  });
});
