import Phaser from 'phaser';
import { games } from './games';
import { MenuScene } from './menu/MenuScene';
import { BootScene } from './shared/BootScene';
import { BACKGROUND, GAME_HEIGHT, GAME_WIDTH } from './shared/constants';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: BACKGROUND,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  // Scenes are a bit like routes. The first one in the list starts automatically.
  scene: [BootScene, MenuScene, ...games.map((game) => game.scene)],
});

// While developing, type `game` in the browser console to poke at the running game.
if (import.meta.env.DEV) {
  (window as unknown as { game: Phaser.Game }).game = game;
}
