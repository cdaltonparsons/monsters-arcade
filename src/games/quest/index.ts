import type { GameEntry } from '../../games';
import { QuestScene } from './QuestScene';

export const quest: GameEntry = {
  sceneKey: QuestScene.KEY,
  title: 'Monster Quest',
  icon: 'hero-1',
  scene: QuestScene,
};
