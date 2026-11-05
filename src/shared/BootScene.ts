import Phaser from 'phaser';
import { loadSharedAssets } from './assets';
import { applyAvatar, loadAvatar } from './avatar-textures';

/** Runs once at launch: load the shared images, then show the game picker. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  preload(): void {
    loadSharedAssets(this);
  }

  async create(): Promise<void> {
    await applyAvatar(this.game, loadAvatar());
    this.scene.start('menu');
  }
}
