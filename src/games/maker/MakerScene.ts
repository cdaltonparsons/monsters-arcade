import Phaser from 'phaser';
import {
  avatarSvg,
  OPTIONS,
  PARTS,
  randomAvatar,
  type Avatar,
  type Part,
} from '../../shared/avatar';
import { addSvgTexture, applyAvatar, loadAvatar, saveAvatar } from '../../shared/avatar-textures';
import { GAME_HEIGHT, GAME_WIDTH, INK } from '../../shared/constants';
import { sfx } from '../../shared/sfx';
import { addHomeButton, burstStars } from '../../shared/ui';
import dice from './art/dice.svg?url';
import done from './art/done.svg?url';
import { TAB_ICONS } from './tabs';

const PREVIEW_Y = 390;
const PREVIEW_SIZE = 500;
const TAB_Y = 760;
const TAB_SIZE = 160;
const GRID_Y = 1000; // The middle of the first row of choices.
const CHOICE_SIZE = 270;
const CHOICE_GAP = 40;
const DONE_Y = GAME_HEIGHT - 130;

/** Never reused, so a picture being cleared away can't be mistaken for a new one. */
let nextTextureNumber = 0;

/**
 * Pick a tab, then tap a choice. Every choice is drawn on the player's own monster,
 * so nobody has to imagine what it would look like. Each picture is an SVG string
 * from avatar.ts, turned into a texture the first time it's needed.
 */
export class MakerScene extends Phaser.Scene {
  static readonly KEY = 'maker';

  private avatar!: Avatar;
  private part!: Part;
  private preview!: Phaser.GameObjects.Image;
  private previewFrame!: 1 | 2;
  private tabRings!: Partial<Record<Part, Phaser.GameObjects.Arc>>;
  private choices!: Phaser.GameObjects.GameObject[];
  /** Pictures made by this scene, so they can be cleared away when leaving. */
  private madeTextures!: Map<string, Promise<string>>;
  /** Tapping fast can start several redraws. Only the newest one gets shown. */
  private drawNumber!: number;

  constructor() {
    super(MakerScene.KEY);
  }

  preload(): void {
    this.load.svg('maker-dice', dice, { width: 170, height: 170 });
    this.load.svg('maker-done', done, { width: 160, height: 160 });
  }

  async create(): Promise<void> {
    this.avatar = loadAvatar();
    this.part = 'body';
    this.previewFrame = 1;
    this.tabRings = {};
    this.choices = [];
    this.madeTextures = new Map();
    this.drawNumber = 0;

    this.events.once('shutdown', () => this.clearTextures());

    addHomeButton(this, () => applyAvatar(this.game, this.avatar));

    this.add.circle(GAME_WIDTH / 2, PREVIEW_Y + 10, PREVIEW_SIZE / 2 + 20, 0xffffff);
    this.addButton(GAME_WIDTH - 110, 110, 'maker-dice', () => this.rollDice());
    this.addButton(GAME_WIDTH / 2, DONE_Y, 'maker-done', () => this.finish());

    const firstPicture = await this.textureFor(avatarSvg(this.avatar, 1, PREVIEW_SIZE));
    if (!this.scene.isActive()) return;
    this.preview = this.add.image(GAME_WIDTH / 2, PREVIEW_Y, firstPicture);
    this.preview.setInteractive().on('pointerup', () => {
      sfx.chirp();
      this.wiggle();
    });

    // The preview marches on the spot, to show how the monster will walk.
    this.time.addEvent({
      delay: 320,
      loop: true,
      callback: () => void this.stepPreview(),
    });

    await this.addTabs();
    await this.redraw();
  }

  private addButton(x: number, y: number, texture: string, onPress: () => void): void {
    this.add.image(x, y, texture).setInteractive().on('pointerup', onPress);
  }

  private async addTabs(): Promise<void> {
    const spacing = GAME_WIDTH / PARTS.length;
    await Promise.all(
      PARTS.map(async (part, index) => {
        const x = spacing * index + spacing / 2;
        const ring = this.add.circle(x, TAB_Y, TAB_SIZE / 2, 0xffffff).setStrokeStyle(10, 0xffffff);
        this.tabRings[part] = ring;
        ring.setInteractive().on('pointerup', () => this.chooseTab(part));
        const key = await this.textureFor(TAB_ICONS[part]);
        if (this.scene.isActive()) this.add.image(x, TAB_Y, key);
      }),
    );
  }

