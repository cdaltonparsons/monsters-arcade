import Phaser from 'phaser';
import { MONSTERS } from '../../shared/assets';
import { FONT, GAME_HEIGHT, GAME_WIDTH } from '../../shared/constants';
import { sfx } from '../../shared/sfx';
import { addHomeButton, burstStars } from '../../shared/ui';
import flowerArt from './art/flower.svg?url';
import arrowArt from './art/arrow.svg?url';
import houseArt from './art/house.svg?url';
import pondArt from './art/pond.svg?url';
import rockArt from './art/rock.svg?url';
import treeArt from './art/tree.svg?url';
import {
  generateWorld,
  HERO_RADIUS,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  type Obstacle,
  type ObstacleKind,
  type Point,
  type World,
} from './world';

// Tweak these to change how the game feels.
const HERO_SPEED = 560; // Pixels per second.
const JOYSTICK_REACH = 130; // How far to drag for full speed.
const FIRST_ROUND_BABIES = 3;
const MOST_BABIES = 8;
const STAR_COUNT = 25;
const REACH = 130; // How close the hero must get to pick something up.
const HOME_REACH = 330;
const TRAIL_STEP = 12; // Remember the hero's position every this many pixels...
const TRAIL_GAP = 11; // ...and leave this many remembered positions between followers.

/** Things drawn above the world have to beat every y position, so start high. */
const HUD_DEPTH = 100000;

/**
 * Where the picture sits relative to its solid circle. `originY` lines the
 * circle up with the bottom of the art, so you can walk behind the treetops.
 */
const ART: Record<ObstacleKind, { key: string; size: [number, number]; originY: number }> = {
  tree: { key: 'quest-tree', size: [280, 400], originY: 0.9 },
  rock: { key: 'quest-rock', size: [260, 200], originY: 0.7 },
  pond: { key: 'quest-pond', size: [440, 440], originY: 0.5 },
  house: { key: 'quest-house', size: [440, 440], originY: 0.75 },
};

interface Baby {
  image: Phaser.GameObjects.Image;
  texture: string;
}

/**
 * A walk-around game. Unlike match 3, which waits for a tap, this has an update()
 * method that Phaser calls about 60 times a second. Each call: read the controls,
 * set the hero's speed, and let physics move it and stop it at obstacles.
 */
export class QuestScene extends Phaser.Scene {
  static readonly KEY = 'quest';

  private world!: World;
  private round!: number;
  private hero!: Phaser.Physics.Arcade.Sprite;
  private shadow!: Phaser.GameObjects.Ellipse;
  private arrow!: Phaser.GameObjects.Image;
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;

  private lostBabies!: Baby[];
  private followers!: Baby[];
  private homeCount!: number;
  private babySlots!: Phaser.GameObjects.Image[];
  private trail!: Point[];

  private stars!: Phaser.GameObjects.Image[];
  private starCount!: number;
  private starLabel!: Phaser.GameObjects.Text;

  private joystickBase!: Phaser.GameObjects.Arc;
  private joystickKnob!: Phaser.GameObjects.Arc;
  /** The way the player is pushing: x and y from -1 to 1. */
  private push!: Phaser.Math.Vector2;
  private lastThudAt!: number;

  constructor() {
    // Arcade is Phaser's simple physics: speeds and overlapping shapes.
    super({ key: QuestScene.KEY, physics: { arcade: {} } });
  }

  preload(): void {
    this.load.svg('quest-tree', treeArt, { width: 280, height: 400 });
    this.load.svg('quest-rock', rockArt, { width: 260, height: 200 });
    this.load.svg('quest-pond', pondArt, { width: 440, height: 440 });
    this.load.svg('quest-house', houseArt, { width: 440, height: 440 });
    this.load.svg('quest-flower', flowerArt, { width: 60, height: 60 });
    this.load.svg('quest-arrow', arrowArt, { width: 110, height: 110 });
  }

  create(data: { round?: number }): void {
    this.round = data.round ?? 1;
    this.followers = [];
    this.homeCount = 0;
    this.starCount = 0;
    this.lastThudAt = 0;
    this.push = new Phaser.Math.Vector2();

    const babyCount = Math.min(FIRST_ROUND_BABIES + this.round - 1, MOST_BABIES);
    this.world = generateWorld(babyCount, STAR_COUNT);

    this.drawGround();
    const blockers = this.addObstacles();
    this.addHero();
    this.addPickups();
    this.addCamera();
    this.addHud(babyCount);
    this.addJoystick();

    // When the hero bumps into something solid, call onBump.
    this.physics.add.collider(this.hero, blockers, (_hero, blocker) => {
      this.onBump(blocker as Phaser.GameObjects.Arc);
    });
  }

