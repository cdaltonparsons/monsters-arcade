import Phaser from 'phaser';
import { FONT, GAME_HEIGHT, GAME_WIDTH, HUD_DEPTH, INK } from './constants';
import { IDLE_BEFORE_FOLLOW, leash, trotAfter, type Leash, type Point } from './coop';
import { GoalArrow } from './GoalArrow';
import { Hero } from './Hero';
import { HAS_TOUCH, Joystick } from './Joystick';
import { sfx } from './sfx';
import { addPlayersButton, burstStars, loadTwoPlayers } from './ui';

// Both monsters must fit on screen, clear of the buttons and joysticks.
const LEASH: Leash = { maxDx: GAME_WIDTH - 260, maxDy: GAME_HEIGHT - 760 };
const P1_RING = 0xff9130;
const P2_RING = 0x26bfb5;

/** Everything one child steers. `data` is whatever else the game keeps per player. */
export interface TeamPlayer<T> {
  walker: Hero;
  hero: Phaser.Physics.Arcade.Sprite;
  joystick: Joystick;
  arrow: GoalArrow;
  lastSteeredAt: number;
  data: T;
}

export interface TeamHooks<T> {
  /** Fresh per-player data, such as an empty list of followers. `at` is where they start. */
  makeData: (at: Point) => T;
  /** A player arrived. Add their collisions here. */
  onJoin?: (player: TeamPlayer<T>) => void;
  /** Player 2 is leaving. Hand anything they carry over to `stayer`. */
  onLeave?: (leaving: TeamPlayer<T>, stayer: TeamPlayer<T>) => void;
}

/**
 * One or two monsters sharing one screen, for any walking game. It owns the
 * heroes, their joysticks and arrows, and a spot halfway between them for the
 * camera to follow. Games still decide when each hero walks: they ask `push()`
 * which way to go, then call `walker.walk()`.
 *
 * With two players, the screen splits down the middle: the left half steers the
 * first monster (or WASD), the right half steers player 2's (or the arrow keys).
 */
export class Team<T> {
  readonly players: TeamPlayer<T>[] = [];
  /** An invisible spot halfway between the players, for the camera to follow. */
  readonly middle: Phaser.GameObjects.Zone;

  constructor(
    private readonly scene: Phaser.Scene,
    at: Point,
    private readonly hooks: TeamHooks<T>,
  ) {
    this.middle = scene.add.zone(at.x, at.y, 1, 1);
    this.followWithCamera();
    this.join(at);
  }

  get first(): TeamPlayer<T> {
    return this.players[0];
  }

  /** Adds the 1-or-2 button, and brings player 2 in if they were playing last time. */
  addPlayersButton(): void {
    addPlayersButton(this.scene, (on) => this.setTwoPlayers(on));
    if (loadTwoPlayers()) this.setTwoPlayers(true);
  }

  /** The small numbers make the camera glide along a little behind the heroes. */
  followWithCamera(): void {
    this.scene.cameras.main.startFollow(this.middle, true, 0.12, 0.12);
  }

  /**
   * Which way this player should walk: their joystick, kept on the shared screen.
   * If player 2 isn't steering, their monster trots back to player 1, unless
   * `trot` is false (for example, while hiding).
   */
  push(player: TeamPlayer<T>, { trot = true } = {}): Phaser.Math.Vector2 {
    let push = player.joystick.read();
    if (push.lengthSq() > 0.01) player.lastSteeredAt = this.scene.time.now;
    const friend = this.players.find((other) => other !== player);
    if (!friend) return push;

    const resting = this.scene.time.now - player.lastSteeredAt > IDLE_BEFORE_FOLLOW;
    if (trot && player !== this.first && resting) {
      const toFriend = trotAfter(player.hero, friend.hero);
      push = new Phaser.Math.Vector2(toFriend.x, toFriend.y);
    }
    const kept = leash(push, player.hero, friend.hero, LEASH);
    return new Phaser.Math.Vector2(kept.x, kept.y);
  }

  /** Call once a frame, after the heroes have walked, to keep the camera between them. */
  update(): void {
    const x = this.players.reduce((sum, { hero }) => sum + hero.x, 0) / this.players.length;
    const y = this.players.reduce((sum, { hero }) => sum + hero.y, 0) / this.players.length;
    this.middle.setPosition(x, y);
  }

  setTwoPlayers(on: boolean): void {
    const [first, second] = this.players;
    first.joystick.destroy();
    if (on && !second) {
      const buddy = this.join({ x: first.hero.x + 160, y: first.hero.y });
      buddy.joystick.destroy();
      buddy.joystick = new Joystick(this.scene, { side: 'right', keys: 'arrows', color: P2_RING });
      first.joystick = new Joystick(this.scene, { side: 'left', keys: 'wasd', color: P1_RING });
      first.walker.setRing(P1_RING);
      burstStars(this.scene, buddy.hero.x, buddy.hero.y, 10);
      sfx.chirp();
      if (!HAS_TOUCH) {
        this.showKeys(first, 'W A S D');
        this.showKeys(buddy, '↑ ← ↓ →');
      }
      return;
    }
    if (!on && second) {
      // Player 2 goes off for a nap.
      this.hooks.onLeave?.(second, first);
      burstStars(this.scene, second.hero.x, second.hero.y, 6);
      second.walker.destroy();
      second.joystick.destroy();
      second.arrow.destroy();
      this.players.pop();
    }
    first.walker.setRing();
    first.joystick = new Joystick(this.scene);
  }

  /** On a laptop, a label over each monster says which keys steer it, then fades. */
  private showKeys({ hero }: TeamPlayer<T>, keys: string): void {
    const label = this.scene.add
      .text(hero.x, hero.y - 150, keys, { fontFamily: FONT, fontSize: '56px', color: '#ffffff', stroke: INK, strokeThickness: 10 })
      .setOrigin(0.5)
      .setDepth(HUD_DEPTH - 2);
    const follow = () => label.setPosition(hero.x, hero.y - 150);
    this.scene.events.on('update', follow);
    this.scene.tweens.add({
      targets: label,
      alpha: 0,
      delay: 3000,
      duration: 600,
      onComplete: () => {
        this.scene.events.off('update', follow);
        label.destroy();
      },
    });
  }

  private join(at: Point): TeamPlayer<T> {
    const second = this.players.length === 1;
    const walker = new Hero(this.scene, at.x, at.y, second ? 'buddy' : 'hero', second ? P2_RING : undefined);
    const player: TeamPlayer<T> = {
      walker,
      hero: walker.sprite,
      joystick: new Joystick(this.scene),
      arrow: new GoalArrow(this.scene),
      lastSteeredAt: 0,
      data: this.hooks.makeData(at),
    };
    this.players.push(player);
    this.hooks.onJoin?.(player);
    return player;
  }
}
