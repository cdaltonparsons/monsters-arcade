import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, HUD_DEPTH } from './constants';

const REACH = 130; // How far to drag for full speed.

/**
 * A joystick that appears wherever a finger lands, so small hands can't miss it.
 * It rests faintly at the bottom of the screen to show that it's there.
 */
export class Joystick {
  /** The way the player is pushing: x and y from -1 to 1. */
  push = new Phaser.Math.Vector2();

  private readonly base: Phaser.GameObjects.Arc;
  private readonly knob: Phaser.GameObjects.Arc;
  private readonly keys?: Phaser.Types.Input.Keyboard.CursorKeys;

  constructor(scene: Phaser.Scene) {
    // setScrollFactor(0) pins something to the screen instead of the world.
    this.base = scene.add.circle(0, 0, REACH + 40, 0xffffff, 0.3).setScrollFactor(0).setDepth(HUD_DEPTH);
    this.knob = scene.add.circle(0, 0, 80, 0xffffff, 0.85).setScrollFactor(0).setDepth(HUD_DEPTH);
    this.rest();

    this.keys = scene.input.keyboard?.createCursorKeys(); // Arrow keys, for testing on a computer.

    scene.input.on('pointerdown', (pointer: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (over.length > 0) return; // That tap was on a button.
      this.base.setPosition(pointer.x, pointer.y).setAlpha(1);
      this.knob.setPosition(pointer.x, pointer.y).setAlpha(1);
    });
    scene.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (pointer.isDown) this.drag(pointer);
    });
    scene.input.on('pointerup', () => this.rest());
    scene.input.on('pointerupoutside', () => this.rest());
  }

  /** Which way to go right now, from the finger or the arrow keys. */
  read(): Phaser.Math.Vector2 {
    if (!this.keys) return this.push;
    const x = Number(this.keys.right.isDown) - Number(this.keys.left.isDown);
    const y = Number(this.keys.down.isDown) - Number(this.keys.up.isDown);
    return x === 0 && y === 0 ? this.push : new Phaser.Math.Vector2(x, y).normalize();
  }

  private drag(pointer: Phaser.Input.Pointer): void {
    const drag = new Phaser.Math.Vector2(pointer.x - this.base.x, pointer.y - this.base.y);
    const strength = Math.min(drag.length() / REACH, 1);
    this.push = drag.normalize().scale(strength);
    this.knob.setPosition(this.base.x + this.push.x * REACH, this.base.y + this.push.y * REACH);
  }

  private rest(): void {
    this.push = new Phaser.Math.Vector2();
    const x = GAME_WIDTH / 2;
    const y = GAME_HEIGHT - 260;
    this.base.setPosition(x, y).setAlpha(0.5);
    this.knob.setPosition(x, y).setAlpha(0.5);
  }
}
