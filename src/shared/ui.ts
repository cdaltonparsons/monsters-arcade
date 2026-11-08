import Phaser from 'phaser';
import { HUD_DEPTH } from './constants';
import { sfx } from './sfx';

/** Round button in the top corner that goes back to the game picker. */
export function addHomeButton(scene: Phaser.Scene, beforeLeaving?: () => Promise<void>): Phaser.GameObjects.Image {
  const button = scene.add.image(100, 100, 'icon-home').setDisplaySize(130, 130).setInteractive();
  button.on('pointerup', async () => {
    sfx.tap();
    await beforeLeaving?.();
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
  emitter.setDepth(HUD_DEPTH - 2); // Above the world, whose depth is its y position.
  emitter.explode(count);
  scene.time.delayedCall(800, () => emitter.destroy());
}

const TWO_PLAYERS_KEY = 'two-players';

/** Whether a second child is playing too. Remembered between games. */
export function loadTwoPlayers(): boolean {
  return localStorage.getItem(TWO_PLAYERS_KEY) === 'yes';
}

/**
 * A round button under the home button, showing both monsters. Tap it to bring
 * player 2's monster in, and again to send it home. Player 2's monster looks
 * faded while it's away.
 */
export function addPlayersButton(scene: Phaser.Scene, onToggle: (twoPlayers: boolean) => void): void {
  let twoPlayers = loadTwoPlayers();
  const x = 100;
  const y = 260;
  const button = scene.add.circle(x, y, 68, 0xffffff, 0.9).setStrokeStyle(8, 0x4a3470).setInteractive();
  const hero = scene.add.image(x - 22, y + 4, 'hero-1').setDisplaySize(78, 78);
  const buddy = scene.add.image(x + 26, y + 10, 'buddy-1').setDisplaySize(70, 70);
  const show = () => buddy.setAlpha(twoPlayers ? 1 : 0.3);
  show();
  for (const part of [button, hero, buddy]) part.setScrollFactor(0).setDepth(HUD_DEPTH);

  button.on('pointerup', () => {
    sfx.tap();
    twoPlayers = !twoPlayers;
    localStorage.setItem(TWO_PLAYERS_KEY, twoPlayers ? 'yes' : 'no');
    show();
    onToggle(twoPlayers);
  });
}