  // ---------------------------------------------------------------- Building the world

  private drawGround(): void {
    this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.add.rectangle(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, WORLD_WIDTH, WORLD_HEIGHT, 0x8fd46f).setDepth(-3);

    for (let i = 0; i < 60; i++) {
      const x = Phaser.Math.Between(0, WORLD_WIDTH);
      const y = Phaser.Math.Between(0, WORLD_HEIGHT);
      this.add.ellipse(x, y, Phaser.Math.Between(160, 420), Phaser.Math.Between(90, 200), 0x83cb64).setDepth(-2);
    }
    for (let i = 0; i < 130; i++) {
      const x = Phaser.Math.Between(0, WORLD_WIDTH);
      const y = Phaser.Math.Between(0, WORLD_HEIGHT);
      this.add.image(x, y, 'quest-flower').setScale(Phaser.Math.FloatBetween(0.5, 1)).setDepth(-1);
    }
  }

  /**
   * Each obstacle has two parts: the picture you see, and an invisible circle
   * that does the bumping (its "hitbox"). They don't have to match. The tree's
   * circle is only around the trunk, which is what lets you walk behind the leaves.
   */
  private addObstacles(): Phaser.Physics.Arcade.StaticGroup {
    const blockers = this.physics.add.staticGroup();
    for (const obstacle of this.world.obstacles) {
      const art = this.addObstacleArt(obstacle);
      const blocker = this.add.circle(obstacle.x, obstacle.y, obstacle.radius).setVisible(false);
      blocker.setData('art', art);
      blockers.add(blocker);
      (blocker.body as Phaser.Physics.Arcade.StaticBody).setCircle(obstacle.radius);
    }
    return blockers;
  }

  private addObstacleArt(obstacle: Obstacle): Phaser.GameObjects.Image {
    const { key, originY } = ART[obstacle.kind];
    const art = this.add.image(obstacle.x, obstacle.y, key).setOrigin(0.5, originY);
    // Things lower on screen draw on top, so the world looks like it has depth.
    // A pond is flat, so it always draws underneath everything else.
    return art.setDepth(obstacle.kind === 'pond' ? -0.5 : obstacle.y);
  }

  private addHero(): void {
    const { start } = this.world;
    if (!this.anims.exists('hero-walk')) {
      // Flip between two pictures, like a two-page flipbook.
      this.anims.create({
        key: 'hero-walk',
        frames: [{ key: 'hero-1' }, { key: 'hero-2' }],
        frameRate: 9,
        repeat: -1,
      });
    }
    this.shadow = this.add.ellipse(start.x, start.y, 130, 44, 0x000000, 0.16);
    this.hero = this.physics.add.sprite(start.x, start.y, 'hero-1');
    this.hero.setCollideWorldBounds(true);
    // The hitbox is around the feet, not the whole picture.
    this.hero.setCircle(HERO_RADIUS, 90 - HERO_RADIUS, 180 - HERO_RADIUS * 2);
  }

  private addPickups(): void {
    this.lostBabies = this.world.babies.map((point, index) => {
      const texture = MONSTERS[index % MONSTERS.length];
      const image = this.add.image(point.x, point.y, texture).setDisplaySize(120, 120).setDepth(point.y);
      // A little hop, so a lost baby catches the eye.
      this.tweens.add({
        targets: image,
        y: point.y - 34,
        duration: 340,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeOut',
        delay: index * 90,
      });
      return { image, texture };
    });

    this.stars = this.world.stars.map((point, index) => {
      const star = this.add.image(point.x, point.y, 'icon-star').setDepth(point.y);
      this.tweens.add({
        targets: star,
        scale: 1.2,
        duration: 500,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
        delay: index * 40,
      });
      return star;
    });
    this.trail = [{ x: this.hero.x, y: this.hero.y }];

    this.arrow = this.add.image(this.hero.x, this.hero.y, 'quest-arrow').setDepth(HUD_DEPTH - 1);
    this.tweens.add({ targets: this.arrow, scale: 1.2, duration: 380, yoyo: true, repeat: -1 });
  }

  private addCamera(): void {
    // The world is bigger than the screen, so the camera follows the hero around.
    // The small numbers make it glide along a little behind, instead of being rigid.
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.cameras.main.startFollow(this.hero, true, 0.12, 0.12);
  }

