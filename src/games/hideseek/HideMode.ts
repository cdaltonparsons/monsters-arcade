import Phaser from 'phaser';
import { MONSTERS } from '../../shared/assets';
import { FONT, HUD_DEPTH, INK, GAME_WIDTH } from '../../shared/constants';
import { sfx } from '../../shared/sfx';
import { burstStars } from '../../shared/ui';
import type { HideSeekScene, Mode } from './HideSeekScene';
import { closestSpot, HIDE_REACH, hidePoint, seekerMayStart, seekerRoute, type Point } from './rules';

const SEEKER_SIZE = 190;
const SEEKER_SPEED = 750; // Pixels per second.
const COUNT_STEP_MS = 800;
const COUNT_TO = 10;
const LOOK_MS = 800;

/**
 * The kid hides. A monster counts with a blindfold on, and it only comes looking
 * once the hero is behind something. There's no timer, so a slow hider is fine.
 */
export class HideMode implements Mode {
  private readonly seeker: Phaser.GameObjects.Image;
  private readonly blindfold: Phaser.GameObjects.Rectangle;
  private readonly countLabel: Phaser.GameObjects.Text;

  private heroSpot: number | null = null;
  private hiddenForMs = 0;
  private count = 1;
  private seeking = false;

  constructor(private readonly scene: HideSeekScene) {
    const { start } = scene.field;
    const hero = scene.walker.sprite;
    hero.setPosition(start.x, start.y + 150);

    const texture = Phaser.Utils.Array.GetRandom(MONSTERS);
    this.seeker = scene.add
      .image(start.x, start.y - 80, texture)
      .setDisplaySize(SEEKER_SIZE, SEEKER_SIZE)
      .setDepth(start.y - 80);
    this.blindfold = scene.add
      .rectangle(start.x, start.y - 105, SEEKER_SIZE, 56, 0x4a3470)
      .setDepth(start.y - 79);

    this.countLabel = scene.add
      .text(GAME_WIDTH / 2, 300, '1', {
        fontFamily: FONT,
        fontSize: '200px',
        color: '#ffffff',
        stroke: INK,
        strokeThickness: 16,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(HUD_DEPTH);

    scene.time.addEvent({
      delay: COUNT_STEP_MS,
      repeat: COUNT_TO - 2,
      callback: () => this.countUp(),
    });
  }

  private countUp(): void {
    if (this.seeking) return;
    this.count++;
    this.countLabel.setText(String(this.count));
    this.scene.tweens.add({ targets: this.countLabel, scale: { from: 1.25, to: 1 }, duration: 200 });
    sfx.tap();
  }

  // ---------------------------------------------------------------- The game loop

  update(delta: number): void {
    const { scene } = this;
    const hero = scene.walker.sprite;

    if (this.seeking) {
      scene.walker.walk(Phaser.Math.Vector2.ZERO);
      scene.arrow.point(hero, null);
      this.seeker.setDepth(this.seeker.y + 90);
      return;
    }

    const push = scene.joystick.read();
    scene.walker.walk(push);

    if (push.lengthSq() > 0.01) {
      this.leaveHidingSpot();
    } else if (this.heroSpot === null) {
      const near = closestSpot(hero, scene.field.spots, HIDE_REACH);
      if (near !== null) this.duckBehind(near);
    } else {
      this.hiddenForMs += delta;
      if (seekerMayStart(this.count, this.hiddenForMs)) this.startSeeking();
    }

    // Until hidden, the arrow points to the nearest place to hide.
    const nearest = closestSpot(hero, scene.field.spots)!;
    const goal: Point | null = this.heroSpot === null ? hidePoint(scene.field.spots[nearest]) : null;
    scene.arrow.point(hero, goal, HIDE_REACH);
  }

  // ---------------------------------------------------------------- Hiding

  /** A tween slides the hero behind the spot. Depth sorting by y does the actual hiding. */
  private duckBehind(spotIndex: number): void {
    const { scene } = this;
    const spot = scene.field.spots[spotIndex];
    const hide = hidePoint(spot);
    this.heroSpot = spotIndex;
    this.hiddenForMs = 0;
    scene.tweens.add({ targets: scene.walker.sprite, x: hide.x, y: hide.y, duration: 220, ease: 'Sine.easeOut' });
    scene.wiggle(spotIndex, 4);
    scene.bubble(spot.x, spot.y - 260, 'Shh!');
    sfx.boing();
  }

  private leaveHidingSpot(): void {
    if (this.heroSpot === null) return;
    this.heroSpot = null;
    this.scene.tweens.killTweensOf(this.scene.walker.sprite);
  }

  // ---------------------------------------------------------------- Seeking

  private startSeeking(): void {
    const { scene } = this;
    this.seeking = true;
    this.blindfold.destroy();
    this.countLabel.setText('Ready\nor not!').setFontSize(130).setAlign('center');
    scene.tweens.add({ targets: this.countLabel, alpha: 0, delay: 900, duration: 400 });
    sfx.chirp();

    // Follow the seeker now: the fun is watching it get closer and closer.
    scene.cameras.main.startFollow(this.seeker, true, 0.08, 0.08);

    const route = seekerRoute(this.seeker, scene.field.spots, this.heroSpot!);
    scene.time.delayedCall(1100, () => this.visit(route, 0));
  }

  /** Walk to one spot, look behind it, then go to the next. The last one has the hero. */
  private visit(route: number[], step: number): void {
    const { scene } = this;
    const spotIndex = route[step];
    const spot = scene.field.spots[spotIndex];
    const to = { x: spot.x, y: spot.y + 130 };
    const distance = Math.hypot(this.seeker.x - to.x, this.seeker.y - to.y);
    const duration = (distance / SEEKER_SPEED) * 1000;

    const waddle = scene.tweens.add({
      targets: this.seeker,
      angle: { from: -8, to: 8 },
      duration: 140,
      yoyo: true,
      repeat: -1,
    });
    scene.tweens.add({
      targets: this.seeker,
      ...to,
      duration,
      ease: 'Sine.easeInOut',
      onComplete: () => {
        waddle.stop();
        this.seeker.setAngle(0);
        const isLast = step === route.length - 1;
        scene.wiggle(spotIndex, 5);
        if (isLast) {
          this.found(route);
          return;
        }
        scene.bubble(spot.x, spot.y - 260, '?');
        sfx.boing();
        scene.time.delayedCall(LOOK_MS, () => this.visit(route, step + 1));
      },
    });
  }

  /** Found! The hero jumps out, everybody's delighted, and each wrong guess was a star. */
  private found(route: number[]): void {
    const { scene } = this;
    const hero = scene.walker.sprite;
    const spot = scene.field.spots[this.heroSpot!];
    const out = { x: spot.x - 170, y: spot.y + 90 };

    scene.tweens.add({ targets: hero, ...out, duration: 320, ease: 'Back.easeOut' });
    scene.tweens.add({ targets: this.seeker, y: this.seeker.y - 120, duration: 220, yoyo: true, repeat: 3, ease: 'Sine.easeOut' });
    scene.bubble(spot.x, spot.y - 280, 'Found you!');
    burstStars(scene, spot.x, spot.y - 100, 14);
    sfx.chirp();
    scene.addStars(route.length);
    scene.time.delayedCall(500, () => scene.endRound());
  }
}
