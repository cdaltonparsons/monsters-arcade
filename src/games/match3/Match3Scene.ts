import Phaser from 'phaser';
import { MONSTERS } from '../../shared/assets';
import { BACKGROUND, GAME_WIDTH } from '../../shared/constants';
import { sfx } from '../../shared/sfx';
import { addHomeButton, burstStars } from '../../shared/ui';
import {
  areNeighbours,
  collapse,
  createBoard,
  findMatches,
  findMove,
  swap,
  type Board,
  type Cell,
} from './board';

// Tweak these to change how the game feels.
const ROWS = 6;
const COLS = 5;
const KINDS = 4; // Fewer kinds means more matches and more chain reactions.
const TILE = 200;
const BOARD_TOP = 300;
const BOARD_LEFT = (GAME_WIDTH - COLS * TILE) / 2;
const MONSTER_SIZE = 180;
const HINT_AFTER_MS = 4000; // How long a child can sit idle before a pair wiggles.
const POPS_PER_PARTY = 20; // Monsters to pop to fill the star meter.

type Tile = Phaser.GameObjects.Image;

/**
 * Draws the board and handles input. The rules live in board.ts. This class
 * keeps `tiles` (the pictures on screen) in step with `board` (the numbers).
 */
export class Match3Scene extends Phaser.Scene {
  static readonly KEY = 'match3';

  private board!: Board;
  private tiles!: (Tile | null)[][];
  private selected!: Cell | null;
  private dragStart!: Cell | null;
  /** True while pieces are moving. Taps are ignored so the board stays valid. */
  private busy!: boolean;
  private pops!: number;
  private meter!: Phaser.GameObjects.Graphics;
  private hintTimer?: Phaser.Time.TimerEvent;

  constructor() {
    super(Match3Scene.KEY);
  }

  /** create() runs every time this scene starts, so all state is reset here. */
  create(): void {
    this.selected = null;
    this.dragStart = null;
    this.busy = false;
    this.pops = 0;
    this.hintTimer = undefined;

    // Cover the area above the board, so new monsters appear to drop in from
    // behind it. Higher depth draws on top, like z-index.
    this.add
      .rectangle(GAME_WIDTH / 2, BOARD_TOP / 2, GAME_WIDTH, BOARD_TOP, Phaser.Display.Color.HexStringToColor(BACKGROUND).color)
      .setDepth(10);
    addHomeButton(this).setDepth(11);
    this.meter = this.add.graphics().setDepth(11);
    this.drawMeter();

    this.board = createBoard(ROWS, COLS, KINDS);
    this.tiles = this.board.map((line, row) =>
      line.map((kind, col) => this.addTile(row, col, kind)),
    );

    this.input.on('pointerdown', this.onPointerDown, this);
    this.input.on('pointermove', this.onPointerMove, this);
    this.restartHintTimer();
  }

  // ---------------------------------------------------------------- Input

  /** Works out the cell from the position, so even a sloppy tap lands somewhere. */
  private cellAt(pointer: Phaser.Input.Pointer): Cell | null {
    const col = Math.floor((pointer.worldX - BOARD_LEFT) / TILE);
    const row = Math.floor((pointer.worldY - BOARD_TOP) / TILE);
    return row >= 0 && row < ROWS && col >= 0 && col < COLS ? { row, col } : null;
  }

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    const cell = this.cellAt(pointer);
    if (this.busy || !cell) return;
    this.restartHintTimer();
    this.dragStart = cell;

    // Second tap on a neighbour: swap with the selected monster.
    if (this.selected && areNeighbours(this.selected, cell)) {
      const from = this.selected;
      this.setSelected(null);
      this.dragStart = null;
      void this.trySwap(from, cell);
      return;
    }

