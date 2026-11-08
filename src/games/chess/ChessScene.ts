import Phaser from 'phaser';
import { loadAvatar } from '../../shared/avatar-textures';
import { FONT, GAME_HEIGHT, GAME_WIDTH, HUD_DEPTH, INK } from '../../shared/constants';
import { sfx } from '../../shared/sfx';
import { addHomeButton, burstStars } from '../../shared/ui';
import { pickMove, type Level } from './ai';
import hintArt from './art/hint.svg?url';
import undoArt from './art/undo.svg?url';
import { isSolution, makeLesson, type Lesson, type Topic } from './lessons';
import { makePieceTextures, makeTeams, PIECE_INFO, pieceKey, type Team } from './pieces';
import {
  applyMove,
  findKing,
  gameStatus,
  legalMoves,
  other,
  sameSquare,
  SIZE,
  startPosition,
  type Move,
  type Piece,
  type Position,
  type Side,
  type Square,
} from './rules';

// Tweak these to change how the game looks and feels.
const TILE = 132;
const BOARD_LEFT = (GAME_WIDTH - TILE * SIZE) / 2;
const BOARD_TOP = Math.round((GAME_HEIGHT - TILE * SIZE) / 2);
const PIECE_SIZE = 128;
const PAWN_SIZE = 108;
const BENCH_SIZE = 88;
const COMPUTER_THINKS_MS = 750; // A pause, so it looks like the computer is thinking.
const LIGHT_SQUARE = 0xfff8e7;
const DARK_SQUARE = 0x9ed37f;

/** Who you're playing against, or 'lesson' for puzzles with no opponent at all. */
type Opponent = Level | 'friend' | 'lesson';

/** A big tappable card on a picker screen. */
interface CardChoice {
  title: string;
  pictures: () => Phaser.GameObjects.Image[];
  onPick: () => void;
}

/** A piece on screen: a shadow and a monster, moved together. */
type PieceSprite = Phaser.GameObjects.Container;

/**
 * Draws the board and handles taps. The rules live in rules.ts and the computer
 * player in ai.ts. This class keeps `sprites` (the pictures) in step with
 * `position` (the rules' idea of the board), like Match3Scene does.
 */
export class ChessScene extends Phaser.Scene {
  static readonly KEY = 'chess';

  private position!: Position;
  /** Every position before the current one, newest last. Undo pops from here. */
  private history!: Position[];
  private moves!: Move[];
  private opponent!: Opponent | null;
  private teams!: Record<Side, Team>;
  private sprites!: (PieceSprite | null)[][];
  private benchSprites!: PieceSprite[];
  private selected!: Square | null;
  private targets!: Move[];
  private shivers!: Phaser.Tweens.Tween[];
  private drag!: { from: Square; moved: boolean } | null;
  /** True while pieces move or the computer thinks. Taps are ignored. */
  private busy!: boolean;
  private over!: boolean;

  private highlights!: Phaser.GameObjects.Graphics;
  private marks!: Phaser.GameObjects.Graphics;
  private turnFace!: Phaser.GameObjects.Image;
  private turnText!: Phaser.GameObjects.Text;
  private infoText!: Phaser.GameObjects.Text;
  private endPanel?: Phaser.GameObjects.Container;
  private hintStar?: Phaser.GameObjects.Image;
  private undoButton!: Phaser.GameObjects.Image;
  private lesson!: Lesson | null;
  private topic!: Topic;
  private lessonNumber!: number;
  private goalStar?: Phaser.GameObjects.Image;
  private nameTag?: Phaser.GameObjects.Container;
  private hovered!: string;

  constructor() {
    super(ChessScene.KEY);
  }

  preload(): void {
    this.load.svg('chess-undo', undoArt, { width: 160, height: 160 });
    this.load.svg('chess-hint', hintArt, { width: 160, height: 160 });
  }

  async create(): Promise<void> {
    this.position = startPosition();
    this.history = [];
    this.moves = [];
    this.opponent = null;
    this.sprites = [];
    this.benchSprites = [];
    this.selected = null;
    this.targets = [];
    this.shivers = [];
    this.drag = null;
    this.busy = true;
    this.over = false;
    this.endPanel = undefined;
    this.hintStar = undefined;
    this.nameTag = undefined;
    this.hovered = '';
    this.lesson = null;
    this.lessonNumber = 0;
    this.goalStar = undefined;

    // The pieces are drawn from code, so they're ready before anything shows.
    const hero = loadAvatar();
    this.teams = makeTeams(hero);
    await makePieceTextures(this.game, hero, this.teams);

    this.drawBoard();
    this.highlights = this.add.graphics().setDepth(1);
    this.marks = this.add.graphics().setDepth(2);
    this.tweens.add({ targets: this.marks, alpha: { from: 1, to: 0.55 }, duration: 500, yoyo: true, repeat: -1 });
    this.addHud();
    this.placeAllPieces();

    this.input.on('pointerdown', this.onPointerDown, this);
    this.input.on('pointermove', this.onPointerMove, this);
    this.input.on('pointerup', this.onPointerUp, this);
    this.addPicker();
  }

