import { describe, expect, it } from 'vitest';
import { areNeighbours, collapse, createBoard, findMatches, findMove, type Board } from './board';

/** Sort cells into a stable order, so tests don't depend on search order. */
const sorted = (cells: { row: number; col: number }[]) =>
  [...cells].sort((a, b) => a.row - b.row || a.col - b.col);

describe('findMatches', () => {
  it('finds a line across and a line down', () => {
    const board: Board = [
      [1, 1, 1, 2],
      [2, 3, 4, 2],
      [3, 4, 3, 2],
    ];
    expect(sorted(findMatches(board))).toEqual([
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 0, col: 2 },
      { row: 0, col: 3 },
      { row: 1, col: 3 },
      { row: 2, col: 3 },
    ]);
  });

  it('ignores pairs', () => {
    expect(findMatches([
      [1, 1, 2],
      [2, 2, 1],
    ])).toEqual([]);
  });

  it('includes every cell in a line of 4', () => {
    expect(findMatches([[5, 5, 5, 5]])).toHaveLength(4);
  });
});

describe('findMove', () => {
  it('finds a swap that makes a match', () => {
    const move = findMove([
      [1, 1, 2],
      [2, 3, 1],
    ]);
    expect(move).toEqual([
      { row: 0, col: 2 },
      { row: 1, col: 2 },
    ]);
  });

  it('returns null when the board is stuck', () => {
    expect(findMove([
      [1, 2],
      [3, 4],
    ])).toBeNull();
  });
});

describe('createBoard', () => {
  it('starts with no matches and a move available, over many boards', () => {
    for (let i = 0; i < 200; i++) {
      const board = createBoard(6, 5, 4);
      expect(findMatches(board)).toEqual([]);
      expect(findMove(board)).not.toBeNull();
      expect(board.flat().every((kind) => kind >= 0 && kind < 4)).toBe(true);
    }
  });
});

describe('collapse', () => {
  it('drops monsters into the gap and fills from the top', () => {
    const board: Board = [[1], [2], [3], [4]];
    const falls = collapse(board, [{ row: 2, col: 0 }], 5, () => 0);

    expect(board).toEqual([[0], [1], [2], [4]]);
    expect(falls).toContainEqual({ fromRow: 1, toRow: 2, col: 0, kind: 2, isNew: false });
    expect(falls).toContainEqual({ fromRow: 0, toRow: 1, col: 0, kind: 1, isNew: false });
    expect(falls).toContainEqual({ fromRow: -1, toRow: 0, col: 0, kind: 0, isNew: true });
    expect(falls).toHaveLength(3);
  });

  it('handles a whole column clearing', () => {
    const board: Board = [[7], [7], [7]];
    const falls = collapse(board, [
      { row: 0, col: 0 },
      { row: 1, col: 0 },
      { row: 2, col: 0 },
    ], 3, () => 0.5);

    expect(board).toEqual([[1], [1], [1]]);
    expect(falls.every((fall) => fall.isNew)).toBe(true);
    expect(falls).toHaveLength(3);
  });
});

describe('areNeighbours', () => {
  it('counts sideways and up/down, but not diagonal', () => {
    expect(areNeighbours({ row: 1, col: 1 }, { row: 1, col: 2 })).toBe(true);
    expect(areNeighbours({ row: 1, col: 1 }, { row: 0, col: 1 })).toBe(true);
    expect(areNeighbours({ row: 1, col: 1 }, { row: 2, col: 2 })).toBe(false);
    expect(areNeighbours({ row: 1, col: 1 }, { row: 1, col: 1 })).toBe(false);
  });
});
