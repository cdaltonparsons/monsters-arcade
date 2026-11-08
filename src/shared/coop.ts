/**
 * Rules for two players on one screen. There's no Phaser in here, so coop.test.ts
 * can check them without starting a game.
 *
 * Both monsters share one camera, so neither may walk so far that the other goes
 * off screen. Instead of a wall, the "leash" simply stops you walking further
 * away: you can still walk any other way, and walking back is always fine.
 */
export interface Point {
  x: number;
  y: number;
}

/** How far apart the two monsters may get, so both always fit on screen. */
export interface Leash {
  maxDx: number;
  maxDy: number;
}

/** Takes away the part of `push` that would pull `self` further from `other`. */
export function leash(push: Point, self: Point, other: Point, limits: Leash): Point {
  const dx = self.x - other.x;
  const dy = self.y - other.y;
  let { x, y } = push;
  if (Math.abs(dx) >= limits.maxDx && Math.sign(x) === Math.sign(dx)) x = 0;
  if (Math.abs(dy) >= limits.maxDy && Math.sign(y) === Math.sign(dy)) y = 0;
  return { x, y };
}

const FOLLOW_FROM = 300; // Start trotting after the friend when further than this...
const FULL_SPEED_AT = 700; // ...and go full speed when this far behind.
export const IDLE_BEFORE_FOLLOW = 900; // Milliseconds of no touching before trotting.

/**
 * When the little one lets go, their monster trots back to the big one's side,
 * like a puppy. Returns how hard to push: nothing when already close by.
 */
export function trotAfter(self: Point, friend: Point): Point {
  const dx = friend.x - self.x;
  const dy = friend.y - self.y;
  const distance = Math.hypot(dx, dy);
  if (distance <= FOLLOW_FROM) return { x: 0, y: 0 };
  const strength = Math.min(1, 0.4 + (0.6 * (distance - FOLLOW_FROM)) / (FULL_SPEED_AT - FOLLOW_FROM));
  return { x: (dx / distance) * strength, y: (dy / distance) * strength };
}

/** Whoever is closest gets it. Returns the index into `players`, or -1 if nobody is near. */
export function closestWithin(players: Point[], target: Point, reach: number): number {
  let best = -1;
  let bestDistance = reach;
  players.forEach((player, index) => {
    const distance = Math.hypot(player.x - target.x, player.y - target.y);
    if (distance < bestDistance) {
      best = index;
      bestDistance = distance;
    }
  });
  return best;
}