  // ---------------------------------------------------------------- Screen furniture

  private drawBoard(): void {
    const board = this.add.graphics();
    board.fillStyle(0x8a5a3b);
    board.fillRoundedRect(BOARD_LEFT - 10, BOARD_TOP - 10, TILE * SIZE + 20, TILE * SIZE + 20, 24);
    for (let row = 0; row < SIZE; row++) {
      for (let col = 0; col < SIZE; col++) {
        board.fillStyle((row + col) % 2 === 0 ? LIGHT_SQUARE : DARK_SQUARE);
        board.fillRect(BOARD_LEFT + col * TILE, BOARD_TOP + row * TILE, TILE, TILE);
      }
    }
  }

  private addHud(): void {
    addHomeButton(this).setDepth(HUD_DEPTH + 1);

    // Whose turn it is: their king's face, and a few words for a grown-up to read.
    const pill = this.add.graphics();
    pill.fillStyle(0xffffff);
    pill.fillRoundedRect(200, 40, 840, 120, 60);
    this.turnFace = this.add.image(270, 100, pieceKey({ side: 'w', kind: 'k' })).setDisplaySize(110, 110);
    this.turnText = this.add
      .text(340, 100, '', { fontFamily: FONT, fontSize: '60px', color: INK, wordWrap: { width: 680 } })
      .setOrigin(0, 0.5);

    const bottom = GAME_HEIGHT - 130;
    this.undoButton = this.add.image(130, bottom, 'chess-undo').setDisplaySize(170, 170).setInteractive();
    this.undoButton.setDepth(HUD_DEPTH + 1).on('pointerup', () => this.undo());
    const hint = this.add.image(GAME_WIDTH - 130, bottom, 'chess-hint').setDisplaySize(170, 170).setInteractive();
    hint.on('pointerup', () => this.showHint());
    this.infoText = this.add
      .text(GAME_WIDTH / 2, bottom, '', { fontFamily: FONT, fontSize: '50px', color: INK, align: 'center' })
      .setOrigin(0.5);
  }

  /** Four big cards: two computer friends to play, a grown-up or sibling, or lessons. */
  private addPicker(): void {
    const choose = (opponent: Opponent): void => {
      this.opponent = opponent;
      this.busy = false;
      this.updateTurn();
    };
    const face = (key: string) => () => [this.add.image(0, 0, key).setDisplaySize(250, 250)];
    this.showCards([
      { title: 'Sleepy monster', pictures: face('chess-sleepy'), onPick: () => choose('sleepy') },
      { title: 'Clever monster', pictures: face('chess-clever'), onPick: () => choose('clever') },
      {
        title: 'Two players',
        pictures: () => [
          this.add.image(-80, 0, pieceKey({ side: 'w', kind: 'k' })).setDisplaySize(200, 200),
          this.add.image(80, 0, pieceKey({ side: 'b', kind: 'k' })).setDisplaySize(200, 200),
        ],
        onPick: () => choose('friend'),
      },
      { title: 'Lessons', pictures: face('chess-hint'), onPick: () => this.addLessonPicker() },
    ]);
  }

  /** What to practise. Each kind of lesson keeps going for as long as he likes. */
  private addLessonPicker(): void {
    const start = (topic: Topic): void => {
      this.opponent = 'lesson';
      this.topic = topic;
      this.undoButton.setFlipX(true); // In lessons the undo arrow turns round, and skips to the next one.
      this.startLesson();
    };
    const piece = (side: Side, kind: Piece['kind']) => () => [this.add.image(0, 0, pieceKey({ side, kind })).setDisplaySize(250, 250)];
    this.showCards([
      { title: 'How they move', pictures: piece('w', 'n'), onPick: () => start('move') },
      { title: 'Catch!', pictures: piece('b', 'b'), onPick: () => start('catch') },
      { title: 'Save the King', pictures: piece('w', 'k'), onPick: () => start('rescue') },
      { title: 'Checkmate', pictures: piece('b', 'k'), onPick: () => start('mate') },
    ]);
  }

  /** Dims the board and stacks up one card per choice. Picking one clears them all away. */
  private showCards(choices: CardChoice[]): void {
    const dim = this.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.35)
      .setDepth(HUD_DEPTH - 1)
      .setInteractive(); // Swallows taps, so the board underneath can't be played yet.

