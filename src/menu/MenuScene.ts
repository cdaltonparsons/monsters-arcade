import Phaser from 'phaser';
import { games } from '../games';
import { FONT, GAME_HEIGHT, GAME_WIDTH, INK } from '../shared/constants';
import { sfx } from '../shared/sfx';

const CARD_WIDTH = 460;
const CARD_HEIGHT = 520;
const GAP = 60;
const FIRST_ROW_TOP = 500;
const BOTTOM_MARGIN = 40;

/** The game picker: one big card per game, built from the list in games.ts. */
export class MenuScene extends Phaser.Scene {
  constructor() {
    super('menu');
  }

  create(): void {
    this.add
      .text(GAME_WIDTH / 2, 220, 'Monsters\nArcade', {
        fontFamily: FONT,
        fontSize: '130px',
        color: INK,
        align: 'center',
      })
      .setOrigin(0.5);

    // Cards shrink if they wouldn't all fit on screen, never growing past full size.
    const rows = Math.ceil(games.length / 2);
    const fullHeight = rows * CARD_HEIGHT + (rows - 1) * GAP;
    const scale = Math.min(1, (GAME_HEIGHT - FIRST_ROW_TOP - BOTTOM_MARGIN) / fullHeight);
    const stepX = (CARD_WIDTH + GAP) * scale;
    const stepY = (CARD_HEIGHT + GAP) * scale;

    games.forEach((game, index) => {
      // Two columns. A game with nothing beside it sits in the middle.
      const column = index % 2;
      const row = Math.floor(index / 2);
      const isAlone = index === games.length - 1 && column === 0;
      const x = isAlone ? GAME_WIDTH / 2 : GAME_WIDTH / 2 + (column - 0.5) * stepX;
      const y = FIRST_ROW_TOP + (CARD_HEIGHT * scale) / 2 + row * stepY;
      this.addCard(x, y, game.title, game.icon, game.sceneKey, scale);
    });
  }

  private addCard(x: number, y: number, title: string, icon: string, sceneKey: string, scale: number): void {
    const background = this.add.graphics();
    background.fillStyle(0xffffff);
    background.fillRoundedRect(-CARD_WIDTH / 2, -CARD_HEIGHT / 2, CARD_WIDTH, CARD_HEIGHT, 50);

    const picture = this.add.image(0, -50, icon).setDisplaySize(320, 320);
    const label = this.add
      .text(0, 180, title, { fontFamily: FONT, fontSize: '52px', color: INK })
      .setOrigin(0.5);

    // A container moves and scales its children together, like a wrapper div.
    const card = this.add.container(x, y, [background, picture, label]);
    card.setSize(CARD_WIDTH, CARD_HEIGHT).setInteractive().setScale(scale);

    // Gently bob, so the card looks alive and tappable.
    this.tweens.add({
      targets: picture,
      y: -70,
      duration: 700,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    card.on('pointerup', () => {
      sfx.tap();
      this.scene.start(sceneKey);
    });
  }
}
