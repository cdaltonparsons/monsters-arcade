import Phaser from 'phaser';
import { FONT, GAME_HEIGHT, GAME_WIDTH, HUD_DEPTH, INK } from '../../shared/constants';
import { GoalArrow } from '../../shared/GoalArrow';
import { drawGrass } from '../../shared/ground';
import { Hero } from '../../shared/Hero';
import { Joystick } from '../../shared/Joystick';
import { sfx } from '../../shared/sfx';
import { addHomeButton, burstStars } from '../../shared/ui';
import boulderArt from './art/boulder.svg?url';
import bushArt from './art/bush.svg?url';
import butterflyArt from './art/butterfly.svg?url';
import crateArt from './art/crate.svg?url';
import { HideMode } from './HideMode';
import { FIELD_HEIGHT, FIELD_WIDTH, generateField, type Field, type SpotKind } from './rules';
import { SeekMode } from './SeekMode';

const CARD_WIDTH = 760;
const CARD_HEIGHT = 580;

const ROUND_END_MS = 2800;

/** `originY` lines the picture up so (x, y) is where the spot touches the ground. */
const SPOT_ART: Record<SpotKind, { key: string; originY: number }> = {
  bush: { key: 'hideseek-bush', originY: 0.85 },
  boulder: { key: 'hideseek-boulder', originY: 0.85 },
  crate: { key: 'hideseek-crate', originY: 0.85 },
  tree: { key: 'scenery-tree', originY: 0.9 },
};

/** Each way of playing is a class with an update(), and the scene runs whichever is active. */
export interface Mode {
  update(delta: number): void;
}

/**
 * Sets up what both ways of playing share: the field, the hero, the controls and
 * the star count. It starts by asking who's hiding, then hands over to SeekMode
 * or HideMode. Think of those as child components, with this as their parent.
 */
export class HideSeekScene extends Phaser.Scene {
  static readonly KEY = 'hideseek';

  field!: Field;
  spotArt!: Phaser.GameObjects.Image[];
  walker!: Hero;
  joystick!: Joystick;
  arrow!: GoalArrow;

