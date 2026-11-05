import type Phaser from 'phaser';
import red from './monsters/red.svg?url';
import blue from './monsters/blue.svg?url';
import green from './monsters/green.svg?url';
import yellow from './monsters/yellow.svg?url';
import purple from './monsters/purple.svg?url';
import hero1 from './monsters/hero-1.svg?url';
import hero2 from './monsters/hero-2.svg?url';
import home from './icons/home.svg?url';
import star from './icons/star.svg?url';

/** Texture keys, used anywhere a game wants to draw a monster. */
export const MONSTERS = ['monster-red', 'monster-blue', 'monster-green', 'monster-yellow', 'monster-purple'];

/** Called once by BootScene. Loaded textures are available to every scene. */
export function loadSharedAssets(scene: Phaser.Scene): void {
  const monsterSize = { width: 300, height: 300 };
  scene.load.svg('monster-red', red, monsterSize);
  scene.load.svg('monster-blue', blue, monsterSize);
  scene.load.svg('monster-green', green, monsterSize);
  scene.load.svg('monster-yellow', yellow, monsterSize);
  scene.load.svg('monster-purple', purple, monsterSize);
  scene.load.svg('hero-1', hero1, { width: 180, height: 180 });
  scene.load.svg('hero-2', hero2, { width: 180, height: 180 });
  scene.load.svg('icon-home', home, { width: 200, height: 200 });
  scene.load.svg('icon-star', star, { width: 100, height: 100 });
}
