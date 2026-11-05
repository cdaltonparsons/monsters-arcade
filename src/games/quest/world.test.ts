import { describe, expect, it } from 'vitest';
import { generateWorld, HERO_RADIUS, WORLD_HEIGHT, WORLD_WIDTH, type Point, type World } from './world';

/** Small seeded random numbers, so a failing world can be reproduced. */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const STEP = 20;

/** Spreads out from the start on a grid, as if the hero walked everywhere. */
function walkableFromStart(world: World): (point: Point) => boolean {
  const columns = Math.ceil(WORLD_WIDTH / STEP);
  const rows = Math.ceil(WORLD_HEIGHT / STEP);
  const seen = new Uint8Array(columns * rows);
  const fits = (x: number, y: number) =>
    x >= HERO_RADIUS && y >= HERO_RADIUS && x <= WORLD_WIDTH - HERO_RADIUS && y <= WORLD_HEIGHT - HERO_RADIUS &&
    world.obstacles.every((o) => Math.hypot(x - o.x, y - o.y) >= o.radius + HERO_RADIUS);

  const first = [Math.round(world.start.x / STEP), Math.round(world.start.y / STEP)];
  const stack = [first];
  seen[first[1] * columns + first[0]] = 1;
  while (stack.length > 0) {
    const [c, r] = stack.pop()!;
    for (const [nc, nr] of [[c + 1, r], [c - 1, r], [c, r + 1], [c, r - 1]]) {
      if (nc < 0 || nr < 0 || nc >= columns || nr >= rows || seen[nr * columns + nc]) continue;
      if (!fits(nc * STEP, nr * STEP)) continue;
      seen[nr * columns + nc] = 1;
      stack.push([nc, nr]);
    }
  }
  // A pickup counts as reached if the hero can get anywhere close to it.
  return (point) => {
    const c = Math.round(point.x / STEP);
    const r = Math.round(point.y / STEP);
    for (let dr = -4; dr <= 4; dr++) {
      for (let dc = -4; dc <= 4; dc++) {
        if (seen[(r + dr) * columns + c + dc]) return true;
      }
    }
    return false;
  };
}

describe('generateWorld', () => {
  it('always makes the babies and stars reachable', () => {
    for (let seed = 0; seed < 30; seed++) {
      const world = generateWorld(8, 20, seeded(seed));
      const canReach = walkableFromStart(world);
      expect(world.babies).toHaveLength(8);
      expect(world.babies.every(canReach)).toBe(true);
      expect(world.stars.every(canReach)).toBe(true);
    }
  });

  it('never starts the hero inside something solid', () => {
    for (let seed = 0; seed < 2000; seed++) {
      const world = generateWorld(4, 5, seeded(seed));
      for (const obstacle of world.obstacles) {
        const gap = Math.hypot(world.start.x - obstacle.x, world.start.y - obstacle.y);
        expect(gap).toBeGreaterThanOrEqual(obstacle.radius + HERO_RADIUS);
      }
    }
  });

  it('fills the world with plenty to walk around', () => {
    const world = generateWorld(4, 20, seeded(1));
    expect(world.obstacles.length).toBeGreaterThan(30);
  });
});
