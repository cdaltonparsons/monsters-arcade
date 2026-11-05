/**
 * The rules of match 3, with no graphics. It only knows about a grid of numbers,
 * which is why board.test.ts can test it without starting a game.
 *
 * Each cell holds a "kind": which monster is there. Row 0 is the top row.
 */
export type Board = number[][];

export interface Cell {
  row: number;
  col: number;
}

/** A monster that fell. `fromRow` is negative if it came from above the board. */
export interface Fall {
  fromRow: number;
  toRow: number;
  col: number;
  kind: number;
  isNew: boolean;
}

type Random = () => number;

export const areNeighbours = (a: Cell, b: Cell): boolean =>
  Math.abs(a.row - b.row) + Math.abs(a.col - b.col) === 1;

export function swap(board: Board, a: Cell, b: Cell): void {
  const held = board[a.row][a.col];
  board[a.row][a.col] = board[b.row][b.col];
  board[b.row][b.col] = held;
}

/** Every cell that is part of a line of 3 or more. */
export function findMatches(board: Board): Cell[] {
  const rows = board.length;
  const cols = board[0].length;
  const found = new Set<string>();

  // Walk one line of cells, remembering how long the current run of a kind is.
  const scan = (line: Cell[]): void => {
    let runStart = 0;
    for (let i = 1; i <= line.length; i++) {
      const sameAsRun =
        i < line.length &&
        board[line[i].row][line[i].col] === board[line[runStart].row][line[runStart].col];
      if (sameAsRun) continue;
      if (i - runStart >= 3) {
        for (let j = runStart; j < i; j++) found.add(`${line[j].row},${line[j].col}`);
      }
      runStart = i;
    }
  };

  for (let row = 0; row < rows; row++) {
    scan(Array.from({ length: cols }, (_, col) => ({ row, col })));
  }
  for (let col = 0; col < cols; col++) {
    scan(Array.from({ length: rows }, (_, row) => ({ row, col })));
  }

  return [...found].map((key) => {
    const [row, col] = key.split(',').map(Number);
    return { row, col };
  });
}

/** A pair of neighbours that would make a match if swapped, or null if stuck. */
export function findMove(board: Board): [Cell, Cell] | null {
  const rows = board.length;
  const cols = board[0].length;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const here = { row, col };
      const neighbours = [
        { row, col: col + 1 },
        { row: row + 1, col },
      ];
      for (const there of neighbours) {
        if (there.row >= rows || there.col >= cols) continue;
        swap(board, here, there);
        const works = findMatches(board).length > 0;
        swap(board, here, there);
        if (works) return [here, there];
      }
    }
  }
  return null;
}

/** A new board with nothing already matched and at least one move to make. */
export function createBoard(rows: number, cols: number, kinds: number, random: Random = Math.random): Board {
  for (;;) {
    const board: Board = [];
    for (let row = 0; row < rows; row++) {
      board.push([]);
      for (let col = 0; col < cols; col++) {
        // Skip any kind that would finish a line of 3 as we fill in the grid.
        const options: number[] = [];
        for (let kind = 0; kind < kinds; kind++) {
          const makesRow = col >= 2 && board[row][col - 1] === kind && board[row][col - 2] === kind;
          const makesColumn = row >= 2 && board[row - 1][col] === kind && board[row - 2][col] === kind;
          if (!makesRow && !makesColumn) options.push(kind);
        }
        board[row].push(options[Math.floor(random() * options.length)]);
      }
    }
    if (findMove(board)) return board;
  }
}

/**
 * Removes the matched cells, lets monsters above them fall, and fills the gaps
 * with new ones. Returns what moved, so the scene can animate it.
 */
export function collapse(board: Board, matched: Cell[], kinds: number, random: Random = Math.random): Fall[] {
  const rows = board.length;
  const cols = board[0].length;
  const isMatched = new Set(matched.map((cell) => `${cell.row},${cell.col}`));
  const falls: Fall[] = [];

  for (let col = 0; col < cols; col++) {
    // Work up from the bottom. `gaps` is how far the current monster has to drop.
    let gaps = 0;
    for (let row = rows - 1; row >= 0; row--) {
      if (isMatched.has(`${row},${col}`)) {
        gaps++;
      } else if (gaps > 0) {
        const kind = board[row][col];
        board[row + gaps][col] = kind;
        falls.push({ fromRow: row, toRow: row + gaps, col, kind, isNew: false });
      }
    }
    // New monsters start stacked above the board and drop in.
    for (let i = 0; i < gaps; i++) {
      const kind = Math.floor(random() * kinds);
      const toRow = gaps - 1 - i;
      board[toRow][col] = kind;
      falls.push({ fromRow: -1 - i, toRow, col, kind, isNew: true });
    }
  }
  return falls;
}
