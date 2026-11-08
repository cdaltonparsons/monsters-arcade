import Phaser from 'phaser';
import { MONSTERS } from '../../shared/assets';
import { FONT, GAME_HEIGHT, GAME_WIDTH, HUD_DEPTH } from '../../shared/constants';
import { closestWithin, IDLE_BEFORE_FOLLOW, leash, trotAfter } from '../../shared/coop';
import { GoalArrow } from '../../shared/GoalArrow';
import { drawGrass } from '../../shared/ground';
import { Hero } from '../../shared/Hero';
import { Joystick } from '../../shared/Joystick';
import { sfx } from '../../shared/sfx';
import { addHomeButton, addPlayersButton, burstStars, loadTwoPlayers } from '../../shared/ui';
import houseArt from './art/house.svg?url';
import pondArt from './art/pond.svg?url';
import rockArt from './art/rock.svg?url';
import {
  generateWorld,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  type Obstacle,
  type ObstacleKind,
  type Point,
  type World,
} from './world';

// Tweak these to change how the game feels.
const FIRST_ROUND_BABIES = 3;
const MOST_BABIES = 8;
const STAR_COUNT = 25;
const REACH = 130; // How close the hero must get to pick something up.
const HOME_REACH = 330;
const TRAIL_STEP = 12; // Remember the hero's position every this many pixels...
const TRAIL_GAP = 11; // ...and leave this many remembered positions between followers.

// With two players, both monsters must fit on screen, clear of the buttons and joysticks.
const LEASH = { maxDx: GAME_WIDTH - 260, maxDy: GAME_HEIGHT - 760 };
const P1_RING = 0xff9130;
const P2_RING = 0x26bfb5;

/**
 * Where the picture sits relative to its solid circle. `originY` lines the
 * circle up with the bottom of the art, so you can walk behind the treetops.
 */
const ART: Record<ObstacleKind, { key: string; size: [number, number]; originY: number }> = {
  tree: { key: 'scenery-tree', size: [280, 400], originY: 0.9 },
  rock: { key: 'quest-rock', size: [260, 200], originY: 0.7 },
  pond: { key: 'quest-pond', size: [440, 440], originY: 0.5 },
  house: { key: 'quest-house', size: [440, 440], originY: 0.75 },
};

interface Baby {
  image: Phaser.GameObjects.Image;
  texture: string;
}

/**
 * Everything one child steers. With two players there are two of these, and each
 * has its own babies trailing behind, its own arrow and its own joystick.
 */
interface Player {
  walker: Hero;
  hero: Phaser.Physics.Arcade.Sprite;
  joystick: Joystick;
  arrow: GoalArrow;
  trail: Point[];
  followers: Baby[];
  lastSteeredAt: number;
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
  private players!: Player[];
  private blockers!: Phaser.Physics.Arcade.StaticGroup;
  /** An invisible spot halfway between the players, for the camera to follow. */
  private middle!: Phaser.GameObjects.Zone;

  private lostBabies!: Baby[];
  private homeCount!: number;
  private babySlots!: Phaser.GameObjects.Image[];

  private stars!: Phaser.GameObjects.Image[];
  private starCount!: number;
  private starLabel!: Phaser.GameObjects.Text;

  private lastThudAt!: number;

  constructor() {
    // Arcade is Phaser's simple physics: speeds and overlapping shapes.
    super({ key: QuestScene.KEY, physics: { arcade: {} } });
  }

  preload(): void {
    this.load.svg('quest-rock', rockArt, { width: 260, height: 200 });
    this.load.svg('quest-pond', pondArt, { width: 440, height: 440 });
    this.load.svg('quest-house', houseArt, { width: 440, height: 440 });
  }

  create(data: { round?: number }): void {
    this.round = data.round ?? 1;
    this.players = [];
    this.homeCount = 0;
    this.starCount = 0;
    this.lastThudAt = 0;

    const babyCount = Math.min(FIRST_ROUND_BABIES + this.round - 1, MOST_BABIES);
    this.world = generateWorld(babyCount, STAR_COUNT);

    drawGrass(this, WORLD_WIDTH, WORLD_HEIGHT);
    this.blockers = this.addObstacles();
    this.addPickups();
    this.middle = this.add.zone(this.world.start.x, this.world.start.y, 1, 1);
    // The small numbers make the camera glide along a little behind the heroes.
    this.cameras.main.startFollow(this.middle, true, 0.12, 0.12);
    this.addHud(babyCount);
    this.addPlayer(this.world.start);
    if (loadTwoPlayers()) this.setTwoPlayers(true);
  }

  // ---------------------------------------------------------------- One or two players

  private addPlayer(at: Point): void {
    const second = this.players.length === 1;
    const walker = new Hero(this, at.x, at.y, second ? 'buddy' : 'hero', second ? P2_RING : undefined);
    const hero = walker.sprite;
    // When a hero bumps into something solid, call onBump.
    this.physics.add.collider(hero, this.blockers, (_hero, blocker) => {
      this.onBump(blocker as Phaser.GameObjects.Arc);
    });
    this.players.push({
      walker,
      hero,
      joystick: new Joystick(this),
      arrow: new GoalArrow(this),
      trail: [{ x: at.x, y: at.y }],
      followers: [],
      lastSteeredAt: 0,
    });
  }

