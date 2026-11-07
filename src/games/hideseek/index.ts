import type { GameEntry } from '../../games';
import { HideSeekScene } from './HideSeekScene';

export const hideSeek: GameEntry = {
  sceneKey: HideSeekScene.KEY,
  title: 'Hide and Seek',
  icon: 'icon-hide',
  scene: HideSeekScene,
};
