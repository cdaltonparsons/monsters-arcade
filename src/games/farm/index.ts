import type { GameEntry } from '../../games';
import { FarmScene } from './FarmScene';

export const farm: GameEntry = {
  sceneKey: FarmScene.KEY,
  title: 'Monster Farm',
  icon: 'icon-barn',
  scene: FarmScene,
};