    const height = 360;
    const gap = 36;
    const top = GAME_HEIGHT / 2 - ((choices.length - 1) * (height + gap)) / 2;
    const cards = choices.map((choice, index) =>
      this.addCard(top + index * (height + gap), height, choice.title, choice.pictures(), () => {
        sfx.tap();
        dim.destroy();
        cards.forEach((card) => card.destroy());
        choice.onPick();
      }),
    );
  }

  private addCard(y: number, height: number, title: string, pictures: Phaser.GameObjects.Image[], onPick: () => void): Phaser.GameObjects.Container {
    const width = 900;
    const background = this.add.graphics();
    background.fillStyle(0xffffff);
    background.fillRoundedRect(-width / 2, -height / 2, width, height, 60);
    // The picture on the left, the words on the right.
    const picture = this.add.container(-240, 0, pictures);
    const label = this.add
      .text(110, 0, title.replace(' ', '\n'), { fontFamily: FONT, fontSize: '76px', color: INK, align: 'center' })
      .setOrigin(0.5);
    const card = this.add.container(GAME_WIDTH / 2, y, [background, picture, label]);
    card.setSize(width, height).setInteractive().setDepth(HUD_DEPTH);
    card.on('pointerup', onPick);
    this.tweens.add({ targets: picture, y: -16, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    return card;
  }

  private isHumanTurn(): boolean {
    return this.opponent === 'friend' || this.opponent === 'lesson' || this.position.turn === 'w';
  }

  private updateTurn(): void {
    const side = this.position.turn;
    this.turnFace.setTexture(pieceKey({ side, kind: 'k' })).setDisplaySize(110, 110);
    this.tweens.killTweensOf(this.turnFace);
    this.turnFace.setAngle(0);

    if (this.opponent === 'friend') {
      this.turnText.setText(`${this.teams[side].name}'s turn!`);
    } else if (side === 'w') {
      this.turnText.setText('Your turn!');
    } else {
      this.turnText.setText('Thinking...');
      this.tweens.add({ targets: this.turnFace, angle: { from: -10, to: 10 }, duration: 300, yoyo: true, repeat: -1 });
    }
  }

  // ---------------------------------------------------------------- Pieces

  private cellX(col: number): number {
    return BOARD_LEFT + col * TILE + TILE / 2;
  }

  private cellY(row: number): number {
    return BOARD_TOP + row * TILE + TILE / 2;
  }

  /** Works out the square from the position, so even a sloppy tap lands somewhere. */
  private squareAt(pointer: Phaser.Input.Pointer): Square | null {
    const col = Math.floor((pointer.worldX - BOARD_LEFT) / TILE);
    const row = Math.floor((pointer.worldY - BOARD_TOP) / TILE);
    return row >= 0 && row < SIZE && col >= 0 && col < SIZE ? { row, col } : null;
  }

  private addPiece(piece: Piece, x: number, y: number, size = piece.kind === 'p' ? PAWN_SIZE : PIECE_SIZE): PieceSprite {
    const shadow = this.add.ellipse(0, size * 0.42, size * 0.75, size * 0.2, 0x000000, 0.15);
    const monster = this.add.image(0, 0, pieceKey(piece)).setDisplaySize(size, size);
    // Breathe gently, each at its own pace, so the monsters look alive.
    this.tweens.add({
      targets: monster,
      scaleY: monster.scaleY * 1.05,
      duration: Phaser.Math.Between(700, 1000),
      delay: Phaser.Math.Between(0, 600),
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    const [badge, symbol] = this.addBadge(piece, size);
    return this.add.container(x, y, [shadow, monster, badge, symbol]).setDepth(10 + y / 1000);
  }

  /** A badge with the real chess symbol, in the piece's bottom corner. */
  private addBadge(piece: Piece, size: number): [Phaser.GameObjects.Arc, Phaser.GameObjects.Text] {
    const radius = size * 0.22;
    const x = size * 0.36;
    const y = size * 0.3;
    const badge = this.add
      .circle(x, y, radius, 0xffffff)
      .setStrokeStyle(4, Phaser.Display.Color.HexStringToColor(this.teams[piece.side].color).color);
    const symbol = this.add
      .text(x, y, PIECE_INFO[piece.kind].symbol, { fontSize: `${Math.round(radius * 1.8)}px`, color: INK })
      .setOrigin(0.5, 0.52);
    return [badge, symbol];
  }

  /** A pawn that becomes a queen grows, so it gets a new, bigger badge too. */
  private setBadge(sprite: PieceSprite, piece: Piece): void {
    sprite.list.slice(2).forEach((old) => old.destroy());
    sprite.add(this.addBadge(piece, PIECE_SIZE));
  }

  /** The monster picture inside a piece. */
  private monsterOf(sprite: PieceSprite): Phaser.GameObjects.Image {
    return sprite.list[1] as Phaser.GameObjects.Image;
  }

  /** Throws away every piece picture and draws them again from `position`. */
  private placeAllPieces(): void {
    for (const sprite of [...this.sprites.flat(), ...this.benchSprites]) {
      if (!sprite) continue;
      this.tweens.killTweensOf([sprite, this.monsterOf(sprite)]);
      sprite.destroy();
    }
    this.benchSprites = [];
    this.sprites = this.position.board.map((line, row) =>
      line.map((piece, col) => (piece ? this.addPiece(piece, this.cellX(col), this.cellY(row)) : null)),
    );
    for (const move of this.moves) {
      if (move.captured) this.benchSprites.push(this.addBenchPiece(move.captured, move.piece.side));
    }
  }

  /**
   * Captured monsters aren't gone, they go and sit on the bench of the team that
   * caught them. Your bench is under the board, the other team's is above it.
   */
  private benchSpot(catcher: Side): { x: number; y: number } {
    const count = this.benchSprites.filter((sprite) => sprite.getData('catcher') === catcher).length;
    const y = catcher === 'w' ? BOARD_TOP + TILE * SIZE + 80 : BOARD_TOP - 80;
    return { x: 60 + count * 64, y }; // 15 pieces still fit across.
  }

  private addBenchPiece(piece: Piece, catcher: Side): PieceSprite {
    const { x, y } = this.benchSpot(catcher);
    return this.addPiece(piece, x, y, BENCH_SIZE).setData('catcher', catcher);
  }

  // ---------------------------------------------------------------- Input

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    const square = this.squareAt(pointer);
    // Touching any piece says its name, even when it isn't your turn.
    const touched = square && this.position.board[square.row][square.col];
    if (touched && this.opponent && !this.endPanel) this.showInfo(touched, square);
    if (this.busy || this.over || !this.opponent || !square || !this.isHumanTurn()) return;
    this.clearHint();

    // Second tap on a dot: make that move.
    const move = this.targets.find((target) => sameSquare(target.to, square));
    if (move) {
      void this.playMove(move);
      return;
    }

    const piece = this.position.board[square.row][square.col];
    if (!piece) {
      this.select(null);
      return;
    }
    if (piece.side !== this.position.turn) {
      // Not yours. It just says hello.
      this.select(null);
      this.wave(square);
      return;
    }
    if (legalMoves(this.position, square).length === 0) {
      // Can't move right now. No telling off, just a little shake.
      this.select(null);
      this.shake(square);
      return;
    }
    this.select(square);
    this.drag = { from: square, moved: false };
  }

  /** Dragging works too: the monster follows your finger. */
  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    // With a mouse, hovering over a piece says its name too. Phones can't hover.
    if (!pointer.isDown && !pointer.wasTouch) this.hoverName(pointer);
    if (!this.drag || !pointer.isDown) return;
    const sprite = this.sprites[this.drag.from.row][this.drag.from.col];
    if (!sprite) return;
    const distance = Phaser.Math.Distance.Between(pointer.downX, pointer.downY, pointer.x, pointer.y);
    if (!this.drag.moved && distance < 30) return; // Small wobbles are still a tap.
    this.drag.moved = true;
    sprite.setPosition(pointer.worldX, pointer.worldY - 40).setDepth(50);
  }

  private onPointerUp(pointer: Phaser.Input.Pointer): void {
    const drag = this.drag;
    this.drag = null;
    if (!drag?.moved) return;

    const square = this.squareAt(pointer);
    const move = square && this.targets.find((target) => sameSquare(target.to, square));
    if (move) {
      void this.playMove(move);
      return;
    }
    // Dropped somewhere it can't go: float back home, still picked up.
    const sprite = this.sprites[drag.from.row][drag.from.col]!;
    this.tweens.add({
      targets: sprite,
      x: this.cellX(drag.from.col),
      y: this.cellY(drag.from.row) - 14,
      duration: 200,
      ease: 'Back.easeOut',
      onComplete: () => sprite.setDepth(10 + this.cellY(drag.from.row) / 1000),
    });
  }

  /** Picks up a piece and shows where it can go, or puts it down again. */
  private select(square: Square | null): void {
    if (this.selected) {
      const old = this.sprites[this.selected.row][this.selected.col];
      if (old) {
        this.tweens.killTweensOf(old);
        old.setScale(1).setPosition(this.cellX(this.selected.col), this.cellY(this.selected.row));
      }
    }
    this.shivers.forEach((tween) => tween.remove());
    this.shivers = [];
    this.sprites.flat().forEach((sprite) => sprite && this.monsterOf(sprite).setAngle(0));

    this.selected = square;
    this.targets = square ? legalMoves(this.position, square) : [];
    if (square) {
      sfx.tap();
      const sprite = this.sprites[square.row][square.col]!;
      this.tweens.add({ targets: sprite, y: this.cellY(square.row) - 14, scale: 1.12, duration: 150, ease: 'Back.easeOut' });
      // Monsters that could be caught shiver nervously.
      for (const move of this.targets) {
        const at = move.capturedAt && this.sprites[move.capturedAt.row][move.capturedAt.col];
        if (!at) continue;
        this.shivers.push(
          this.tweens.add({ targets: this.monsterOf(at), angle: { from: -6, to: 6 }, duration: 90, yoyo: true, repeat: -1 }),
        );
      }
    }
    this.drawMarks();
  }

  // ---------------------------------------------------------------- Game flow

  private async playMove(move: Move): Promise<void> {
    this.busy = true;
    this.select(null);
    this.clearHint();
    if (this.lesson && !isSolution(this.lesson, move)) {
      await this.tryAgain(move);
      return;
    }
    this.history.push(this.position);
    this.moves.push(move);

    await this.animateMove(move);
    this.position = applyMove(this.position, move);
    this.drawHighlights();
    this.drawMarks();
    if (this.lesson) {
      this.lessonSolved();
      return;
    }

    const status = gameStatus(this.position);
    if (status === 'checkmate') {
      this.endGame(other(this.position.turn));
      return;
    }
    if (status === 'stalemate' || status === 'draw') {
      this.endGame(null);
      return;
    }
    if (status === 'check') this.warnKing();

    this.updateTurn();
    if (this.isHumanTurn()) {
      this.busy = false;
      return;
    }
    this.time.delayedCall(COMPUTER_THINKS_MS, () => {
      if (this.opponent === 'sleepy' || this.opponent === 'clever') void this.playMove(pickMove(this.position, this.opponent));
    });
  }

  /** Take back the last move. Against the computer, its reply goes too, so it's your turn again. */
  private undo(): void {
    if (this.lesson) {
      // In lessons this button skips to a new puzzle instead.
      if (this.busy) return;
      sfx.tap();
      this.lessonNumber++;
      this.startLesson();
      return;
    }
    if (this.busy || this.history.length === 0) return;
    sfx.boing();
    do {
      this.position = this.history.pop()!;
      this.moves.pop();
    } while (this.history.length > 0 && !this.isHumanTurn());

    this.over = false;
    this.endPanel?.destroy();
    this.endPanel = undefined;
    this.select(null);
    this.clearHint();
    this.placeAllPieces();
    this.drawHighlights();
    this.drawMarks();
    this.updateTurn();
  }

  /** The Clever monster whispers what it would do: that piece gets picked up, and a star shows where to go. */
  private showHint(): void {
    if (this.busy || this.over || !this.opponent || !this.isHumanTurn()) return;
    this.clearHint();
    const move = this.lesson ? this.lesson.solution : pickMove(this.position, 'clever');
    this.select(move.from);
    this.showInfo(move.piece, move.from);
    sfx.star();
    this.hintStar = this.add.image(this.cellX(move.to.col), this.cellY(move.to.row), 'icon-star').setDepth(40);
    this.tweens.add({ targets: this.hintStar, scale: { from: 0.8, to: 1.3 }, angle: 20, duration: 400, yoyo: true, repeat: -1 });
  }

  private clearHint(): void {
    this.hintStar?.destroy();
    this.hintStar = undefined;
  }

  /** The king is in check: it shivers and the square glows, with a gentle "uh oh". */
  private warnKing(): void {
    const king = findKing(this.position.board, this.position.turn);
    if (!king) return;
    sfx.uhOh();
    this.bubble(this.cellX(king.col), this.cellY(king.row) - 90, 'Watch out!');
    this.shake(king);
  }

  private endGame(winner: Side | null): void {
    this.over = true;
    this.busy = false;
    const vsComputer = this.opponent !== 'friend';

    let title: string;
    let faces: Side[];
    if (!winner) {
      title = "It's a tie!";
      faces = ['w', 'b'];
    } else if (vsComputer) {
      title = winner === 'w' ? 'You win!' : 'Good game!';
      faces = [winner];
    } else {
      title = `${this.teams[winner].name} wins!`;
      faces = [winner];
    }
    this.tweens.killTweensOf(this.turnFace);
    this.turnFace.setAngle(0);
    this.turnText.setText(winner ? 'Checkmate!' : 'Nobody can win');

    // Everyone celebrates, whoever won. The winners jump the highest.
    sfx.party();
    for (let i = 0; i < 8; i++) {
      this.time.delayedCall(i * 160, () => {
        burstStars(this, Phaser.Math.Between(120, GAME_WIDTH - 120), Phaser.Math.Between(BOARD_TOP, BOARD_TOP + TILE * SIZE), 12);
      });
    }
    this.sprites.flat().forEach((sprite, index) => {
      if (!sprite) return;
      const piece = this.position.board[Math.floor(index / SIZE)][index % SIZE]!;
      this.tweens.add({
        targets: sprite,
        y: sprite.y - (piece.side === winner || !winner ? 50 : 20),
        duration: 260,
        delay: (index % SIZE) * 60,
        yoyo: true,
        repeat: 5,
        ease: 'Sine.easeOut',
      });
    });

    this.time.delayedCall(1600, () => this.showEndPanel(title, faces));
  }

  private showEndPanel(title: string, faces: Side[]): void {
    if (!this.over) return; // Undo was pressed while everyone was cheering.
    const width = 860;
    const height = 760;
    const background = this.add.graphics();
    background.fillStyle(0xffffff);
    background.fillRoundedRect(-width / 2, -height / 2, width, height, 60);
    const pictures = faces.map((side, index) =>
      this.add.image((index - (faces.length - 1) / 2) * 260, -90, pieceKey({ side, kind: 'k' })).setDisplaySize(300, 300),
    );
    const words = this.add.text(0, -330, title, { fontFamily: FONT, fontSize: '90px', color: INK }).setOrigin(0.5);

    const button = this.add.graphics();
    button.fillStyle(0x46b95a);
    button.fillRoundedRect(-300, 140, 600, 160, 80);
    const again = this.add.text(0, 220, 'Play again', { fontFamily: FONT, fontSize: '76px', color: '#ffffff' }).setOrigin(0.5);
    const play = this.add.zone(0, 220, 600, 160).setInteractive();
    play.on('pointerup', () => {
      sfx.tap();
      this.scene.restart();
    });

    this.endPanel = this.add
      .container(GAME_WIDTH / 2, GAME_HEIGHT / 2, [background, ...pictures, words, button, again, play])
      .setDepth(HUD_DEPTH);
    this.endPanel.setScale(0);
    this.tweens.add({ targets: this.endPanel, scale: 1, duration: 350, ease: 'Back.easeOut' });
  }

  // ---------------------------------------------------------------- Lessons

  /** Makes a fresh puzzle (see lessons.ts) and sets the board up for it. */
  private startLesson(): void {
    const lesson = makeLesson(this.topic, this.lessonNumber);
    this.lesson = lesson;
    this.position = lesson.position;
    this.history = [];
    this.moves = [];
    this.select(null);
    this.clearHint();
    this.goalStar?.destroy();
    this.goalStar = undefined;
    this.placeAllPieces();
    this.drawHighlights();
    this.drawMarks();

    // The pieces pop up onto the board.
    const sprites = this.sprites.flat().filter((sprite): sprite is PieceSprite => sprite !== null);
    sprites.forEach((sprite) => sprite.setScale(0));
    this.tweens.add({ targets: sprites, scale: 1, duration: 300, ease: 'Back.easeOut', delay: this.tweens.stagger(40, {}) });

    if (lesson.star) {
      this.goalStar = this.add.image(this.cellX(lesson.star.col), this.cellY(lesson.star.row), 'icon-star').setDepth(3);
      this.tweens.add({ targets: this.goalStar, scale: { from: 0.9, to: 1.25 }, duration: 500, yoyo: true, repeat: -1 });
    }

    // The instructions, with the piece the lesson is about.
    const name = (kind: Piece['kind'] | null): string => (kind ? PIECE_INFO[kind].name : '');
    const words: Record<Topic, string> = {
      move: `Move the ${name(lesson.piece)} to the star!`,
      catch: `Catch the ${name(lesson.target)}!`,
      rescue: `Catch the ${name(lesson.target)} attacking your King!`,
      mate: 'Find checkmate! Trap their King.',
    };
    const faceKind = lesson.topic === 'mate' ? 'k' : (lesson.target ?? lesson.piece);
    const faceSide: Side = lesson.topic === 'move' ? 'w' : 'b';
    this.turnFace.setTexture(pieceKey({ side: faceSide, kind: faceKind })).setDisplaySize(110, 110);
    this.tweens.killTweensOf(this.turnFace);
    this.turnFace.setAngle(0);
    this.turnText.setFontSize(words[lesson.topic].length > 24 ? 44 : 56).setText(words[lesson.topic]);
    this.infoText.setText('');

    if (lesson.topic === 'rescue') this.time.delayedCall(500, () => this.warnKing());
    this.busy = false;
  }

  /** Not the answer: the monster hops over to look, then hops back home. No telling off. */
  private async tryAgain(move: Move): Promise<void> {
    const sprite = this.sprites[move.from.row][move.from.col]!;
    const home = { x: this.cellX(move.from.col), y: this.cellY(move.from.row) };
    sprite.setScale(1).setDepth(50);
    sfx.hop();
    await this.hop(sprite, this.cellX(move.to.col), this.cellY(move.to.row), 60, 300);
    sfx.boing();
    this.bubble(sprite.x, sprite.y - 90, 'Try again!');
    await this.hop(sprite, home.x, home.y, 40, 300);
    sprite.setDepth(10 + home.y / 1000);
    this.busy = false;
  }

  /** The right answer! Stars, cheering, and the next puzzle. */
  private lessonSolved(): void {
    this.goalStar?.destroy();
    this.goalStar = undefined;
    const to = this.lesson!.solution.to;
    const x = this.cellX(to.col);
    const y = this.cellY(to.row);
    sfx.party();
    for (let i = 0; i < 5; i++) {
      this.time.delayedCall(i * 140, () => burstStars(this, x + Phaser.Math.Between(-150, 150), y + Phaser.Math.Between(-150, 150), 10));
    }
    this.bubble(x, y - 90, this.lesson!.topic === 'mate' ? 'Checkmate!' : 'Great!');
    const sprite = this.sprites[to.row][to.col];
    if (sprite) this.tweens.add({ targets: sprite, y: y - 50, duration: 220, yoyo: true, repeat: 3, ease: 'Sine.easeOut' });

    this.lessonNumber++;
    this.time.delayedCall(2300, () => this.startLesson());
  }

  // ---------------------------------------------------------------- Drawing

  /** Last move in yellow, and a red glow under a king in check. */
  private drawHighlights(): void {
    this.highlights.clear();
    const last = this.moves[this.moves.length - 1];
    if (last) {
      this.highlights.fillStyle(0xffd23f, 0.5);
      for (const { row, col } of [last.from, last.to]) {
        this.highlights.fillRect(BOARD_LEFT + col * TILE, BOARD_TOP + row * TILE, TILE, TILE);
      }
    }
    const king = findKing(this.position.board, this.position.turn);
    if (king && gameStatus(this.position) !== 'playing') {
      this.highlights.fillStyle(0xef4b50, 0.45);
      this.highlights.fillCircle(this.cellX(king.col), this.cellY(king.row), TILE * 0.5);
    }
  }

  /** The picked-up square, a dot for each place it can go, and a ring round monsters it can catch. */
  private drawMarks(): void {
    this.marks.clear();
    if (!this.selected) return;
    this.marks.fillStyle(0xffd23f, 0.8);
    this.marks.fillRect(BOARD_LEFT + this.selected.col * TILE, BOARD_TOP + this.selected.row * TILE, TILE, TILE);
    for (const move of this.targets) {
      const x = this.cellX(move.to.col);
      const y = this.cellY(move.to.row);
      if (move.captured) {
        this.marks.lineStyle(12, 0xef4b50, 0.8);
        this.marks.strokeCircle(x, y, TILE * 0.44);
      } else {
        this.marks.fillStyle(0x4a3470, 0.35);
        this.marks.fillCircle(x, y, 26);
      }
    }
  }

  /** The name and moves at the bottom, and a name tag over the piece itself. */
  private showInfo(piece: Piece, square: Square): void {
    const info = PIECE_INFO[piece.kind];
    this.infoText.setText(`${info.symbol} ${info.name}\n${info.moves}`);
    this.showNameTag(info.name, square);
  }

  private showNameTag(name: string, square: Square): void {
    this.nameTag?.destroy();
    const label = this.add
      .text(0, 0, name, { fontFamily: FONT, fontSize: '54px', color: INK })
      .setOrigin(0.5);
    const width = label.width + 56;
    const background = this.add.graphics();
    background.fillStyle(0xffffff);
    background.lineStyle(6, 0x4a3470);
    background.fillRoundedRect(-width / 2, -42, width, 84, 42);
    background.strokeRoundedRect(-width / 2, -42, width, 84, 42);
    // Above the piece, kept on screen, so a finger doesn't cover it.
    const x = Phaser.Math.Clamp(this.cellX(square.col), width / 2 + 10, GAME_WIDTH - width / 2 - 10);
    const tag = this.add.container(x, this.cellY(square.row) - TILE * 0.85, [background, label]).setDepth(HUD_DEPTH - 3);
    this.nameTag = tag;
    tag.setScale(0.6);
    this.tweens.add({ targets: tag, scale: 1, duration: 140, ease: 'Back.easeOut' });
    this.tweens.add({
      targets: tag,
      alpha: 0,
      delay: 1500,
      duration: 300,
      onComplete: () => {
        tag.destroy();
        if (this.nameTag === tag) this.nameTag = undefined;
      },
    });
  }

  private hoverName(pointer: Phaser.Input.Pointer): void {
    const square = this.squareAt(pointer);
    const key = square ? `${square.row},${square.col}` : '';
    if (key === this.hovered) return;
    this.hovered = key;
    const piece = square && this.position.board[square.row][square.col];
    if (piece && this.opponent && !this.endPanel) this.showNameTag(PIECE_INFO[piece.kind].name, square);
  }

  /** Words that float up and fade away. */
  private bubble(x: number, y: number, words: string): void {
    const text = this.add
      .text(x, y, words, { fontFamily: FONT, fontSize: '70px', color: '#ffffff', stroke: INK, strokeThickness: 12 })
      .setOrigin(0.5)
      .setDepth(HUD_DEPTH - 2);
    text.x = Phaser.Math.Clamp(x, text.width / 2 + 10, GAME_WIDTH - text.width / 2 - 10);
    this.tweens.add({
      targets: text,
      y: y - 110,
      alpha: { from: 1, to: 0 },
      duration: 1400,
      ease: 'Sine.easeIn',
      onComplete: () => text.destroy(),
    });
  }

  // ---------------------------------------------------------------- Animation

  /** Wraps a tween in a Promise, so the game flow can read top to bottom with await. */
  private tween(config: Phaser.Types.Tweens.TweenBuilderConfig): Promise<void> {
    return new Promise((resolve) => {
      this.tweens.add({ ...config, onComplete: () => resolve() });
    });
  }

  /**
   * Moves along a curve: x and y slide in a straight line while a bump is added
   * to y, so the monster jumps. `progress` goes from 0 to 1 over the tween.
   */
  private hop(sprite: PieceSprite, toX: number, toY: number, height: number, duration: number, extra: Partial<Phaser.Types.Tweens.TweenBuilderConfig> = {}): Promise<void> {
    const fromX = sprite.x;
    const fromY = sprite.y;
    const arc = { progress: 0 };
    return this.tween({
      targets: arc,
      progress: 1,
      duration,
      ease: 'Sine.easeInOut',
      onUpdate: () => {
        const t = arc.progress;
        sprite.setPosition(fromX + (toX - fromX) * t, fromY + (toY - fromY) * t - Math.sin(Math.PI * t) * height);
      },
      ...extra,
    });
  }

  private async animateMove(move: Move): Promise<void> {
    const { from, to } = move;
    const sprite = this.sprites[from.row][from.col]!;
    const victim = move.capturedAt ? this.sprites[move.capturedAt.row][move.capturedAt.col] : null;
    this.sprites[from.row][from.col] = null;
    if (move.capturedAt) this.sprites[move.capturedAt.row][move.capturedAt.col] = null;
    this.sprites[to.row][to.col] = sprite;

    const distance = Math.max(Math.abs(to.row - from.row), Math.abs(to.col - from.col));
    // Horseys leap high, everyone else does a hop that grows with the distance.
    const height = move.piece.kind === 'n' ? 170 : 50 + distance * 18;
    const duration = 260 + distance * 60;
    sprite.setDepth(50).setScale(1);
    sfx.hop();

    // The monster about to be caught jumps in surprise just before it's reached.
    if (victim) {
      this.time.delayedCall(duration * 0.4, () => {
        this.tweens.add({ targets: victim, y: victim.y - 30, duration: 120, yoyo: true });
      });
    }

    const moving = [this.hop(sprite, this.cellX(to.col), this.cellY(to.row), height, duration)];
    if (move.rook) {
      // Castling: the castle jumps over the king at the same time.
      const rook = this.sprites[move.rook.from.row][move.rook.from.col]!;
      this.sprites[move.rook.from.row][move.rook.from.col] = null;
      this.sprites[move.rook.to.row][move.rook.to.col] = rook;
      rook.setDepth(51);
      moving.push(this.hop(rook, this.cellX(move.rook.to.col), this.cellY(move.rook.to.row), 160, duration));
    }
    await Promise.all(moving);

    sprite.setDepth(10 + sprite.y / 1000);
    // Land with a squish, like a jelly.
    this.tweens.add({ targets: sprite, scaleX: 1.18, scaleY: 0.82, duration: 90, yoyo: true });
    if (victim && move.captured) await this.sendToBench(victim, move.captured, move.piece.side);
    else sfx.thud();

    if (move.promotion) {
      // A pawn that reaches the far side grows into a queen.
      sfx.party();
      burstStars(this, sprite.x, sprite.y, 14);
      const queen: Piece = { side: move.piece.side, kind: move.promotion };
      this.monsterOf(sprite).setTexture(pieceKey(queen)).setDisplaySize(PIECE_SIZE, PIECE_SIZE);
      this.setBadge(sprite, queen);
      await this.tween({ targets: sprite, scale: { from: 0.3, to: 1 }, duration: 400, ease: 'Back.easeOut' });
      this.bubble(sprite.x, sprite.y - 90, 'Queen!');
    }
  }

  /** Boing! The caught monster spins off to the bench, where it sits and watches. */
  private async sendToBench(victim: PieceSprite, piece: Piece, catcher: Side): Promise<void> {
    sfx.pop(2);
    burstStars(this, victim.x, victim.y, 8);
    const spot = this.benchSpot(catcher);
    victim.setData('catcher', catcher).setDepth(60);
    this.benchSprites.push(victim);

    const monster = this.monsterOf(victim);
    const benchScale = BENCH_SIZE / (piece.kind === 'p' ? PAWN_SIZE : PIECE_SIZE);
    this.tweens.add({ targets: monster, angle: 720, duration: 650, onComplete: () => monster.setAngle(0) });
    await this.hop(victim, spot.x, spot.y, 260, 650, {});
    victim.setScale(1);
    this.tweens.add({ targets: victim, scale: benchScale, duration: 150 });
    victim.setDepth(10 + spot.y / 1000);
    sfx.boing();
    // A little dizzy wobble once it lands.
    this.tweens.add({ targets: victim, angle: { from: -12, to: 12 }, duration: 140, yoyo: true, repeat: 3, onComplete: () => victim.setAngle(0) });
  }

  /** A quick side to side shake: "can't do that one right now". */
  private shake(square: Square): void {
    const sprite = this.sprites[square.row][square.col];
    if (!sprite) return;
    sfx.boing();
    this.tweens.add({
      targets: sprite,
      x: { from: this.cellX(square.col) - 14, to: this.cellX(square.col) + 14 },
      duration: 60,
      yoyo: true,
      repeat: 3,
      onComplete: () => sprite.setX(this.cellX(square.col)),
    });
  }

  /** The other team's monsters just give a friendly little jump when tapped. */
  private wave(square: Square): void {
    const sprite = this.sprites[square.row][square.col];
    if (!sprite) return;
    sfx.chirp();
    const y = this.cellY(square.row);
    this.tweens.add({ targets: sprite, y: { from: y, to: y - 40 }, duration: 150, yoyo: true, ease: 'Sine.easeOut' });
  }
}
