import Phaser from 'phaser';
import { MONSTERS } from '../../shared/assets';
import { FONT, GAME_HEIGHT, GAME_WIDTH, HUD_DEPTH, INK } from '../../shared/constants';
import { sfx } from '../../shared/sfx';
import { burstStars } from '../../shared/ui';
import type { HideSeekScene, Mode } from './HideSeekScene';
import {
  closestHiddenFriend,
  fillSpots,
  friendsForRound,
  hidePoint,
  hintFor,
  rustleEvery,
  spotsToSearch,
  type Point,
  type Surprise,
} from './rules';

const FRIEND_SIZE = 130;
const FOLLOW_GAP = 130;
const COUNT_STEP_MS = 800;
const RUN_OFF_MS = 1800;

interface Friend {
  image: Phaser.GameObjects.Image;
  slot: Phaser.GameObjects.Image;
  spotIndex: number;
}

/**
 * The kid seeks. The friends run off while everyone counts, and each spot the
 * hero reaches gets looked behind automatically, so there's nothing to tap.
 */
export class SeekMode implements Mode {
  private readonly surprises: Surprise[];
  private readonly searched = new Set<number>();
  private readonly friends: Friend[];
  private readonly followers: Friend[] = [];

  private searching = false;
  private msSinceLastFind = 0;
  private msSinceRustle = 0;
  private foundCount = 0;

  constructor(private readonly scene: HideSeekScene, private readonly round: number) {
    const { spots, start } = scene.field;
    const friendCount = friendsForRound(round);
    this.surprises = fillSpots(spots.length, friendCount);

    const friendSpots = spots.map((_, index) => index).filter((index) => this.surprises[index] === 'friend');
    this.friends = friendSpots.map((spotIndex, index) => {
      const texture = MONSTERS[index % MONSTERS.length];
      const angle = (index / friendCount) * Math.PI * 2;
      const image = scene.add
        .image(start.x + Math.cos(angle) * 220, start.y + Math.sin(angle) * 220, texture)
        .setDisplaySize(FRIEND_SIZE, FRIEND_SIZE)
        .setDepth(HUD_DEPTH - 3); // In front of the curtain while they run off.
      const slot = scene.add
        .image(240 + index * 104, 100, texture)
        .setDisplaySize(92, 92)
        .setScrollFactor(0)
        .setDepth(HUD_DEPTH)
        .setTint(0x444444)
        .setAlpha(0.55);
      return { image, slot, spotIndex };
    });

    this.countThenPlay();
  }

  // ---------------------------------------------------------------- Counting to three

  private countThenPlay(): void {
    const { scene } = this;
    const curtain = scene.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x2b2140, 0.45)
      .setScrollFactor(0)
      .setDepth(HUD_DEPTH - 4);
    const label = scene.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT * 0.3, '1', {
        fontFamily: FONT,
        fontSize: '240px',
        color: '#ffffff',
        stroke: INK,
        strokeThickness: 18,
        align: 'center',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(HUD_DEPTH);
    sfx.pop(0);

    // Friends scatter in every direction, which is a fair peek at where they went.
    for (const { image, spotIndex } of this.friends) {
      const hide = hidePoint(scene.field.spots[spotIndex]);
      scene.tweens.add({
        targets: image,
        x: hide.x,
        y: hide.y,
        duration: RUN_OFF_MS,
        ease: 'Sine.easeIn',
        onComplete: () => image.setVisible(false).setDepth(hide.y),
      });
    }

    scene.time.delayedCall(COUNT_STEP_MS, () => {
      label.setText('2');
      sfx.pop(2);
    });
    scene.time.delayedCall(COUNT_STEP_MS * 2, () => {
      label.setText('3');
      sfx.pop(4);
    });
    scene.time.delayedCall(COUNT_STEP_MS * 3, () => {
      curtain.destroy();
      label.setText('Ready\nor not!').setFontSize(150);
      sfx.chirp();
      this.searching = true;
      scene.tweens.add({
        targets: label,
        alpha: 0,
        delay: 500,
        duration: 400,
        onComplete: () => label.destroy(),
      });
    });
  }

  // ---------------------------------------------------------------- The game loop

  update(delta: number): void {
    const { scene } = this;
    const hero = scene.walker.sprite;

    scene.walker.walk(this.searching ? scene.joystick.read() : Phaser.Math.Vector2.ZERO);
    this.moveFollowers(delta);

    if (!this.searching) {
      scene.arrow.point(hero, null);
      return;
    }

    for (const spotIndex of spotsToSearch(hero, scene.field.spots, this.searched)) {
      this.lookBehind(spotIndex);
    }
    this.giveHints(delta);
  }

  /** Each found friend chases the one in front, so they form a wobbly line. */
  private moveFollowers(delta: number): void {
    const catchUp = Math.min(1, (delta / 1000) * 6);
    let leader: Point = this.scene.walker.sprite;
    this.followers.forEach(({ image }, index) => {
      const away = Math.hypot(leader.x - image.x, leader.y - image.y);
      if (away > FOLLOW_GAP) {
        const pull = ((away - FOLLOW_GAP) / away) * catchUp;
        image.x += (leader.x - image.x) * pull;
        image.y += (leader.y - image.y) * pull;
      }
      image.setDepth(image.y + 50);
      image.setAngle(Math.sin(this.scene.time.now / 90 + index) * 8);
      leader = image;
    });
  }

