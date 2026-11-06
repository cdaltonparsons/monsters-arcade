import type Phaser from 'phaser';
import red from './monsters/red.svg?url';
import blue from './monsters/blue.svg?url';
import green from './monsters/green.svg?url';
import yellow from './monsters/yellow.svg?url';
import purple from './monsters/purple.svg?url';
import home from './icons/home.svg?url';
import star from './icons/star.svg?url';
import barn from './icons/barn.svg?url';
import maker from './icons/maker.svg?url';
import hide from './icons/hide.svg?url';
import tree from './scenery/tree.svg?url';
import flower from './scenery/flower.svg?url';
import arrow from './scenery/arrow.svg?url';

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
  scene.load.svg('icon-home', home, { width: 200, height: 200 });
  scene.load.svg('icon-star', star, { width: 100, height: 100 });
  scene.load.svg('icon-barn', barn, { width: 320, height: 320 });
  scene.load.svg('icon-maker', maker, { width: 320, height: 320 });
  scene.load.svg('icon-hide', hide, { width: 440, height: 440 });
  scene.load.svg('scenery-tree', tree, { width: 280, height: 400 });
  scene.load.svg('scenery-flower', flower, { width: 60, height: 60 });
  scene.load.svg('scenery-arrow', arrow, { width: 110, height: 110 });
}