  /**
   * With two players, the screen splits down the middle: the left half steers the
   * first monster (or WASD), the right half steers player 2's (or the arrow keys).
   */
  private setTwoPlayers(on: boolean): void {
    const [first, second] = this.players;
    first.joystick.destroy();
    if (on && !second) {
      this.addPlayer({ x: Math.min(first.hero.x + 160, WORLD_WIDTH - 100), y: first.hero.y });
      const buddy = this.players[1];
      buddy.joystick.destroy();
      buddy.joystick = new Joystick(this, { side: 'right', keys: 'arrows', color: P2_RING });
      first.joystick = new Joystick(this, { side: 'left', keys: 'wasd', color: P1_RING });
      first.walker.setRing(P1_RING);
      burstStars(this, buddy.hero.x, buddy.hero.y, 10);
      sfx.chirp();
      return;
    }
    if (!on && second) {
      // Player 2 goes off for a nap, and any babies following them follow player 1.
      first.followers.push(...second.followers);
      burstStars(this, second.hero.x, second.hero.y, 6);
      second.walker.destroy();
      second.joystick.destroy();
      second.arrow.destroy();
      this.players.pop();
    }
    first.walker.setRing();
    first.joystick = new Joystick(this);
  }

  // ---------------------------------------------------------------- Building the world

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
  }

  /** setScrollFactor(0) pins something to the screen instead of the world. */
  private addHud(babyCount: number): void {
    addHomeButton(this).setScrollFactor(0).setDepth(HUD_DEPTH);
    addPlayersButton(this, (twoPlayers) => this.setTwoPlayers(twoPlayers));

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

  // ---------------------------------------------------------------- The game loop

  /** Runs about 60 times a second. `delta` is the milliseconds since the last run. */
  update(_time: number, delta: number): void {
    this.players.forEach((player) => this.moveHero(player));
    this.followTheMiddle();
    this.players.forEach((player) => this.moveFollowers(player, delta));
    this.collectStars();
    this.findBabies();
    this.players.forEach((player) => this.checkHome(player));
    this.players.forEach((player) => player.arrow.point(player.hero, this.nextGoal(player)));
  }

  private moveHero(player: Player): void {
    const { hero, trail } = player;
    let push = player.joystick.read();
    const friend = this.players.find((other) => other !== player);
    if (push.lengthSq() > 0.01) player.lastSteeredAt = this.time.now;

    if (friend) {
      // Player 2's monster trots back to player 1 when nobody is steering it.
      const resting = this.time.now - player.lastSteeredAt > IDLE_BEFORE_FOLLOW;
      if (player === this.players[1] && resting) {
        const trot = trotAfter(hero, friend.hero);
        push = new Phaser.Math.Vector2(trot.x, trot.y);
      }
      // Neither monster may wander off the shared screen.
      const kept = leash(push, hero, friend.hero, LEASH);
      push = new Phaser.Math.Vector2(kept.x, kept.y);
    }
    player.walker.walk(push);

    // Leave a trail of breadcrumbs for the followers.
    const last = trail[trail.length - 1];
    if (Math.hypot(hero.x - last.x, hero.y - last.y) >= TRAIL_STEP) {
      trail.push({ x: hero.x, y: hero.y });
      const longestNeeded = (MOST_BABIES + 2) * TRAIL_GAP;
      if (trail.length > longestNeeded) trail.shift();
    }
  }

  /** The camera watches the spot halfway between the players (or the only player). */
  private followTheMiddle(): void {
    const x = this.players.reduce((sum, { hero }) => sum + hero.x, 0) / this.players.length;
    const y = this.players.reduce((sum, { hero }) => sum + hero.y, 0) / this.players.length;
    this.middle.setPosition(x, y);
  }

  /** Each follower heads for a spot further back along its hero's trail. */
  private moveFollowers({ followers, trail }: Player, delta: number): void {
    const catchUp = Math.min(1, (delta / 1000) * 10);
    followers.forEach(({ image }, index) => {
      const spot = trail[Math.max(0, trail.length - 1 - (index + 1) * TRAIL_GAP)];
      image.x += (spot.x - image.x) * catchUp;
      image.y += (spot.y + 40 - image.y) * catchUp;
      image.setDepth(image.y + 50);
      image.setAngle(Math.sin(this.time.now / 90 + index) * 8);
    });
  }

  /** Which player is close enough to pick this up, or undefined if nobody is. */
  private playerNear(point: Point, reach: number): Player | undefined {
    return this.players[closestWithin(this.players.map(({ hero }) => hero), point, reach)];
  }

  /** Stars go in one shared pile: both children are on the same team. */
  private collectStars(): void {
    this.stars = this.stars.filter((star) => {
      if (!this.playerNear(star, REACH)) return true;
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
      const finder = this.playerNear(baby.image, REACH + 20);
      if (!finder) return true;
      this.tweens.killTweensOf(baby.image);
      burstStars(this, baby.image.x, baby.image.y, 8);
      sfx.chirp();
      finder.followers.push(baby);
      return false;
    });
  }

  /** Bring followers to the door, and they run inside. */
  private checkHome(player: Player): void {
    if (player.followers.length === 0) return;
    if (Math.hypot(player.hero.x - this.world.start.x, player.hero.y - this.world.start.y) >= HOME_REACH) return;

    const arriving = player.followers;
    player.followers = [];
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
        burstStars(this, this.middle.x + Phaser.Math.Between(-420, 420), this.middle.y + Phaser.Math.Between(-700, 500), 14);
      });
    }
    this.time.delayedCall(2800, () => this.scene.restart({ round: this.round + 1 }));
  }

  /** What a player's arrow points at: home if babies are following, else the closest lost baby. */
  private nextGoal({ hero, followers }: Player): Point | null {
    if (this.lostBabies.length === 0 || (followers.length > 0 && this.players.length > 1)) {
      return followers.length > 0 ? this.world.start : null;
    }
    const closest = [...this.lostBabies].sort(
      (a, b) => Phaser.Math.Distance.BetweenPoints(hero, a.image) - Phaser.Math.Distance.BetweenPoints(hero, b.image),
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
