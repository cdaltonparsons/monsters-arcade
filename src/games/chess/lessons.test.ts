import { describe, expect, it } from 'vitest';
import { isSolution, makeLesson, type Topic } from './lessons';
import { applyMove, gameStatus, inCheck, legalMoves, sameSquare } from './rules';

/** Small seeded random numbers, so a failing lesson can be reproduced. */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const SEEDS = Array.from({ length: 60 }, (_, index) => index + 1);
const TOPICS: Topic[] = ['move', 'catch', 'rescue', 'mate'];

describe('lessons', () => {
  it('always gives a legal answer that the lesson accepts', () => {
    for (const topic of TOPICS) {
      for (const seed of SEEDS) {
        const lesson = makeLesson(topic, seed % 8, seeded(seed));
        expect(lesson.topic).toBe(topic);
        expect(legalMoves(lesson.position)).toContainEqual(lesson.solution);
        expect(isSolution(lesson, lesson.solution)).toBe(true);
      }
    }
  });

  it('starts "how they move" with one lesson for each piece', () => {
    const pieces = [0, 1, 2, 3, 4, 5].map((number) => makeLesson('move', number, seeded(number)).piece);
    expect(new Set(pieces).size).toBe(6);
  });

  it('puts the star where the piece can go', () => {
    for (const seed of SEEDS) {
      const lesson = makeLesson('move', seed, seeded(seed));
      expect(lesson.star && sameSquare(lesson.star, lesson.solution.to)).toBe(true);
    }
  });

  it('has exactly one monster to catch', () => {
    for (const seed of SEEDS) {
      const lesson = makeLesson('catch', 0, seeded(seed));
      expect(legalMoves(lesson.position).filter((move) => move.captured)).toHaveLength(1);
      expect(lesson.solution.captured?.kind).toBe(lesson.target);
    }
  });

  it('rescues the king by catching the attacker with a helper', () => {
    for (const seed of SEEDS) {
      const lesson = makeLesson('rescue', 0, seeded(seed));
      expect(inCheck(lesson.position, 'w')).toBe(true);
      expect(lesson.solution.captured?.kind).toBe(lesson.target);
      expect(lesson.solution.piece.kind).not.toBe('k');
      expect(inCheck(applyMove(lesson.position, lesson.solution), 'w')).toBe(false);
    }
  });

  it('has exactly one checkmate', () => {
    for (const seed of SEEDS) {
      const lesson = makeLesson('mate', 0, seeded(seed));
      const mates = legalMoves(lesson.position).filter(
        (move) => gameStatus(applyMove(lesson.position, move)) === 'checkmate',
      );
      expect(mates).toHaveLength(1);
      expect(isSolution(lesson, mates[0])).toBe(true);
    }
  });
});
