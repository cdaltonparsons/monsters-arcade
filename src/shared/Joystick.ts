import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, HUD_DEPTH } from './constants';

const REACH = 130; // How far to drag for full speed.

/**
 * Phones and tablets show the resting joystick as a reminder. On a laptop the
 * keyboard does the steering, so the joystick only shows while the mouse drags it.
 */
export const HAS_TOUCH = navigator.maxTouchPoints > 0;

export interface JoystickOptions {
  /** Only listen to fingers on this half of the screen. Leave out for the whole screen. */
  side?: 'left' | 'right';
  /** Keyboard keys, for testing on a computer. Leave out for both arrows and WASD. */
  keys?: 'arrows' | 'wasd';
  /** The colour of the knob, to match that player's monster ring. */
  color?: number;
}

interface Keys {
  up: Phaser.Input.Keyboard.Key;
  down: Phaser.Input.Keyboard.Key;
  left: Phaser.Input.Keyboard.Key;
  right: Phaser.Input.Keyboard.Key;
}

/**
 * A joystick that appears wherever a finger lands, so small hands can't miss it.
 * On touch screens it rests faintly at the bottom to show that it's there.
 *
 * Each joystick remembers which finger is steering it (`pointer.id`), so with two
 * players, two joysticks can be dragged at the same time on one screen.
 */
export class Joystick {
  /** The way the player is pushing: x and y from -1 to 1. */
  push = new Phaser.Math.Vector2();

  private readonly base: Phaser.GameObjects.Arc;
  private readonly knob: Phaser.GameObjects.Arc;
  private readonly keySets: Keys[] = [];
  private finger: number | null = null;
  private readonly unlisten: () => void;

  constructor(scene: Phaser.Scene, private readonly options: JoystickOptions = {}) {
    // setScrollFactor(0) pins something to the screen instead of the world.
    this.base = scene.add.circle(0, 0, REACH + 40, 0xffffff, 0.3).setScrollFactor(0).setDepth(HUD_DEPTH);
    this.knob = scene.add.circle(0, 0, 80, options.color ?? 0xffffff, 0.85).setScrollFactor(0).setDepth(HUD_DEPTH);
    if (options.color !== undefined) this.base.setStrokeStyle(10, options.color, 0.8);
    this.rest();

    const keyboard = scene.input.keyboard;
    if (keyboard && options.keys !== 'wasd') this.keySets.push(keyboard.createCursorKeys());
    if (keyboard && options.keys !== 'arrows') {
      this.keySets.push(keyboard.addKeys({ up: 'W', down: 'S', left: 'A', right: 'D' }) as Keys);
    }

    const down = (pointer: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (over.length > 0) return; // That tap was on a button.
      if (this.finger !== null || !this.isMySide(pointer)) return;
      this.finger = pointer.id;
      this.base.setPosition(pointer.x, pointer.y).setAlpha(1);
      this.knob.setPosition(pointer.x, pointer.y).setAlpha(1);
    };
    const move = (pointer: Phaser.Input.Pointer) => {
      if (pointer.id === this.finger) this.drag(pointer);
    };
    const up = (pointer: Phaser.Input.Pointer) => {
      if (pointer.id === this.finger) this.rest();
    };
    scene.input.on('pointerdown', down);
    scene.input.on('pointermove', move);
    scene.input.on('pointerup', up);
    scene.input.on('pointerupoutside', up);
    this.unlisten = () => {
      scene.input.off('pointerdown', down);
      scene.input.off('pointermove', move);
      scene.input.off('pointerup', up);
      scene.input.off('pointerupoutside', up);
    };
  }

  /** Which way to go right now, from the finger or the keyboard. */
  read(): Phaser.Math.Vector2 {
    for (const keys of this.keySets) {
      const x = Number(keys.right.isDown) - Number(keys.left.isDown);
      const y = Number(keys.down.isDown) - Number(keys.up.isDown);
      if (x !== 0 || y !== 0) return new Phaser.Math.Vector2(x, y).normalize();
    }
    return this.push;
  }

  destroy(): void {
    this.unlisten();
    this.keySets.length = 0;
    this.base.destroy();
    this.knob.destroy();
  }

  private isMySide(pointer: Phaser.Input.Pointer): boolean {
    if (!this.options.side) return true;
    return this.options.side === 'left' ? pointer.x < GAME_WIDTH / 2 : pointer.x >= GAME_WIDTH / 2;
  }

  private drag(pointer: Phaser.Input.Pointer): void {
    const drag = new Phaser.Math.Vector2(pointer.x - this.base.x, pointer.y - this.base.y);
    const strength = Math.min(drag.length() / REACH, 1);
    this.push = drag.normalize().scale(strength);
    this.knob.setPosition(this.base.x + this.push.x * REACH, this.base.y + this.push.y * REACH);
  }

  private rest(): void {
    this.finger = null;
    this.push = new Phaser.Math.Vector2();
    const x = { left: GAME_WIDTH * 0.27, right: GAME_WIDTH * 0.73, whole: GAME_WIDTH / 2 }[this.options.side ?? 'whole'];
    const y = GAME_HEIGHT - 260;
    const alpha = HAS_TOUCH ? 0.5 : 0;
    this.base.setPosition(x, y).setAlpha(alpha);
    this.knob.setPosition(x, y).setAlpha(alpha);
  }
}