    // Otherwise select this one, or deselect it if it was already selected.
    const isSame = this.selected?.row === cell.row && this.selected.col === cell.col;
    this.setSelected(isSame ? null : cell);
    sfx.tap();
  }

  /** Dragging a monster towards a neighbour swaps them straight away. */
  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    if (this.busy || !pointer.isDown || !this.dragStart) return;
    const here = this.cellAt(pointer);
    if (!here || !areNeighbours(this.dragStart, here)) return;

    const from = this.dragStart;
    this.dragStart = null;
    this.setSelected(null);
    void this.trySwap(from, here);
  }

  private setSelected(cell: Cell | null): void {
    if (this.selected) {
      const old = this.tiles[this.selected.row][this.selected.col];
      if (old) {
        this.tweens.killTweensOf(old);
        old.setDisplaySize(MONSTER_SIZE, MONSTER_SIZE).setAngle(0);
      }
    }
    this.selected = cell;
    if (cell) {
      const tile = this.tiles[cell.row][cell.col]!;
      // Multiply the current scale, because the SVG texture is not MONSTER_SIZE.
      this.tweens.add({
        targets: tile,
        scale: tile.scale * 1.15,
        duration: 260,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }
  }

  // ---------------------------------------------------------------- Game flow

  private async trySwap(a: Cell, b: Cell): Promise<void> {
    this.busy = true;
    this.stopHint();

    await this.animateSwap(a, b);
    this.swapBoth(a, b);

    if (findMatches(this.board).length === 0) {
      // Not a match. No penalty: they just hop back to where they were.
      sfx.boing();
      await this.animateSwap(a, b);
      this.swapBoth(a, b);
    } else {
      await this.resolveMatches();
      if (!findMove(this.board)) await this.reshuffle();
    }

    this.busy = false;
    this.restartHintTimer();
  }

  /** Pop, drop, refill, and repeat while new matches keep appearing. */
  private async resolveMatches(): Promise<void> {
    let combo = 0;
    for (;;) {
      const matched = findMatches(this.board);
      if (matched.length === 0) return;

      sfx.pop(combo);
      await this.popTiles(matched);
      this.addPops(matched.length);

      const falls = collapse(this.board, matched, KINDS);
      await this.animateFalls(falls);
      combo++;
    }
  }

  /** The board has no moves left. That isn't a loss, so just deal a new one. */
  private async reshuffle(): Promise<void> {
    const oldTiles = this.tiles.flat().filter((tile): tile is Tile => tile !== null);
    await this.tween({ targets: oldTiles, alpha: 0, scale: 0, duration: 250 });
    oldTiles.forEach((tile) => tile.destroy());

    this.board = createBoard(ROWS, COLS, KINDS);
    this.tiles = this.board.map((line, row) =>
      line.map((kind, col) => this.addTile(row, col, kind)),
    );
    const newTiles = this.tiles.flat() as Tile[];
    const fullScale = newTiles[0].scale;
    newTiles.forEach((tile) => tile.setScale(0));
    await this.tween({ targets: newTiles, scale: fullScale, duration: 300, ease: 'Back.easeOut' });
  }

  private addPops(count: number): void {
    this.pops += count;
    if (this.pops >= POPS_PER_PARTY) {
      this.pops = 0;
      this.party();
    }
    this.drawMeter();
  }

  /** The reward for filling the star meter. Then it starts again, forever. */
  private party(): void {
    sfx.party();
    for (let i = 0; i < 6; i++) {
      this.time.delayedCall(i * 120, () => {
        burstStars(
          this,
          Phaser.Math.Between(120, GAME_WIDTH - 120),
          Phaser.Math.Between(300, 1500),
          12,
        );
      });
    }
  }

  // ---------------------------------------------------------------- Drawing

  private cellX(col: number): number {
    return BOARD_LEFT + col * TILE + TILE / 2;
  }

  private cellY(row: number): number {
    return BOARD_TOP + row * TILE + TILE / 2;
  }

  private addTile(row: number, col: number, kind: number): Tile {
    return this.add
      .image(this.cellX(col), this.cellY(row), MONSTERS[kind])
      .setDisplaySize(MONSTER_SIZE, MONSTER_SIZE);
  }

  private drawMeter(): void {
    const x = 240;
    const y = 100;
    const width = 780;
    const height = 70;
    const fill = this.pops / POPS_PER_PARTY;
    this.meter.clear();
    this.meter.fillStyle(0xffffff);
    this.meter.fillRoundedRect(x, y - height / 2, width, height, height / 2);
    if (fill > 0) {
      const filled = Math.max(height, width * fill);
      this.meter.fillStyle(0xffc928);
      this.meter.fillRoundedRect(x, y - height / 2, filled, height, height / 2);
    }
  }

  // ---------------------------------------------------------------- Animation

  /**
   * Wraps a tween in a Promise, so game flow can read top to bottom with await.
   * A tween changes a value smoothly over time, like a CSS transition from code.
   */
  private tween(config: Phaser.Types.Tweens.TweenBuilderConfig): Promise<void> {
    return new Promise((resolve) => {
      this.tweens.add({ ...config, onComplete: () => resolve() });
    });
  }

  private async animateSwap(a: Cell, b: Cell): Promise<void> {
    const tileA = this.tiles[a.row][a.col]!;
    const tileB = this.tiles[b.row][b.col]!;
    await Promise.all([
      this.tween({ targets: tileA, x: this.cellX(b.col), y: this.cellY(b.row), duration: 180, ease: 'Sine.easeInOut' }),
      this.tween({ targets: tileB, x: this.cellX(a.col), y: this.cellY(a.row), duration: 180, ease: 'Sine.easeInOut' }),
    ]);
  }

  /** Swap in both the rules grid and the picture grid. */
  private swapBoth(a: Cell, b: Cell): void {
    swap(this.board, a, b);
    const held = this.tiles[a.row][a.col];
    this.tiles[a.row][a.col] = this.tiles[b.row][b.col];
    this.tiles[b.row][b.col] = held;
  }

  private async popTiles(cells: Cell[]): Promise<void> {
    await Promise.all(
      cells.map(async ({ row, col }) => {
        const tile = this.tiles[row][col]!;
        this.tiles[row][col] = null;
        burstStars(this, tile.x, tile.y, 5);
        await this.tween({ targets: tile, scale: tile.scale * 1.4, alpha: 0, duration: 220, ease: 'Back.easeIn' });
        tile.destroy();
      }),
    );
  }

  private async animateFalls(falls: ReturnType<typeof collapse>): Promise<void> {
    const moves: Promise<void>[] = [];

    // collapse() lists each column from the bottom up, so a monster's old cell
    // is always emptied before the one above lands in it.
    for (const fall of falls) {
      const tile = fall.isNew
        ? this.addTile(fall.fromRow, fall.col, fall.kind)
        : this.tiles[fall.fromRow][fall.col]!;
      if (!fall.isNew) this.tiles[fall.fromRow][fall.col] = null;
      this.tiles[fall.toRow][fall.col] = tile;

      moves.push(
        this.tween({
          targets: tile,
          y: this.cellY(fall.toRow),
          duration: 180 + (fall.toRow - fall.fromRow) * 70,
          ease: 'Bounce.easeOut',
        }),
      );
    }
    await Promise.all(moves);
  }

  // ---------------------------------------------------------------- Hints

  private restartHintTimer(): void {
    this.stopHint();
    this.hintTimer = this.time.delayedCall(HINT_AFTER_MS, () => this.showHint());
  }

  private stopHint(): void {
    this.hintTimer?.remove();
    this.hintTimer = undefined;
    // Stop any wiggle in progress and stand every monster back up straight.
    for (const tile of this.tiles.flat()) {
      if (tile && tile.angle !== 0) {
        this.tweens.killTweensOf(tile);
        tile.setAngle(0);
      }
    }
  }

  /** Wiggle a pair that would match, then do it again until someone taps. */
  private showHint(): void {
    if (this.busy) return;
    const move = findMove(this.board);
    if (!move) return;
    for (const { row, col } of move) {
      this.tweens.add({
        targets: this.tiles[row][col],
        angle: { from: -14, to: 14 },
        duration: 110,
        yoyo: true,
        repeat: 5,
        onComplete: (_tween, targets: Tile[]) => targets[0].setAngle(0),
      });
    }
    this.hintTimer = this.time.delayedCall(HINT_AFTER_MS, () => this.showHint());
  }
}
