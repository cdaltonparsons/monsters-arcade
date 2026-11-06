import type { GameEntry } from '../../games';
import { MakerScene } from './MakerScene';

export const maker: GameEntry = {
  sceneKey: MakerScene.KEY,
  title: 'Make a Monster',
  icon: 'icon-maker',
  scene: MakerScene,
};