  // ---------------------------------------------------------------- Looking behind things

  private lookBehind(spotIndex: number): void {
    const { scene } = this;
    this.searched.add(spotIndex);
    scene.wiggle(spotIndex, 5);
    // Slightly greyed out, so a kid can see which ones are done.
    scene.spotArt[spotIndex].setTint(0xd8d8d8);

    const surprise = this.surprises[spotIndex];
    if (surprise === 'friend') this.foundFriend(spotIndex);
    else if (surprise === 'star') this.foundStar(spotIndex);
    else this.foundButterfly(spotIndex);
  }

  private foundFriend(spotIndex: number): void {
    const { scene } = this;
    const friend = this.friends.find((candidate) => candidate.spotIndex === spotIndex)!;
    const { image } = friend;

    scene.tweens.killTweensOf(image);
    const hide = hidePoint(scene.field.spots[spotIndex]);
    image.setVisible(true).setPosition(hide.x, hide.y).setDepth(hide.y + 400);

    burstStars(scene, hide.x, hide.y, 10);
    scene.bubble(hide.x, hide.y - 140, 'Found!');
    sfx.chirp();
    friend.slot.clearTint().setAlpha(1);
    this.msSinceLastFind = 0;
    this.foundCount++;

    // A big happy jump, then it joins the line behind the hero.
    scene.tweens.add({
      targets: image,
      y: hide.y - 160,
      duration: 240,
      yoyo: true,
      ease: 'Sine.easeOut',
      onComplete: () => this.followers.push(friend),
    });

    if (this.foundCount === this.friends.length) {
      this.searching = false;
      scene.arrow.point(scene.walker.sprite, null);
      scene.time.delayedCall(700, () => scene.endRound(this.round + 1));
    }
  }

  private foundStar(spotIndex: number): void {
    const { scene } = this;
    const hide = hidePoint(scene.field.spots[spotIndex]);
    const star = scene.add.image(hide.x, hide.y, 'icon-star').setDepth(HUD_DEPTH - 2).setScale(1.4);
    sfx.star();
    scene.addStars(1);
    scene.tweens.add({
      targets: star,
      y: hide.y - 200,
      duration: 420,
      ease: 'Back.easeOut',
      onComplete: () => {
        burstStars(scene, star.x, star.y, 5);
        star.destroy();
      },
    });
  }

  private foundButterfly(spotIndex: number): void {
    const { scene } = this;
    const hide = hidePoint(scene.field.spots[spotIndex]);
    const butterfly = scene.add.image(hide.x, hide.y, 'hideseek-butterfly').setDepth(HUD_DEPTH - 2);
    sfx.boing();
    scene.tweens.add({ targets: butterfly, scaleX: 0.3, duration: 90, yoyo: true, repeat: -1 });
    scene.tweens.add({
      targets: butterfly,
      x: hide.x + Phaser.Math.Between(-320, 320),
      y: hide.y - 700,
      alpha: { from: 1, to: 0, ease: 'Expo.easeIn' },
      duration: 1500,
      ease: 'Sine.easeIn',
      onComplete: () => {
        scene.tweens.killTweensOf(butterfly);
        butterfly.destroy();
      },
    });
  }

  // ---------------------------------------------------------------- Hints

  /** Nearest hiding friend rustles its spot. Later it peeks out, and later still the arrow helps. */
  private giveHints(delta: number): void {
    const { scene } = this;
    const hero = scene.walker.sprite;
    const { spots } = scene.field;

    this.msSinceLastFind += delta;
    this.msSinceRustle += delta;

    const closest = closestHiddenFriend(hero, spots, this.surprises, this.searched);
    if (closest === null) {
      scene.arrow.point(hero, null);
      return;
    }

    const hide = hidePoint(spots[closest]);
    const hint = hintFor(this.msSinceLastFind);
    scene.arrow.point(hero, hint === 'arrow' ? hide : null);

    const away = Math.hypot(hero.x - hide.x, hero.y - hide.y);
    if (this.msSinceRustle < rustleEvery(away)) return;
    this.msSinceRustle = 0;

    scene.wiggle(closest, 3);
    if (away < 1000) sfx.rustle();
    if (hint !== 'rustle') this.peek(closest);
  }

  /** The friend pops out for a moment. Trees are tall, so there it leans out sideways. */
  private peek(spotIndex: number): void {
    const { scene } = this;
    const { image } = this.friends.find((friend) => friend.spotIndex === spotIndex)!;
    const spot = scene.field.spots[spotIndex];
    const hide = hidePoint(spot);
    const to = spot.kind === 'tree' ? { x: hide.x + 130, y: hide.y } : { x: hide.x, y: hide.y - 110 };

    scene.tweens.killTweensOf(image);
    image.setVisible(true).setPosition(hide.x, hide.y);
    scene.tweens.add({
      targets: image,
      ...to,
      duration: 220,
      hold: 500,
      yoyo: true,
      ease: 'Sine.easeOut',
      onComplete: () => image.setVisible(false),
    });
  }
}
