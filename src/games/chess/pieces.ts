import type Phaser from 'phaser';
import { avatarSvg, type Avatar } from '../../shared/avatar';
import { addSvgTexture } from '../../shared/avatar-textures';
import type { Kind, Piece, Side } from './rules';

/**
 * Every chess piece is a monster built from the same parts as Make a Monster.
 * Each kind has its own body and face, so kids can tell them apart, and each
 * team has its own colour. Your king is the monster you made, wearing a crown.
 */
const LOOKS: Record<Kind, Omit<Avatar, 'color'>> = {
  p: { body: 'round', eyes: 'two', mouth: 'smile', top: 'none', extra: 'none' },
  r: { body: 'square', eyes: 'one', mouth: 'zigzag', top: 'none', extra: 'spots' },
  n: { body: 'tall', eyes: 'big', mouth: 'tongue', top: 'ears', extra: 'tail' },
  b: { body: 'pear', eyes: 'three', mouth: 'surprised', top: 'antennae', extra: 'none' },
  q: { body: 'spiky', eyes: 'silly', mouth: 'open', top: 'hair', extra: 'wings' },
  k: { body: 'ghost', eyes: 'two', mouth: 'fangs', top: 'crown', extra: 'cape' },
};

/** Names a parent can read out, and a few words on how each one moves. */
export const PIECE_INFO: Record<Kind, { name: string; moves: string }> = {
  p: { name: 'Pawn', moves: 'steps forward' },
  r: { name: 'Castle', moves: 'zooms in straight lines' },
  n: { name: 'Horsey', moves: 'jumps in an L' },
  b: { name: 'Bishop', moves: 'zooms corner to corner' },
  q: { name: 'Queen', moves: 'zooms any way' },
  k: { name: 'King', moves: 'one step any way' },
};

const COLOR_NAMES: Record<Color, string> = {
  '#ff9130': 'Orange',
  '#ef4b50': 'Red',
  '#ff7ab8': 'Pink',
  '#ffc928': 'Yellow',
  '#46b95a': 'Green',
  '#26bfb5': 'Teal',
  '#3c8cf0': 'Blue',
  '#9a5cf0': 'Purple',
  '#8d94a6': 'Grey',
};

/** The other team is purple, unless that would look too close to your monster. */
const OPPONENT_FOR: Partial<Record<Color, Color>> = {
  '#9a5cf0': '#ff9130',
  '#3c8cf0': '#ff9130',
  '#ff7ab8': '#26bfb5',
};

type Color = Avatar['color'];

export interface Team {
  color: Color;
  name: string;
}

/** Your team ('w', at the bottom) is the colour of the monster you made. */
export function makeTeams(hero: Avatar): Record<Side, Team> {
  const theirs = OPPONENT_FOR[hero.color] ?? '#9a5cf0';
  return {
    w: { color: hero.color, name: COLOR_NAMES[hero.color] },
    b: { color: theirs, name: COLOR_NAMES[theirs] },
  };
}

export const pieceKey = (piece: Piece): string => `chess-${piece.side}-${piece.kind}`;

/** Pictures are drawn at this size. Pieces show a little smaller than this. */
const TEXTURE_SIZE = 160;

/**
 * Builds a texture for every kind on both teams. Like applyAvatar() in
 * avatar-textures.ts, it turns SVG strings into textures, so there's no art to
 * load for the pieces at all.
 */
export async function makePieceTextures(game: Phaser.Game, hero: Avatar, teams: Record<Side, Team>): Promise<void> {
  const jobs: Promise<void>[] = [];
  for (const side of ['w', 'b'] as Side[]) {
    for (const kind of Object.keys(LOOKS) as Kind[]) {
      const look: Avatar =
        side === 'w' && kind === 'k' ? { ...hero, top: 'crown' } : { ...LOOKS[kind], color: teams[side].color };
      jobs.push(addSvgTexture(game, pieceKey({ side, kind }), avatarSvg(look, 1, TEXTURE_SIZE)));
    }
  }
  // Faces for the picker cards.
  jobs.push(
    addSvgTexture(game, 'chess-sleepy', avatarSvg({ ...LOOKS.k, eyes: 'sleepy', mouth: 'smile', color: teams.b.color }, 1, 300)),
    addSvgTexture(game, 'chess-clever', avatarSvg({ ...LOOKS.b, eyes: 'three', mouth: 'fangs', color: teams.b.color }, 1, 300)),
  );
  await Promise.all(jobs);
}