  /** setScrollFactor(0) pins something to the screen instead of the world. */
  private addHud(babyCount: number): void {
    addHomeButton(this).setScrollFactor(0).setDepth(HUD_DEPTH);

    this.babySlots = this.lostBabies.map(({ texture }, index) => {
      const size = babyCount > 5 ? 74 : 92;
      const x = 240 + index * (size + 12);
      return this.add
        .image(x, 100, texture)
        .setDisplaySize(size, size)
        .setScrollFactor(0)
        .setDepth(HUD_DEPTH)
        .setTint(0x444444)
        .setAlpha(0.55);
    });

    this.add.image(880, 100, 'icon-star').setScrollFactor(0).setDepth(HUD_DEPTH);
    this.starLabel = this.add
      .text(940, 100, '0', { fontFamily: FONT, fontSize: '72px', color: '#ffffff', stroke: '#4a3470', strokeThickness: 10 })
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(HUD_DEPTH);
  }

  // ---------------------------------------------------------------- Controls

  /**
   * A joystick that appears wherever a finger lands, so small hands can't miss it.
   * It rests faintly at the bottom of the screen to show that it's there.
   */
  private addJoystick(): void {
    this.joystickBase = this.add.circle(0, 0, JOYSTICK_REACH + 40, 0xffffff, 0.3).setScrollFactor(0).setDepth(HUD_DEPTH);
    this.joystickKnob = this.add.circle(0, 0, 80, 0xffffff, 0.85).setScrollFactor(0).setDepth(HUD_DEPTH);
    this.restJoystick();

    this.cursors = this.input.keyboard?.createCursorKeys(); // Arrow keys, for testing on a computer.

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (over.length > 0) return; // That tap was on the home button.
      this.joystickBase.setPosition(pointer.x, pointer.y).setAlpha(1);
      this.joystickKnob.setPosition(pointer.x, pointer.y).setAlpha(1);
    });
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (pointer.isDown) this.moveJoystick(pointer);
    });
    this.input.on('pointerup', () => this.restJoystick());
    this.input.on('pointerupoutside', () => this.restJoystick());
  }

  private moveJoystick(pointer: Phaser.Input.Pointer): void {
    const drag = new Phaser.Math.Vector2(pointer.x - this.joystickBase.x, pointer.y - this.joystickBase.y);
    const strength = Math.min(drag.length() / JOYSTICK_REACH, 1);
    this.push = drag.normalize().scale(strength);
    this.joystickKnob.setPosition(
      this.joystickBase.x + this.push.x * JOYSTICK_REACH,
      this.joystickBase.y + this.push.y * JOYSTICK_REACH,
    );
  }

  private restJoystick(): void {
    this.push = new Phaser.Math.Vector2();
    const x = GAME_WIDTH / 2;
    const y = GAME_HEIGHT - 260;
    this.joystickBase.setPosition(x, y).setAlpha(0.5);
    this.joystickKnob.setPosition(x, y).setAlpha(0.5);
  }

  private readControls(): Phaser.Math.Vector2 {
    const keys = this.cursors;
    if (!keys) return this.push;
    const x = Number(keys.right.isDown) - Number(keys.left.isDown);
    const y = Number(keys.down.isDown) - Number(keys.up.isDown);
    return x === 0 && y === 0 ? this.push : new Phaser.Math.Vector2(x, y).normalize();
  }

  // ---------------------------------------------------------------- The game loop

  /** Runs about 60 times a second. `delta` is the milliseconds since the last run. */
  update(_time: number, delta: number): void {
    this.moveHero();
    this.moveFollowers(delta);
    this.collectStars();
    this.findBabies();
    this.checkHome();
    this.pointArrow();
  }

  private moveHero(): void {
    const push = this.readControls();
    // We only ever set a speed. Physics moves the hero and handles the bumping.
    this.hero.setVelocity(push.x * HERO_SPEED, push.y * HERO_SPEED);

    if (push.lengthSq() > 0.01) {
      this.hero.play('hero-walk', true);
      if (Math.abs(push.x) > 0.1) this.hero.setFlipX(push.x < 0);
      this.hero.setAngle(Math.sin(this.time.now / 70) * 6); // A happy waddle.
    } else {
      this.hero.stop();
      this.hero.setTexture('hero-1').setAngle(0);
    }

    const feetY = this.hero.y + 64;
    this.hero.setDepth(feetY);
    this.shadow.setPosition(this.hero.x, feetY + 20).setDepth(feetY - 1);

    // Leave a trail of breadcrumbs for the followers.
    const last = this.trail[this.trail.length - 1];
    if (Math.hypot(this.hero.x - last.x, this.hero.y - last.y) >= TRAIL_STEP) {
      this.trail.push({ x: this.hero.x, y: this.hero.y });
      const longestNeeded = (MOST_BABIES + 2) * TRAIL_GAP;
      if (this.trail.length > longestNeeded) this.trail.shift();
    }
  }

  /** Each follower heads for a spot further back along the hero's trail. */
  private moveFollowers(delta: number): void {
    const catchUp = Math.min(1, (delta / 1000) * 10);
    this.followers.forEach(({ image }, index) => {
      const spot = this.trail[Math.max(0, this.trail.length - 1 - (index + 1) * TRAIL_GAP)];
      image.x += (spot.x - image.x) * catchUp;
      image.y += (spot.y + 40 - image.y) * catchUp;
      image.setDepth(image.y + 50);
      image.setAngle(Math.sin(this.time.now / 90 + index) * 8);
    });
  }

  private isNearHero(point: Point, reach: number): boolean {
    return Math.hypot(this.hero.x - point.x, this.hero.y - point.y) < reach;
  }

  private collectStars(): void {
    this.stars = this.stars.filter((star) => {
      if (!this.isNearHero(star, REACH)) return true;
      this.tweens.killTweensOf(star);
      burstStars(this, star.x, star.y, 5);
      star.destroy();
      sfx.star();
      this.starCount++;
      this.starLabel.setText(String(this.starCount));
      return false;
    });
  }

  private findBabies(): void {
    this.lostBabies = this.lostBabies.filter((baby) => {
      if (!this.isNearHero(baby.image, REACH + 20)) return true;
      this.tweens.killTweensOf(baby.image);
      burstStars(this, baby.image.x, baby.image.y, 8);
      sfx.chirp();
      this.followers.push(baby);
      return false;
    });
  }

  /** Bring followers to the door, and they run inside. */
  private checkHome(): void {
    if (this.followers.length === 0) return;
    if (!this.isNearHero(this.world.start, HOME_REACH)) return;

    const arriving = this.followers;
    this.followers = [];
    arriving.forEach((baby, index) => {
      this.tweens.add({
        targets: baby.image,
        x: this.world.home.x,
        y: this.world.home.y + 60,
        displayWidth: 40,
        displayHeight: 40,
        delay: index * 180,
        duration: 320,
        ease: 'Back.easeIn',
        onComplete: () => {
          baby.image.destroy();
          this.babyArrivedHome(baby);
        },
      });
    });
  }

  private babyArrivedHome(baby: Baby): void {
    sfx.pop(this.homeCount);
    const slot = this.babySlots.find((candidate) => candidate.texture.key === baby.texture && candidate.alpha < 1);
    slot?.clearTint().setAlpha(1);
    this.homeCount++;
    burstStars(this, this.world.home.x, this.world.home.y, 10);
    if (this.homeCount === this.babySlots.length) this.winRound();
  }

  /** Everyone's home! Have a party, then start a new adventure with one more baby. */
  private winRound(): void {
    sfx.party();
    for (let i = 0; i < 10; i++) {
      this.time.delayedCall(i * 170, () => {
        burstStars(this, this.hero.x + Phaser.Math.Between(-420, 420), this.hero.y + Phaser.Math.Between(-700, 500), 14);
      });
    }
    this.time.delayedCall(2800, () => this.scene.restart({ round: this.round + 1 }));
  }

  /** Stops anyone getting lost: the arrow always points at what to do next. */
  private pointArrow(): void {
    const target = this.nextGoal();
    const near = !target || this.isNearHero(target, 340);
    this.arrow.setVisible(!near);
    if (near) return;

    const angle = Phaser.Math.Angle.Between(this.hero.x, this.hero.y, target.x, target.y);
    this.arrow.setRotation(angle);
    this.arrow.setPosition(this.hero.x + Math.cos(angle) * 170, this.hero.y + Math.sin(angle) * 170);
  }

  private nextGoal(): Point | null {
    if (this.lostBabies.length === 0) return this.followers.length > 0 ? this.world.start : null;
    const closest = [...this.lostBabies].sort(
      (a, b) =>
        Phaser.Math.Distance.BetweenPoints(this.hero, a.image) - Phaser.Math.Distance.BetweenPoints(this.hero, b.image),
    )[0];
    return closest.image;
  }

  /** Bumping into things is funny, not bad: the tree wobbles and goes boing. */
  private onBump(blocker: Phaser.GameObjects.Arc): void {
    if (this.time.now - this.lastThudAt < 400) return;
    this.lastThudAt = this.time.now;
    sfx.thud();
    const art = blocker.getData('art') as Phaser.GameObjects.Image;
    if (art.texture.key === 'quest-pond' || art.texture.key === 'quest-house') return;
    this.tweens.add({ targets: art, angle: { from: -4, to: 4 }, duration: 70, yoyo: true, repeat: 2, onComplete: () => art.setAngle(0) });
  }
}
