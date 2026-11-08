import { applyMove, gameStatus, inCheck, legalMoves, type Kind, type Move, type Position, type Side } from './rules';

/** The two computer friends. Sleepy is easy to beat, Clever looks one move ahead. */
export type Level = 'sleepy' | 'clever';

const VALUE: Record<Kind, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

/** How good the board looks for `side`: mostly who has more pieces, plus a little for the middle. */
export function evaluate(position: Position, side: Side): number {
  let score = 0;
  position.board.forEach((line, row) =>
    line.forEach((piece, col) => {
      if (!piece) return;
      // Pieces near the middle can reach more squares.
      const middle = piece.kind === 'k' ? 0 : 0.1 - (Math.abs(3.5 - row) + Math.abs(3.5 - col)) * 0.015;
      const worth = VALUE[piece.kind] + middle;
      score += piece.side === side ? worth : -worth;
    }),
  );
  return score;
}

const MATE = 1000;

/** Picks a move for whoever's turn it is. `random` is passed in so tests can be repeatable. */
export function pickMove(position: Position, level: Level, random: () => number = Math.random): Move {
  const moves = legalMoves(position);
  const pick = <T>(list: T[]): T => list[Math.floor(random() * list.length)];

  if (level === 'sleepy') {
    // Grabs a piece half the time it can, otherwise wanders about. Very beatable.
    const captures = moves.filter((move) => move.captured);
    return captures.length > 0 && random() < 0.5 ? pick(captures) : pick(moves);
  }

  // Clever: for each move, imagine the best reply, and pick the move whose worst
  // case is best. This is minimax, two moves deep. A pinch of randomness stops it
  // playing the same game every time.
  const me = position.turn;
  let best: Move[] = [];
  let bestScore = -Infinity;
  for (const move of moves) {
    const next = applyMove(position, move);
    const score = worstCase(next, me) + random() * 0.2;
    if (score > bestScore + 0.05) {
      best = [move];
      bestScore = score;
    } else if (score > bestScore - 0.05) {
      best.push(move);
      bestScore = Math.max(bestScore, score);
    }
  }
  return pick(best);
}

/** The score for `me` after the opponent's best reply. */
function worstCase(position: Position, me: Side): number {
  const status = gameStatus(position);
  if (status === 'checkmate') return MATE;
  if (status === 'stalemate' || status === 'draw') return 0;

  let worst = Infinity;
  for (const reply of legalMoves(position)) {
    const after = applyMove(position, reply);
    // A reply that checkmates us is the worst thing there is. Only a check can
    // be checkmate, so the slower test only runs then.
    const mated = inCheck(after, me) && legalMoves(after).length === 0;
    worst = Math.min(worst, mated ? -MATE : evaluate(after, me));
  }
  return worst;
}
