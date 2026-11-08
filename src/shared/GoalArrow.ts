import Phaser from 'phaser';
import { HUD_DEPTH } from './constants';

interface Point {
  x: number;
  y: number;
}

/** An arrow by the hero that points at what to do next, so nobody gets lost. */
export class GoalArrow {
  private readonly image: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene) {
    this.image = scene.add.image(0, 0, 'scenery-arrow').setDepth(HUD_DEPTH - 1);
    scene.tweens.add({ targets: this.image, scale: 1.2, duration: 380, yoyo: true, repeat: -1 });
  }

  destroy(): void {
    this.image.destroy();
  }

  /** Call once a frame. It hides when there's no goal, or the goal is close by. */
  point(from: Point, target: Point | null, hideWithin = 340): void {
    const near = !target || Math.hypot(from.x - target.x, from.y - target.y) < hideWithin;
    this.image.setVisible(!near);
    if (near) return;

    const angle = Phaser.Math.Angle.Between(from.x, from.y, target.x, target.y);
    this.image.setRotation(angle);
    this.image.setPosition(from.x + Math.cos(angle) * 170, from.y + Math.sin(angle) * 170);
  }
}
