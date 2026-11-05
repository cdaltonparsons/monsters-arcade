import Phaser from 'phaser';
import { loadSharedAssets } from './assets';

/** Runs once at launch: load the shared images, then show the game picker. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  preload(): void {
    loadSharedAssets(this);
  }

  create(): void {
    this.scene.start('menu');
  }
}
