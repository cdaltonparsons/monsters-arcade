import { describe, expect, it } from 'vitest';
import { evaluate, pickMove } from './ai';
import { applyMove, fromFen, gameStatus, legalMoves, startPosition, type Move, type Position } from './rules';

/** Small seeded random numbers, so a failing game can be reproduced. */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

/**
 * "Perft" counts every possible game a few moves deep. The right totals are well
 * known, so matching them is a strong sign every rule is right.
 */
function perft(position: Position, depth: number): number {
  if (depth === 0) return 1;
  return legalMoves(position).reduce((total, move) => total + perft(applyMove(position, move), depth - 1), 0);
}

/** Finds a move written like "e2e4". */
function move(position: Position, text: string): Move {
  const square = (s: string) => ({ row: 8 - Number(s[1]), col: s.charCodeAt(0) - 97 });
  const from = square(text.slice(0, 2));
  const to = square(text.slice(2, 4));
  const found = legalMoves(position, from).find((m) => m.to.row === to.row && m.to.col === to.col);
  if (!found) throw new Error(`${text} is not legal`);
  return found;
}

function play(position: Position, ...moves: string[]): Position {
  return moves.reduce((pos, text) => applyMove(pos, move(pos, text)), position);
}

describe('rules', () => {
  it('counts the right number of games from the start', () => {
    const start = startPosition();
    expect(perft(start, 1)).toBe(20);
    expect(perft(start, 2)).toBe(400);
    expect(perft(start, 3)).toBe(8902);
  });

  it('counts the right number of games from a tricky position with castling, en passant and promotion', () => {
    // "Kiwipete", a famous test position.
    const kiwipete = fromFen('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq -');
    expect(perft(kiwipete, 1)).toBe(48);
    expect(perft(kiwipete, 2)).toBe(2039);
  });

  it('spots checkmate', () => {
    const foolsMate = play(startPosition(), 'f2f3', 'e7e5', 'g2g4', 'd8h4');
    expect(gameStatus(foolsMate)).toBe('checkmate');
  });

  it('spots check, stalemate and a draw', () => {
    expect(gameStatus(play(startPosition(), 'e2e4', 'f7f6', 'd1h5'))).toBe('check');
    expect(gameStatus(fromFen('7k/5Q2/6K1/8/8/8/8/8 b - -'))).toBe('stalemate');
    expect(gameStatus(fromFen('7k/8/6K1/8/8/8/8/2N5 b - -'))).toBe('draw');
  });

  it('moves the rook when castling', () => {
    const position = fromFen('r3k2r/8/8/8/8/8/8/R3K2R w KQkq -');
    const after = applyMove(position, move(position, 'e1g1'));
    expect(after.board[7][6]).toEqual({ side: 'w', kind: 'k' });
    expect(after.board[7][5]).toEqual({ side: 'w', kind: 'r' });
    expect(after.board[7][7]).toBeNull();
    expect(after.castling.wk).toBe(false);
    expect(after.castling.wq).toBe(false);
  });

  it('takes the pawn beside you when capturing en passant', () => {
    const position = play(startPosition(), 'e2e4', 'a7a6', 'e4e5', 'd7d5');
    const capture = move(position, 'e5d6');
    expect(capture.captured).toEqual({ side: 'b', kind: 'p' });
    expect(applyMove(position, capture).board[3][3]).toBeNull();
  });

  it('turns a pawn into a queen on the far side', () => {
    const position = fromFen('8/P6k/8/8/8/8/8/K7 w - -');
    const after = applyMove(position, move(position, 'a7a8'));
    expect(after.board[0][0]).toEqual({ side: 'w', kind: 'q' });
  });
});

describe('computer', () => {
  it('always picks a legal move', () => {
    for (const level of ['sleepy', 'clever'] as const) {
      const random = seeded(7);
      let position = startPosition();
      for (let turn = 0; turn < 12 && gameStatus(position) !== 'checkmate'; turn++) {
        const chosen = pickMove(position, level, random);
        expect(legalMoves(position)).toContainEqual(chosen);
        position = applyMove(position, chosen);
      }
    }
  });

  it('grabs a free queen when clever', () => {
    const position = fromFen('4k3/8/8/3q4/4P3/8/8/4K3 w - -');
    const chosen = pickMove(position, 'clever', seeded(1));
    expect(chosen.captured?.kind).toBe('q');
  });

  it('finds checkmate in one when clever', () => {
    const position = fromFen('6k1/5ppp/8/8/8/8/8/R5K1 w - -');
    const chosen = pickMove(position, 'clever', seeded(3));
    expect(gameStatus(applyMove(position, chosen))).toBe('checkmate');
  });

  it('scores an extra queen as good', () => {
    expect(evaluate(fromFen('4k3/8/8/8/8/8/8/3QK3 w - -'), 'w')).toBeGreaterThan(8);
  });
});
