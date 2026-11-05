import Phaser from 'phaser';
import { games } from '../games';
import { FONT, GAME_WIDTH, INK } from '../shared/constants';
import { sfx } from '../shared/sfx';

const CARD_WIDTH = 460;
const CARD_HEIGHT = 520;
const GAP = 60;

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

    const left = (GAME_WIDTH - (CARD_WIDTH * 2 + GAP)) / 2 + CARD_WIDTH / 2;
    games.forEach((game, index) => {
      // Two columns. A lone game sits in the middle.
      const column = index % 2;
      const row = Math.floor(index / 2);
      const x = games.length === 1 ? GAME_WIDTH / 2 : left + column * (CARD_WIDTH + GAP);
      const y = 760 + row * (CARD_HEIGHT + GAP);
      this.addCard(x, y, game.title, game.icon, game.sceneKey);
    });
  }

  private addCard(x: number, y: number, title: string, icon: string, sceneKey: string): void {
    const background = this.add.graphics();
    background.fillStyle(0xffffff);
    background.fillRoundedRect(-CARD_WIDTH / 2, -CARD_HEIGHT / 2, CARD_WIDTH, CARD_HEIGHT, 50);

    const picture = this.add.image(0, -50, icon).setDisplaySize(320, 320);
    const label = this.add
      .text(0, 180, title, { fontFamily: FONT, fontSize: '56px', color: INK })
      .setOrigin(0.5);

    // A container moves and scales its children together, like a wrapper div.
    const card = this.add.container(x, y, [background, picture, label]);
    card.setSize(CARD_WIDTH, CARD_HEIGHT).setInteractive();

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
