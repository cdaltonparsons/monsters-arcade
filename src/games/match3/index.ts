import type { GameEntry } from '../../games';
import { Match3Scene } from './Match3Scene';

export const match3: GameEntry = {
  sceneKey: Match3Scene.KEY,
  title: 'Monster Match',
  icon: 'monster-blue',
  scene: Match3Scene,
};
