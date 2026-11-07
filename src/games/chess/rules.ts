/**
 * The rules of chess, as plain functions over a grid. There's no Phaser in here,
 * so rules.test.ts can check them without starting a game.
 *
 * A Position is never changed in place: applyMove() returns a new one. That makes
 * "undo" free (keep the old positions in a list) and lets the computer try moves
 * out without having to put the pieces back afterwards.
 */
export type Side = 'w' | 'b';
export type Kind = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';

export interface Piece {
  side: Side;
  kind: Kind;
}

/** Row 0 is the top of the screen, where the 'b' team starts. */
export interface Square {
  row: number;
  col: number;
}

export type Board = (Piece | null)[][];

export interface Position {
  board: Board;
  turn: Side;
  /** Which castling moves are still allowed: k is the king's side, q the queen's. */
  castling: { wk: boolean; wq: boolean; bk: boolean; bq: boolean };
  /** The square a pawn skipped over last move, which can be captured en passant. */
  enPassant: Square | null;
}

export interface Move {
  from: Square;
  to: Square;
  piece: Piece;
  captured: Piece | null;
  /** Where the captured piece was. Only differs from `to` for en passant. */
  capturedAt: Square | null;
  /** A pawn reaching the far side always becomes a queen, to keep things simple. */
  promotion: Kind | null;
  /** For castling, the rook moves too. */
  rook: { from: Square; to: Square } | null;
}

export const SIZE = 8;
const BACK_ROW: Kind[] = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];

export const other = (side: Side): Side => (side === 'w' ? 'b' : 'w');
/** Which way a side's pawns walk: 'w' starts at the bottom, so it goes up. */
const forward = (side: Side): number => (side === 'w' ? -1 : 1);
const onBoard = (row: number, col: number): boolean => row >= 0 && row < SIZE && col >= 0 && col < SIZE;
export const sameSquare = (a: Square, b: Square): boolean => a.row === b.row && a.col === b.col;

export function startPosition(): Position {
  const board: Board = Array.from({ length: SIZE }, () => Array<Piece | null>(SIZE).fill(null));
  for (let col = 0; col < SIZE; col++) {
    board[0][col] = { side: 'b', kind: BACK_ROW[col] };
    board[1][col] = { side: 'b', kind: 'p' };
    board[6][col] = { side: 'w', kind: 'p' };
    board[7][col] = { side: 'w', kind: BACK_ROW[col] };
  }
  return { board, turn: 'w', castling: { wk: true, wq: true, bk: true, bq: true }, enPassant: null };
}

/**
 * Reads FEN, the standard one-line way to write down a chess position. The game
 * doesn't need it, but it makes test positions easy to set up.
 */
export function fromFen(fen: string): Position {
  const [placement, turn, castling, enPassant] = fen.split(' ');
  const board: Board = placement.split('/').map((line) => {
    const row: (Piece | null)[] = [];
    for (const char of line) {
      if (/\d/.test(char)) row.push(...Array<null>(Number(char)).fill(null));
      else row.push({ side: char === char.toUpperCase() ? 'w' : 'b', kind: char.toLowerCase() as Kind });
    }
    return row;
  });
  return {
    board,
    turn: turn === 'b' ? 'b' : 'w',
    castling: {
      wk: castling.includes('K'),
      wq: castling.includes('Q'),
      bk: castling.includes('k'),
      bq: castling.includes('q'),
    },
    enPassant:
      enPassant && enPassant !== '-'
        ? { row: SIZE - Number(enPassant[1]), col: enPassant.charCodeAt(0) - 'a'.charCodeAt(0) }
        : null,
  };
}

const KNIGHT_JUMPS = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
const KING_STEPS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
const STRAIGHT = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const DIAGONAL = [[-1, -1], [-1, 1], [1, -1], [1, 1]];

