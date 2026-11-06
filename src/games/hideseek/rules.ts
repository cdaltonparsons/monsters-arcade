/**
 * The rules of hide and seek, with no graphics: where the hiding spots go, what
 * is behind each one, when to give a hint, and where a seeking monster looks.
 * rules.test.ts checks all of it without ever starting Phaser.
 */
export interface Point {
  x: number;
  y: number;
}

export type SpotKind = 'bush' | 'tree' | 'boulder' | 'crate';

/** A place to hide. (x, y) is where it touches the ground. */
export interface Spot extends Point {
  kind: SpotKind;
}

export interface Field {
  start: Point;
  spots: Spot[];
}

/** What you find when you look behind a spot. There's never nothing there. */
export type Surprise = 'friend' | 'star' | 'butterfly';

export type Hint = 'rustle' | 'peek' | 'arrow';

export const FIELD_WIDTH = 2000;
export const FIELD_HEIGHT = 2800;

/** How close the hero has to be to look behind a spot. */
export const SEARCH_REACH = 200;
/** How close the hero has to be to duck behind a spot. A bit more forgiving. */
export const HIDE_REACH = 280;

const COLUMNS = 3;
const ROWS = 5;
const FIRST_ROW_Y = 420; // Leaves room for a tall tree at the top of the field.
const ROW_GAP = 520;
const JITTER_X = 120;
const JITTER_Y = 80;

const KINDS: SpotKind[] = ['bush', 'tree', 'boulder', 'crate'];

const FIRST_ROUND_FRIENDS = 3;
const MOST_FRIENDS = 6;

const PEEK_AFTER_MS = 12000;
const ARROW_AFTER_MS = 25000;

const MIN_WRONG_GUESSES = 2;
const MAX_WRONG_GUESSES = 4;

const SEEKER_MIN_COUNT = 5;
const SEEKER_WAITS_MS = 800;

type Random = () => number;

const distance = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);

function shuffled<T>(items: readonly T[], random: Random): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Spots sit on a wobbly grid, not at purely random places. A grid promises they
 * spread evenly and never overlap, and the wobble stops it looking like one.
 * The middle square is left empty for the hero to start in.
 */
export function generateField(random: Random = Math.random): Field {
  const start = { x: FIELD_WIDTH / 2, y: FIRST_ROW_Y + ROW_GAP * Math.floor(ROWS / 2) };
  const places: Point[] = [];
  for (let row = 0; row < ROWS; row++) {
    for (let column = 0; column < COLUMNS; column++) {
      const isMiddle = row === Math.floor(ROWS / 2) && column === Math.floor(COLUMNS / 2);
      if (isMiddle) continue;
      places.push({
        x: (FIELD_WIDTH * (column + 0.5)) / COLUMNS + (random() * 2 - 1) * JITTER_X,
        y: FIRST_ROW_Y + row * ROW_GAP + (random() * 2 - 1) * JITTER_Y,
      });
    }
  }
  // Deal the kinds out in turn, so the field always has some of each.
  const spots = shuffled(places, random).map((place, index) => ({ ...place, kind: KINDS[index % KINDS.length] }));
  return { start, spots };
}

/**
 * Where a monster stands to hide. Behind a low spot the hero's ears still poke
 * out, so a little one never loses track of themselves. Tree leaves are high up,
 * so a tree's spot is further back.
 */
export function hidePoint(spot: Spot): Point {
  return { x: spot.x, y: spot.y - (spot.kind === 'tree' ? 220 : 165) };
}

/** One more friend each round, up to a limit. */
export function friendsForRound(round: number): number {
  return Math.min(FIRST_ROUND_FRIENDS + round - 1, MOST_FRIENDS);
}

/** Decides what's behind every spot, one entry per spot, in the same order. */
export function fillSpots(spotCount: number, friendCount: number, random: Random = Math.random): Surprise[] {
  const friends = Math.min(friendCount, spotCount);
  const others = Array.from({ length: spotCount - friends }, (_, index): Surprise =>
    index % 2 === 0 ? 'star' : 'butterfly',
  );
  return shuffled([...Array<Surprise>(friends).fill('friend'), ...others], random);
}

/** The spots the hero is close enough to look behind right now. */
export function spotsToSearch(from: Point, spots: Spot[], searched: ReadonlySet<number>): number[] {
  return spots.flatMap((spot, index) =>
    !searched.has(index) && distance(from, hidePoint(spot)) < SEARCH_REACH ? [index] : [],
  );
}

/** The nearest spot within reach, or null if there isn't one. */
export function closestSpot(from: Point, spots: Spot[], reach = Infinity): number | null {
  let best: number | null = null;
  let bestDistance = reach;
  spots.forEach((spot, index) => {
    const away = distance(from, hidePoint(spot));
    if (away < bestDistance) {
      best = index;
      bestDistance = away;
    }
  });
  return best;
}

/** The nearest spot that still has a friend behind it, or null when all are found. */
export function closestHiddenFriend(
  from: Point,
  spots: Spot[],
  surprises: readonly Surprise[],
  searched: ReadonlySet<number>,
): number | null {
  const stillHidden = spots.map((spot, index) => ({ spot, index }))
    .filter(({ index }) => surprises[index] === 'friend' && !searched.has(index));
  if (stillHidden.length === 0) return null;
  return stillHidden.reduce((best, next) =>
    distance(from, hidePoint(next.spot)) < distance(from, hidePoint(best.spot)) ? next : best,
  ).index;
}

/** Hints get stronger the longer it's been since the last find, so nobody stays stuck. */
export function hintFor(msSinceLastFind: number): Hint {
  if (msSinceLastFind >= ARROW_AFTER_MS) return 'arrow';
  if (msSinceLastFind >= PEEK_AFTER_MS) return 'peek';
  return 'rustle';
}

/** A hiding friend gets fidgety when the hero is close: "warmer, warmer!" */
export function rustleEvery(distanceToFriend: number): number {
  if (distanceToFriend < 500) return 1200;
  if (distanceToFriend < 1000) return 2200;
  return 3500;
}

/** The seeker counts to at least 5, and only comes looking once the hero has settled. */
export function seekerMayStart(count: number, hiddenForMs: number): boolean {
  return count >= SEEKER_MIN_COUNT && hiddenForMs >= SEEKER_WAITS_MS;
}

/**
 * Where the seeker looks, in order: a few wrong guesses for the suspense, then
 * the right one. Being found is the fun part, so the seeker always gets there.
 */
export function seekerRoute(from: Point, spots: Spot[], heroSpot: number, random: Random = Math.random): number[] {
  const wrongCount = MIN_WRONG_GUESSES + Math.floor(random() * (MAX_WRONG_GUESSES - MIN_WRONG_GUESSES + 1));
  const others = spots.map((_, index) => index).filter((index) => index !== heroSpot);
  const remaining = shuffled(others, random).slice(0, wrongCount);

  // Always walk to the nearest one next, so the seeker doesn't zigzag.
  const route: number[] = [];
  let here = from;
  while (remaining.length > 0) {
    const nearest = closestSpot(here, remaining.map((index) => spots[index]))!;
    const [next] = remaining.splice(nearest, 1);
    route.push(next);
    here = hidePoint(spots[next]);
  }
  return [...route, heroSpot];
}
