import {
  applyMove,
  gameStatus,
  inCheck,
  isAttacked,
  legalMoves,
  sameSquare,
  SIZE,
  type Board,
  type Kind,
  type Move,
  type Piece,
  type Position,
  type Square,
} from './rules';

/**
 * Lessons are small puzzles, made up fresh each time. Each one is built by
 * dropping a few pieces on an empty board at random, then checking the rules:
 * if the puzzle doesn't have exactly one answer, throw it away and try again.
 * Computers are fast, so a few hundred tries take no time at all. This "generate
 * and test" trick is a common way to make puzzles and levels.
 */
export type Topic = 'move' | 'catch' | 'rescue' | 'mate';

export interface Lesson {
  topic: Topic;
  position: Position;
  /** The one right answer. */
  solution: Move;
  /** Where to draw the goal star, for "move to the star" lessons. */
  star: Square | null;
  /** The kind of piece the lesson is about, for the instructions. */
  piece: Kind;
  /** The piece to catch, for catch and rescue lessons. */
  target: Kind | null;
}

/** "How they move" goes through the pieces in this order first: easiest ideas first. */
const MOVE_ORDER: Kind[] = ['r', 'b', 'q', 'k', 'n', 'p'];
const ATTACKERS: Kind[] = ['n', 'b', 'r', 'q'];
const MAX_TRIES = 5000;

type Random = () => number;

const pick = <T>(list: readonly T[], random: Random): T => list[Math.floor(random() * list.length)];
const squareAt = (random: Random, minRow = 0, maxRow = SIZE - 1): Square => ({
  row: minRow + Math.floor(random() * (maxRow - minRow + 1)),
  col: Math.floor(random() * SIZE),
});

/** A board you can drop pieces onto. `put` refuses a square that's already taken. */
function emptyBoard(): { board: Board; put: (square: Square, piece: Piece) => boolean } {
  const board: Board = Array.from({ length: SIZE }, () => Array<Piece | null>(SIZE).fill(null));
  return {
    board,
    put: (square, piece) => {
      if (board[square.row][square.col]) return false;
      board[square.row][square.col] = piece;
      return true;
    },
  };
}

/** Your team ('w') always moves, and nobody can castle, so there are no surprises. */
const toPosition = (board: Board): Position => ({
  board,
  turn: 'w',
  castling: { wk: false, wq: false, bk: false, bq: false },
  enPassant: null,
});

/** Makes the `number`th lesson of a topic. Pass `random` to get the same lesson every time. */
export function makeLesson(topic: Topic, number: number, random: Random = Math.random): Lesson {
  const make = { move: moveLesson, catch: catchLesson, rescue: rescueLesson, mate: mateLesson }[topic];
  for (let tries = 0; tries < MAX_TRIES; tries++) {
    const lesson = make(number, random);
    if (lesson) return lesson;
  }
  // So unlikely it never happens in the tests, but a lesson must always appear.
  return moveLesson(0, random)!;
}

/** "Move the Knight to the star!" One piece alone, and a star it can reach in one move. */
function moveLesson(number: number, random: Random): Lesson | null {
  const kind = number < MOVE_ORDER.length ? MOVE_ORDER[number] : pick(MOVE_ORDER, random);
  const { board, put } = emptyBoard();
  // Pawns start somewhere they can walk forward from.
  const from = kind === 'p' ? squareAt(random, 2, 6) : squareAt(random);
  put(from, { side: 'w', kind });
  const position = toPosition(board);

  // Prefer a star a few squares away, so the zooming pieces get to zoom.
  const moves = legalMoves(position);
  const far = moves.filter((move) => Math.max(Math.abs(move.to.row - from.row), Math.abs(move.to.col - from.col)) >= 2);
  const solution = pick(far.length > 0 && kind !== 'k' && kind !== 'p' ? far : moves, random);
  if (!solution) return null;
  return { topic: 'move', position, solution, star: solution.to, piece: kind, target: null };
}

/** "Catch the Bishop!" Your piece, and three different monsters. Only one can be caught. */
function catchLesson(_number: number, random: Random): Lesson | null {
  const kind = pick(['p', ...ATTACKERS, 'k'] as Kind[], random);
  const { board, put } = emptyBoard();
  put(kind === 'p' ? squareAt(random, 2, 6) : squareAt(random), { side: 'w', kind });

  // Different kinds, so "catch the Bishop" can only mean one monster.
  const enemies = shuffle(['p', ...ATTACKERS] as Kind[], random).slice(0, 3);
  for (const enemy of enemies) {
    if (!put(squareAt(random, 0, 6), { side: 'b', kind: enemy })) return null;
  }

  const position = toPosition(board);
  const catches = legalMoves(position).filter((move) => move.captured);
  if (catches.length !== 1) return null;
  return { topic: 'catch', position, solution: catches[0], star: null, piece: kind, target: catches[0].captured!.kind };
}