/** Is `square` under attack by any piece of side `by`? */
export function isAttacked(board: Board, square: Square, by: Side): boolean {
  const { row, col } = square;
  const has = (r: number, c: number, kinds: Kind[]): boolean => {
    const piece = onBoard(r, c) ? board[r][c] : null;
    return piece !== null && piece.side === by && kinds.includes(piece.kind);
  };

  // A pawn attacks diagonally forwards, so look one row behind it.
  const pawnRow = row - forward(by);
  if (has(pawnRow, col - 1, ['p']) || has(pawnRow, col + 1, ['p'])) return true;
  if (KNIGHT_JUMPS.some(([dr, dc]) => has(row + dr, col + dc, ['n']))) return true;
  if (KING_STEPS.some(([dr, dc]) => has(row + dr, col + dc, ['k']))) return true;

  // Slide outwards until something is in the way.
  const slider = (directions: number[][], kinds: Kind[]): boolean =>
    directions.some(([dr, dc]) => {
      let r = row + dr;
      let c = col + dc;
      while (onBoard(r, c) && !board[r][c]) {
        r += dr;
        c += dc;
      }
      return has(r, c, kinds);
    });
  return slider(STRAIGHT, ['r', 'q']) || slider(DIAGONAL, ['b', 'q']);
}

export function findKing(board: Board, side: Side): Square | null {
  for (let row = 0; row < SIZE; row++) {
    for (let col = 0; col < SIZE; col++) {
      const piece = board[row][col];
      if (piece?.side === side && piece.kind === 'k') return { row, col };
    }
  }
  return null;
}

export function inCheck(position: Position, side: Side): boolean {
  const king = findKing(position.board, side);
  return king !== null && isAttacked(position.board, king, other(side));
}

/** Every move the piece on `from` could make, before checking it keeps its king safe. */
function candidateMoves(position: Position, from: Square): Move[] {
  const { board } = position;
  const piece = board[from.row][from.col];
  if (!piece) return [];
  const moves: Move[] = [];

  const add = (row: number, col: number, extra: Partial<Move> = {}): void => {
    const captured = board[row][col];
    moves.push({
      from,
      to: { row, col },
      piece,
      captured,
      capturedAt: captured ? { row, col } : null,
      promotion: null,
      rook: null,
      ...extra,
    });
  };
  /** Moves to an empty square or onto an enemy. Returns true if the square was empty. */
  const tryStep = (row: number, col: number): boolean => {
    if (!onBoard(row, col)) return false;
    const there = board[row][col];
    if (!there) {
      add(row, col);
      return true;
    }
    if (there.side !== piece.side) add(row, col);
    return false;
  };
  const slide = (directions: number[][]): void => {
    for (const [dr, dc] of directions) {
      let r = from.row + dr;
      let c = from.col + dc;
      while (tryStep(r, c)) {
        r += dr;
        c += dc;
      }
    }
  };

  switch (piece.kind) {
    case 'p': {
      const dir = forward(piece.side);
      const lastRow = piece.side === 'w' ? 0 : SIZE - 1;
      const startRow = piece.side === 'w' ? SIZE - 2 : 1;
      const addPawn = (row: number, col: number, extra: Partial<Move> = {}): void =>
        add(row, col, { ...extra, promotion: row === lastRow ? 'q' : null });

      const one = from.row + dir;
      if (onBoard(one, from.col) && !board[one][from.col]) {
        addPawn(one, from.col);
        const two = from.row + dir * 2;
        if (from.row === startRow && !board[two][from.col]) addPawn(two, from.col);
      }
      for (const col of [from.col - 1, from.col + 1]) {
        if (!onBoard(one, col)) continue;
        const target = board[one][col];
        if (target && target.side !== piece.side) addPawn(one, col);
        const ep = position.enPassant;
        if (ep && ep.row === one && ep.col === col) {
          const capturedAt = { row: from.row, col };
          add(one, col, { captured: board[from.row][col], capturedAt });
        }
      }
      break;
    }
    case 'n':
      KNIGHT_JUMPS.forEach(([dr, dc]) => tryStep(from.row + dr, from.col + dc));
      break;
    case 'b':
      slide(DIAGONAL);
      break;
    case 'r':
      slide(STRAIGHT);
      break;
    case 'q':
      slide([...STRAIGHT, ...DIAGONAL]);
      break;
    case 'k': {
      KING_STEPS.forEach(([dr, dc]) => tryStep(from.row + dr, from.col + dc));
      // Castling: the king hops two squares towards a rook that hasn't moved, and
      // the rook jumps over it. Not allowed out of, through, or into check.
      const row = piece.side === 'w' ? SIZE - 1 : 0;
      const enemy = other(piece.side);
      const rights = piece.side === 'w'
        ? { k: position.castling.wk, q: position.castling.wq }
        : { k: position.castling.bk, q: position.castling.bq };
      if (from.row !== row || from.col !== 4 || isAttacked(board, from, enemy)) break;
      const empty = (cols: number[]): boolean => cols.every((c) => !board[row][c]);
      const safe = (cols: number[]): boolean => cols.every((c) => !isAttacked(board, { row, col: c }, enemy));
      if (rights.k && empty([5, 6]) && safe([5, 6])) {
        add(row, 6, { rook: { from: { row, col: 7 }, to: { row, col: 5 } } });
      }
      if (rights.q && empty([1, 2, 3]) && safe([2, 3])) {
        add(row, 2, { rook: { from: { row, col: 0 }, to: { row, col: 3 } } });
      }
      break;
    }
  }
  return moves;
}

