import type { Part } from '../../shared/avatar';

const svg = (inner: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="110" height="110" viewBox="0 0 100 100">${inner}</svg>`;

/** A little picture for each tab, because the players can't read yet. */
export const TAB_ICONS: Record<Part, string> = {
  body: svg(`<circle cx="30" cy="34" r="22" fill="#4a3470"/><rect x="56" y="14" width="38" height="38" rx="8" fill="#4a3470"/><path d="M50 56 L76 96 H24 Z" fill="#4a3470"/>`),
  color: svg(`<circle cx="50" cy="26" r="18" fill="#ef4b50"/><circle cx="26" cy="68" r="18" fill="#ffc928"/><circle cx="74" cy="68" r="18" fill="#3c8cf0"/>`),
  eyes: svg(`<circle cx="50" cy="50" r="42" fill="#fff" stroke="#4a3470" stroke-width="6"/><circle cx="50" cy="50" r="20" fill="#4a3470"/>`),
  mouth: svg(`<path d="M12 36 Q50 104 88 36 Z" fill="#4a3470"/><path d="M26 39 l8 18 l9 -17 Z M74 39 l-8 18 l-9 -17 Z" fill="#fff"/>`),
  top: svg(`<path d="M8 90 L18 12 L50 58 L82 12 L92 90 Z" fill="#4a3470"/>`),
  extra: svg(`<path d="M30 12 H70 L92 92 Q50 74 8 92 Z" fill="#4a3470"/>`),
};
