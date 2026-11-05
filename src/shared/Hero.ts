import Phaser from 'phaser';
import { HERO_RADIUS } from './hero-size';

const SPEED = 560; // Pixels per second.

/**
 * The walking monster, used by any game where you walk around. Games reach for
 * `sprite` to add collisions, or to have the camera follow it.
 */
export class Hero {
  readonly sprite: Phaser.Physics.Arcade.Sprite;
  private readonly shadow: Phaser.GameObjects.Ellipse;

  constructor(private readonly scene: Phaser.Scene, x: number, y: number) {
    if (!scene.anims.exists('hero-walk')) {
      // Flip between two pictures, like a two-page flipbook.
      scene.anims.create({
        key: 'hero-walk',
        frames: [{ key: 'hero-1' }, { key: 'hero-2' }],
        frameRate: 9,
        repeat: -1,
      });
    }
    this.shadow = scene.add.ellipse(x, y, 130, 44, 0x000000, 0.16);
    this.sprite = scene.physics.add.sprite(x, y, 'hero-1');
    this.sprite.setCollideWorldBounds(true);
    // The hitbox is around the feet, not the whole picture.
    this.sprite.setCircle(HERO_RADIUS, 90 - HERO_RADIUS, 180 - HERO_RADIUS * 2);
  }

  /** Where the hero's feet are. Use this for "is the hero standing on it?" checks. */
  get feet(): { x: number; y: number } {
    return { x: this.sprite.x, y: this.sprite.y + 35 };
  }

  /** Call once a frame. We only set a speed: physics moves the hero and handles bumps. */
  walk(push: Phaser.Math.Vector2): void {
    const { sprite } = this;
    sprite.setVelocity(push.x * SPEED, push.y * SPEED);

    if (push.lengthSq() > 0.01) {
      sprite.play('hero-walk', true);
      if (Math.abs(push.x) > 0.1) sprite.setFlipX(push.x < 0);
      sprite.setAngle(Math.sin(this.scene.time.now / 70) * 6); // A happy waddle.
    } else {
      sprite.stop();
      sprite.setTexture('hero-1').setAngle(0);
    }

    // Things lower on screen draw on top, so the world looks like it has depth.
    const feetY = sprite.y + 64;
    sprite.setDepth(feetY);
    this.shadow.setPosition(sprite.x, feetY + 20).setDepth(feetY - 1);
  }
}