export function applyMove(position: Position, move: Move): Position {
  const board = position.board.map((row) => row.slice());
  const { from, to, piece } = move;
  board[from.row][from.col] = null;
  if (move.capturedAt) board[move.capturedAt.row][move.capturedAt.col] = null;
  board[to.row][to.col] = move.promotion ? { side: piece.side, kind: move.promotion } : piece;
  if (move.rook) {
    board[move.rook.to.row][move.rook.to.col] = board[move.rook.from.row][move.rook.from.col];
    board[move.rook.from.row][move.rook.from.col] = null;
  }

  // Moving the king, or moving or losing a rook, uses up that castling move.
  const castling = { ...position.castling };
  if (piece.kind === 'k') {
    if (piece.side === 'w') castling.wk = castling.wq = false;
    else castling.bk = castling.bq = false;
  }
  for (const square of [from, to]) {
    if (square.row === SIZE - 1 && square.col === 0) castling.wq = false;
    if (square.row === SIZE - 1 && square.col === SIZE - 1) castling.wk = false;
    if (square.row === 0 && square.col === 0) castling.bq = false;
    if (square.row === 0 && square.col === SIZE - 1) castling.bk = false;
  }

  const twoStep = piece.kind === 'p' && Math.abs(to.row - from.row) === 2;
  return {
    board,
    turn: other(position.turn),
    castling,
    enPassant: twoStep ? { row: (from.row + to.row) / 2, col: from.col } : null,
  };
}

/**
 * The moves the side to play is allowed to make: from one square, or from all of
 * them. A move that would leave your own king in check isn't allowed.
 */
export function legalMoves(position: Position, from?: Square): Move[] {
  const squares: Square[] = [];
  if (from) {
    squares.push(from);
  } else {
    for (let row = 0; row < SIZE; row++) {
      for (let col = 0; col < SIZE; col++) squares.push({ row, col });
    }
  }
  return squares
    .filter(({ row, col }) => position.board[row][col]?.side === position.turn)
    .flatMap((square) => candidateMoves(position, square))
    .filter((move) => !inCheck(applyMove(position, move), position.turn));
}

/** Only kings, or kings and a single bishop or knight: nobody can ever win. */
function notEnoughToWin(board: Board): boolean {
  const rest = board.flat().filter((piece): piece is Piece => piece !== null && piece.kind !== 'k');
  return rest.length === 0 || (rest.length === 1 && (rest[0].kind === 'b' || rest[0].kind === 'n'));
}

export type Status = 'playing' | 'check' | 'checkmate' | 'stalemate' | 'draw';

export function gameStatus(position: Position): Status {
  const check = inCheck(position, position.turn);
  if (legalMoves(position).length === 0) return check ? 'checkmate' : 'stalemate';
  if (notEnoughToWin(position.board)) return 'draw';
  return check ? 'check' : 'playing';
}