/**
 * "Catch the Rook attacking your King!" Your king is in check, and exactly one of
 * your pieces can catch the attacker. Running away would also be fine in a real
 * game, but this lesson is about catching.
 */
function rescueLesson(_number: number, random: Random): Lesson | null {
  const { board, put } = emptyBoard();
  const king = squareAt(random);
  put(king, { side: 'w', kind: 'k' });
  if (!put(squareAt(random), { side: 'b', kind: 'k' })) return null;
  const attacker = pick(ATTACKERS, random);
  if (!put(squareAt(random), { side: 'b', kind: attacker })) return null;
  const helpers = 1 + Math.floor(random() * 2);
  for (let i = 0; i < helpers; i++) {
    if (!put(squareAt(random), { side: 'w', kind: pick(ATTACKERS, random) })) return null;
  }

  const position = toPosition(board);
  // Only the one attacker may be giving check, and their king can't be in check.
  if (!inCheck(position, 'w') || inCheck(position, 'b')) return null;
  const checkers = enemySquares(board).filter((square) => attacks(board, square, king));
  if (checkers.length !== 1) return null;
  const rescues = legalMoves(position).filter((move) => move.capturedAt && sameSquare(move.capturedAt, checkers[0]));
  // A helper should do the catching, not the king itself.
  if (rescues.length !== 1 || rescues[0].piece.kind === 'k') return null;
  return { topic: 'rescue', position, solution: rescues[0], star: null, piece: rescues[0].piece.kind, target: attacker };
}

/** "Find checkmate!" Their king is near the edge, and exactly one move traps it. */
function mateLesson(_number: number, random: Random): Lesson | null {
  const { board, put } = emptyBoard();
  // Their king on the top edge, sometimes behind a wall of its own pawns.
  const theirKing = { row: 0, col: Math.floor(random() * SIZE) };
  put(theirKing, { side: 'b', kind: 'k' });
  if (random() < 0.6) {
    for (const col of [theirKing.col - 1, theirKing.col, theirKing.col + 1]) {
      if (col >= 0 && col < SIZE) put({ row: 1, col }, { side: 'b', kind: 'p' });
    }
  }
  if (!put(squareAt(random, 2, 7), { side: 'w', kind: 'k' })) return null;
  const attackers = pick([['q'], ['r'], ['r', 'r'], ['q', 'r'], ['r', 'b'], ['q', 'n']] as Kind[][], random);
  for (const kind of attackers) {
    if (!put(squareAt(random, 1, 7), { side: 'w', kind })) return null;
  }

  const position = toPosition(board);
  if (inCheck(position, 'b') || inCheck(position, 'w')) return null;
  const mates = legalMoves(position).filter((move) => gameStatus(applyMove(position, move)) === 'checkmate');
  if (mates.length !== 1) return null;
  return { topic: 'mate', position, solution: mates[0], star: null, piece: mates[0].piece.kind, target: null };
}

function enemySquares(board: Board): Square[] {
  const squares: Square[] = [];
  board.forEach((line, row) => line.forEach((piece, col) => piece?.side === 'b' && squares.push({ row, col })));
  return squares;
}

/**
 * Does the piece on `from` attack `target`? Its teammates are swapped for pawns
 * of the other side: they still block the way, but can't attack for it.
 */
function attacks(board: Board, from: Square, target: Square): boolean {
  const piece = board[from.row][from.col]!;
  const blocker: Piece = { side: piece.side === 'w' ? 'b' : 'w', kind: 'p' };
  const alone = board.map((line, row) =>
    line.map((other, col) => (other?.side === piece.side && (row !== from.row || col !== from.col) ? blocker : other)),
  );
  return isAttacked(alone, target, piece.side);
}

function shuffle<T>(list: T[], random: Random): T[] {
  const copy = list.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Is this move the lesson's answer? */
export const isSolution = (lesson: Lesson, move: Move): boolean =>
  sameSquare(move.from, lesson.solution.from) && sameSquare(move.to, lesson.solution.to);
