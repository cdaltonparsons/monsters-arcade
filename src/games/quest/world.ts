/**
 * Decides where everything goes in the world, with no graphics. A new world is
 * made every round, and world.test.ts checks a few thousand of them can be played.
 */
export interface Point {
  x: number;
  y: number;
}

export type ObstacleKind = 'tree' | 'rock' | 'pond' | 'house';

/** Something solid. Monsters can't walk through the circle at (x, y). */
export interface Obstacle extends Point {
  kind: ObstacleKind;
  radius: number;
}

export interface World {
  home: Obstacle;
  /** Where the hero starts: just in front of the door. */
  start: Point;
  obstacles: Obstacle[];
  babies: Point[];
  stars: Point[];
}

export const WORLD_WIDTH = 2400;
export const WORLD_HEIGHT = 3400;
export const HERO_RADIUS = 55;

/**
 * Space kept clear around everything solid. Every gap is wider than the hero,
 * which is what guarantees nothing can ever be walled off.
 */
const CLEARANCE = HERO_RADIUS * 2 + 40;
const MIN_BABY_DISTANCE_FROM_HOME = 800;
const MIN_DISTANCE_BETWEEN_BABIES = 600;

const TREE_LEAVES_WIDE = 170;
const TREE_LEAVES_TALL = 390;

const RADIUS: Record<ObstacleKind, number> = { tree: 42, rock: 80, pond: 200, house: 150 };
const COUNTS: [ObstacleKind, number][] = [['pond', 3], ['rock', 12], ['tree', 28]];

type Random = () => number;

const distance = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);

function randomPoint(margin: number, random: Random): Point {
  return {
    x: margin + random() * (WORLD_WIDTH - margin * 2),
    y: margin + random() * (WORLD_HEIGHT - margin * 2),
  };
}

const isClearOf = (point: Point, radius: number, obstacles: Obstacle[]): boolean =>
  obstacles.every((other) => distance(point, other) >= other.radius + radius + CLEARANCE);

export function generateWorld(babyCount: number, starCount: number, random: Random = Math.random): World {
  const home: Obstacle = { kind: 'house', x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2, radius: RADIUS.house };
  const start = { x: home.x, y: home.y + home.radius + CLEARANCE };
  const obstacles: Obstacle[] = [home];

  // Keep some open grass around the hero's starting spot.
  const startSpace: Obstacle = { kind: 'rock', ...start, radius: 260 };

  // Try lots of random spots, biggest things first. A spot that's too close to
  // something is simply thrown away, so a crowded world just has fewer trees.
  for (const [kind, count] of COUNTS) {
    const radius = RADIUS[kind];
    for (let placed = 0, tries = 0; placed < count && tries < count * 30; tries++) {
      const point = randomPoint(radius + CLEARANCE, random);
      if (isClearOf(point, radius, [...obstacles, startSpace])) {
        obstacles.push({ kind, radius, ...point });
        placed++;
      }
    }
  }

  // Pickups go anywhere the hero's whole body can reach, but not behind the
  // leaves of a tree, where a child couldn't see them.
  const hiddenByTree = (point: Point): boolean =>
    obstacles.some(
      (other) =>
        other.kind === 'tree' &&
        Math.abs(point.x - other.x) < TREE_LEAVES_WIDE &&
        point.y < other.y &&
        point.y > other.y - TREE_LEAVES_TALL,
    );
  const placeable = (): Point => {
    for (;;) {
      const point = randomPoint(HERO_RADIUS + 10, random);
      const reachable = obstacles.every((other) => distance(point, other) >= other.radius + HERO_RADIUS + 10);
      if (reachable && !hiddenByTree(point)) return point;
    }
  };

  const babies: Point[] = [];
  for (let tries = 0; babies.length < babyCount; tries++) {
    const point = placeable();
    // If the world is too crowded to keep them far apart, relax that rule.
    const spacing = tries < 2000 ? MIN_DISTANCE_BETWEEN_BABIES : 0;
    const farFromHome = distance(point, home) >= MIN_BABY_DISTANCE_FROM_HOME;
    if (farFromHome && babies.every((baby) => distance(point, baby) >= spacing)) babies.push(point);
  }

  return { home, start, obstacles, babies, stars: Array.from({ length: starCount }, placeable) };
}
