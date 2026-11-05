import Phaser from 'phaser';
import { sfx } from './sfx';

/** Round button in the top corner that goes back to the game picker. */
export function addHomeButton(scene: Phaser.Scene): Phaser.GameObjects.Image {
  const button = scene.add.image(100, 100, 'icon-home').setDisplaySize(130, 130).setInteractive();
  button.on('pointerup', () => {
    sfx.tap();
    scene.scene.start('menu');
  });
  return button;
}

/** A burst of stars. Used for rewards all over the arcade. */
export function burstStars(scene: Phaser.Scene, x: number, y: number, count = 8): void {
  const emitter = scene.add.particles(x, y, 'icon-star', {
    speed: { min: 200, max: 650 },
    angle: { min: 0, max: 360 },
    scale: { start: 0.9, end: 0.1 },
    rotate: { start: 0, end: 360 },
    lifespan: 650,
    emitting: false,
  });
  emitter.setDepth(20); // Above everything else in the game.
  emitter.explode(count);
  scene.time.delayedCall(800, () => emitter.destroy());
}