  private chooseTab(part: Part): void {
    sfx.tap();
    this.part = part;
    void this.redraw();
  }

  private rollDice(): void {
    this.avatar = randomAvatar();
    this.onAvatarChanged();
    sfx.party();
    burstStars(this, GAME_WIDTH / 2, PREVIEW_Y, 18);
  }

  private choose(choice: string): void {
    this.avatar = { ...this.avatar, [this.part]: choice };
    this.onAvatarChanged();
    sfx.pop(2);
    burstStars(this, GAME_WIDTH / 2, PREVIEW_Y, 8);
  }

  private onAvatarChanged(): void {
    saveAvatar(this.avatar);
    this.wiggle();
    void this.redraw();
  }

  private async finish(): Promise<void> {
    sfx.party();
    burstStars(this, GAME_WIDTH / 2, PREVIEW_Y, 20);
    await applyAvatar(this.game, this.avatar);
    this.scene.start('menu');
  }

  private wiggle(): void {
    this.tweens.killTweensOf(this.preview);
    this.preview.setScale(1);
    this.tweens.add({ targets: this.preview, scaleX: 1.12, scaleY: 0.9, duration: 110, yoyo: true, repeat: 1 });
  }

  private async stepPreview(): Promise<void> {
    this.previewFrame = this.previewFrame === 1 ? 2 : 1;
    await this.showPreview();
  }

  private async showPreview(): Promise<void> {
    const key = await this.textureFor(avatarSvg(this.avatar, this.previewFrame, PREVIEW_SIZE));
    if (!this.scene.isActive()) return;
    this.preview.setTexture(key);
  }

  /** Redraws the choices for the current tab, once all the pictures are ready. */
  private async redraw(): Promise<void> {
    const draw = ++this.drawNumber;
    const part = this.part;
    const options = OPTIONS[part] as readonly string[];
    const keys = await Promise.all(
      options.map((choice) => this.textureFor(avatarSvg({ ...this.avatar, [part]: choice }, 1, CHOICE_SIZE))),
    );
    if (draw !== this.drawNumber || !this.scene.isActive()) return;

    await this.showPreview();
    if (draw !== this.drawNumber || !this.scene.isActive()) return;

    for (const [tab, ring] of Object.entries(this.tabRings)) {
      ring.setStrokeStyle(10, tab === part ? 0xff9130 : 0xffffff);
    }
    this.choices.forEach((choice) => choice.destroy());
    this.choices = options.flatMap((choice, index) => this.addChoice(choice, keys[index], index));
  }

  private addChoice(choice: string, key: string, index: number): Phaser.GameObjects.GameObject[] {
    const column = index % 3;
    const row = Math.floor(index / 3);
    const x = GAME_WIDTH / 2 + (column - 1) * (CHOICE_SIZE + CHOICE_GAP);
    const y = GRID_Y + row * (CHOICE_SIZE + 10);
    const isChosen = this.avatar[this.part] === choice;

    const backing = this.add.graphics();
    backing.fillStyle(isChosen ? 0xffd9a8 : 0xffffff);
    backing.fillRoundedRect(x - CHOICE_SIZE / 2, y - CHOICE_SIZE / 2 + 5, CHOICE_SIZE, CHOICE_SIZE - 10, 40);
    if (isChosen) {
      backing.lineStyle(10, Phaser.Display.Color.HexStringToColor(INK).color);
      backing.strokeRoundedRect(x - CHOICE_SIZE / 2, y - CHOICE_SIZE / 2 + 5, CHOICE_SIZE, CHOICE_SIZE - 10, 40);
    }
    const image = this.add.image(x, y, key).setInteractive();
    image.on('pointerup', () => this.choose(choice));
    return [backing, image];
  }

  // ---------------------------------------------------------------- Pictures

  /** Each different picture only gets made once, however many times it's shown. */
  private textureFor(svg: string): Promise<string> {
    let texture = this.madeTextures.get(svg);
    if (!texture) {
      const key = `maker-${nextTextureNumber++}`;
      texture = addSvgTexture(this.game, key, svg).then(() => key);
      this.madeTextures.set(svg, texture);
    }
    return texture;
  }

  private clearTextures(): void {
    const { game, madeTextures } = this;
    for (const texture of madeTextures.values()) {
      void texture.then((key) => {
        if (game.textures.exists(key)) game.textures.remove(key);
      });
    }
  }
}