  private mode!: Mode | null;
  private round!: number;
  private stars!: number;
  private starLabel!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: HideSeekScene.KEY, physics: { arcade: {} } });
  }

  preload(): void {
    this.load.svg('hideseek-bush', bushArt, { width: 340, height: 280 });
    this.load.svg('hideseek-boulder', boulderArt, { width: 340, height: 280 });
    this.load.svg('hideseek-crate', crateArt, { width: 300, height: 290 });
    this.load.svg('hideseek-butterfly', butterflyArt, { width: 100, height: 100 });
  }

  /** scene.restart(data) runs this again with fresh objects, carrying over only `data`. */
  create(data: { round?: number; stars?: number }): void {
    this.round = data.round ?? 1;
    this.stars = data.stars ?? 0;
    this.mode = null;
    this.field = generateField();

    drawGrass(this, FIELD_WIDTH, FIELD_HEIGHT);
    this.spotArt = this.field.spots.map((spot) => {
      const { key, originY } = SPOT_ART[spot.kind];
      return this.add.image(spot.x, spot.y, key).setOrigin(0.5, originY).setDepth(spot.y);
    });

    this.walker = new Hero(this, this.field.start.x, this.field.start.y);
    this.cameras.main.startFollow(this.walker.sprite, true, 0.12, 0.12);
    this.joystick = new Joystick(this);
    this.arrow = new GoalArrow(this);
    this.addHud();
    this.addPicker();
  }

  /** Phaser calls this about 60 times a second, whichever mode is playing. */
  update(_time: number, delta: number): void {
    if (this.mode) {
      this.mode.update(delta);
    } else {
      this.walker.walk(Phaser.Math.Vector2.ZERO);
      this.arrow.point(this.walker.sprite, null);
    }
  }

  // ---------------------------------------------------------------- Screen furniture

  private addHud(): void {
    addHomeButton(this).setScrollFactor(0).setDepth(HUD_DEPTH);
    this.add.image(880, 100, 'icon-star').setScrollFactor(0).setDepth(HUD_DEPTH);
    this.starLabel = this.add
      .text(940, 100, String(this.stars), {
        fontFamily: FONT,
        fontSize: '72px',
        color: '#ffffff',
        stroke: INK,
        strokeThickness: 10,
      })
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(HUD_DEPTH);
  }

  /** Two big cards: go and find them, or go and hide. */
  private addPicker(): void {
    const dim = this.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.35)
      .setScrollFactor(0)
      .setDepth(HUD_DEPTH - 1);

    const seekPicture = this.add.image(0, -40, 'icon-hide').setDisplaySize(440, 440);
    const hero = this.add.image(0, -130, 'hero-big').setDisplaySize(320, 320);
    const bush = this.add.image(0, 10, 'hideseek-bush').setDisplaySize(500, 410);

    const choose = (start: () => Mode): void => {
      sfx.tap();
      dim.destroy();
      seekCard.destroy();
      hideCard.destroy();
      this.mode = start();
    };
    const seekCard = this.addCard(GAME_HEIGHT * 0.33, 'You find them!', [seekPicture], () =>
      choose(() => new SeekMode(this, this.round)),
    );
    const hideCard = this.addCard(GAME_HEIGHT * 0.33 + CARD_HEIGHT + 60, 'You hide!', [hero, bush], () =>
      choose(() => new HideMode(this)),
    );
  }

  private addCard(
    y: number,
    title: string,
    pictures: Phaser.GameObjects.Image[],
    onPick: () => void,
  ): Phaser.GameObjects.Container {
    const background = this.add.graphics();
    background.fillStyle(0xffffff);
    background.fillRoundedRect(-CARD_WIDTH / 2, -CARD_HEIGHT / 2, CARD_WIDTH, CARD_HEIGHT, 60);
    const label = this.add
      .text(0, CARD_HEIGHT / 2 - 70, title, { fontFamily: FONT, fontSize: '72px', color: INK })
      .setOrigin(0.5);

    const card = this.add.container(GAME_WIDTH / 2, y, [background, ...pictures, label]);
    card.setSize(CARD_WIDTH, CARD_HEIGHT).setInteractive().setScrollFactor(0).setDepth(HUD_DEPTH);
    card.on('pointerup', onPick);
    return card;
  }

  // ---------------------------------------------------------------- Helpers for the modes

  /** A spot shakes when someone looks behind it, or when a friend behind it fidgets. */
  wiggle(spotIndex: number, strength = 3): void {
    const art = this.spotArt[spotIndex];
    this.tweens.killTweensOf(art);
    this.tweens.add({
      targets: art,
      angle: { from: -strength, to: strength },
      duration: 70,
      yoyo: true,
      repeat: 2,
      onComplete: () => art.setAngle(0),
    });
  }

  /** Words that float up and fade away, like "Shh!" */
  bubble(x: number, y: number, words: string): void {
    const text = this.add
      .text(x, y, words, { fontFamily: FONT, fontSize: '84px', color: '#ffffff', stroke: INK, strokeThickness: 12 })
      .setOrigin(0.5)
      .setDepth(HUD_DEPTH - 2);
    this.tweens.add({
      targets: text,
      y: y - 120,
      alpha: { from: 1, to: 0 },
      duration: 1100,
      ease: 'Sine.easeIn',
      onComplete: () => text.destroy(),
    });
  }

  addStars(count: number): void {
    this.stars += count;
    this.starLabel.setText(String(this.stars));
  }

  /** Everyone cheers, then back to the cards for another go. */
  endRound(nextRound = this.round): void {
    sfx.party();
    const { x, y } = this.walker.sprite;
    for (let i = 0; i < 10; i++) {
      this.time.delayedCall(i * 170, () => {
        burstStars(this, x + Phaser.Math.Between(-420, 420), y + Phaser.Math.Between(-700, 500), 14);
      });
    }
    this.time.delayedCall(ROUND_END_MS, () => this.scene.restart({ round: nextRound, stars: this.stars }));
  }
}
