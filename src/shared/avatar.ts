/**
 * The player's own monster, as a list of choices. avatarSvg() turns those choices
 * into an SVG string, the same way a template turns data into markup. There's no
 * Phaser in here, so avatar.test.ts can check every part without starting a game.
 */
export const OPTIONS = {
  body: ['round', 'square', 'tall', 'pear', 'spiky', 'ghost'],
  color: ['#ff9130', '#ef4b50', '#ff7ab8', '#ffc928', '#46b95a', '#26bfb5', '#3c8cf0', '#9a5cf0', '#8d94a6'],
  eyes: ['two', 'one', 'three', 'big', 'sleepy', 'silly'],
  mouth: ['fangs', 'smile', 'open', 'tongue', 'zigzag', 'surprised'],
  top: ['horns', 'none', 'antennae', 'ears', 'hair', 'crown'],
  extra: ['cape', 'none', 'wings', 'tail', 'spots', 'bowtie'],
} as const;

export type Part = keyof typeof OPTIONS;
export type Avatar = { [P in Part]: (typeof OPTIONS)[P][number] };

export const PARTS = Object.keys(OPTIONS) as Part[];

/** The first choice of each part is the monster everyone starts with. */
export const DEFAULT_AVATAR: Avatar = {
  body: OPTIONS.body[0],
  color: OPTIONS.color[0],
  eyes: OPTIONS.eyes[0],
  mouth: OPTIONS.mouth[0],
  top: OPTIONS.top[0],
  extra: OPTIONS.extra[0],
};

/** Saved data can be anything, so keep only choices that still exist. */
export function cleanAvatar(saved: unknown): Avatar {
  const raw = (saved && typeof saved === 'object' ? saved : {}) as Record<string, unknown>;
  const avatar = { ...DEFAULT_AVATAR } as Record<Part, string>;
  for (const part of PARTS) {
    const value = raw[part];
    if ((OPTIONS[part] as readonly unknown[]).includes(value)) avatar[part] = value as string;
  }
  return avatar as Avatar;
}

export function randomAvatar(random: () => number = Math.random): Avatar {
  const avatar = {} as Record<Part, string>;
  for (const part of PARTS) {
    const options = OPTIONS[part];
    avatar[part] = options[Math.floor(random() * options.length)];
  }
  return avatar as Avatar;
}

/** Blends a colour towards black (amount below 0) or white (above 0). */
function shade(hex: string, amount: number): string {
  const target = amount < 0 ? 0 : 255;
  const mix = Math.abs(amount);
  const channels = [1, 3, 5].map((start) => {
    const value = parseInt(hex.slice(start, start + 2), 16);
    return Math.round(value + (target - value) * mix)
      .toString(16)
      .padStart(2, '0');
  });
  return `#${channels.join('')}`;
}

const INK = '#2b2140';
const DARK_MOUTH = '#5a1f2c';

const BODIES: Record<Avatar['body'], (color: string) => string> = {
  round: (c) => `<circle cx="100" cy="96" r="74" fill="${c}"/>`,
  square: (c) => `<rect x="28" y="28" width="144" height="144" rx="30" fill="${c}"/>`,
  tall: (c) => `<ellipse cx="100" cy="94" rx="60" ry="82" fill="${c}"/>`,
  pear: (c) => `<path d="M100 18 C128 18 136 48 146 78 C160 114 182 138 164 164 C150 180 50 180 36 164 C18 138 40 114 54 78 C64 48 72 18 100 18 Z" fill="${c}"/>`,
  spiky: (c) => `<path d="M100 14 L122 38 L154 26 L156 60 L190 74 L170 102 L188 134 L154 142 L146 176 L100 164 L54 176 L46 142 L12 134 L30 102 L10 74 L44 60 L46 26 L78 38 Z" fill="${c}"/>`,
  ghost: (c) => `<path d="M26 96 C26 44 60 20 100 20 C140 20 174 44 174 96 V172 L150 156 L126 174 L100 156 L74 174 L50 156 L26 172 Z" fill="${c}"/>`,
};

function eye(x: number, y: number, r: number): string {
  const pupil = r * 0.5;
  return `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff"/><circle cx="${x + r * 0.2}" cy="${y + r * 0.15}" r="${pupil}" fill="${INK}"/>`;
}

const EYES: Record<Avatar['eyes'], (color: string) => string> = {
  two: () => eye(76, 78, 23) + eye(124, 78, 23),
  one: () => eye(100, 76, 36),
  three: () => eye(62, 84, 17) + eye(100, 64, 19) + eye(138, 84, 17),
  big: () => eye(70, 76, 31) + eye(130, 76, 31),
  sleepy: (c) =>
    eye(76, 80, 23) +
    eye(124, 80, 23) +
    `<path d="M51 80 A25 25 0 0 1 101 80 Z M99 80 A25 25 0 0 1 149 80 Z" fill="${shade(c, -0.25)}"/>`,
  silly: () => eye(68, 70, 28) + eye(132, 88, 16),
};

const MOUTHS: Record<Avatar['mouth'], string> = {
  fangs: `<path d="M74 118 Q100 148 126 118 Z" fill="${DARK_MOUTH}"/><path d="M84 120 l6 13 l7 -12 Z M116 120 l-6 13 l-7 -12 Z" fill="#fff"/>`,
  smile: `<path d="M68 122 Q100 156 132 122" fill="none" stroke="${DARK_MOUTH}" stroke-width="9" stroke-linecap="round"/>`,
  open: `<path d="M64 114 Q100 174 136 114 Z" fill="${DARK_MOUTH}"/><path d="M84 142 Q100 130 116 142 Q100 162 84 142 Z" fill="#ff8fa8"/>`,
  tongue: `<path d="M72 120 H128" stroke="${DARK_MOUTH}" stroke-width="9" stroke-linecap="round"/><path d="M92 120 H122 V136 A15 15 0 0 1 92 136 Z" fill="#ff7a9c"/>`,
  zigzag: `<path d="M62 124 L76 112 L88 128 L100 112 L112 128 L124 112 L138 124 L100 152 Z" fill="${DARK_MOUTH}"/><path d="M76 112 L88 128 L100 112 L112 128 L124 112 Z" fill="#fff"/>`,
  surprised: `<ellipse cx="100" cy="132" rx="19" ry="24" fill="${DARK_MOUTH}"/>`,
};

const TOPS: Record<Avatar['top'], (dark: string) => string> = {
  horns: (d) => `<path d="M72 40 L58 6 L92 30 Z M128 40 L142 6 L108 30 Z" fill="${d}"/>`,
  none: () => '',
  antennae: () =>
    `<path d="M76 34 L62 10 M124 34 L138 10" stroke="${INK}" stroke-width="7" stroke-linecap="round"/><circle cx="60" cy="10" r="10" fill="#ffd23f"/><circle cx="140" cy="10" r="10" fill="#ffd23f"/>`,
  ears: (d) =>
    `<circle cx="42" cy="38" r="28" fill="${d}"/><circle cx="158" cy="38" r="28" fill="${d}"/><circle cx="42" cy="38" r="14" fill="#ffb7c8"/><circle cx="158" cy="38" r="14" fill="#ffb7c8"/>`,
  hair: () => `<path d="M62 40 L60 6 L80 26 L90 0 L102 24 L116 0 L124 26 L142 8 L138 40 Z" fill="#4a3470"/>`,
  crown: () =>
    `<path d="M62 36 L56 2 L80 18 L100 0 L120 18 L144 2 L138 36 Z" fill="#ffd23f" stroke="#e39b00" stroke-width="4" stroke-linejoin="round"/><circle cx="100" cy="24" r="6" fill="#ef4b50"/>`,
};

/** Extras either sit behind the body, or on the front of it. */
function extraParts(extra: Avatar['extra'], color: string): { behind: string; front: string } {
  const dark = shade(color, -0.25);
  switch (extra) {
    case 'cape': {
      // A blue monster gets a red cape, so it always shows up.
      const cape = color === '#3c8cf0' ? '#ef4b50' : '#2e6fd8';
      return { behind: `<path d="M44 70 C2 106 10 164 26 170 L100 150 Z M156 70 C198 106 190 164 174 170 L100 150 Z" fill="${cape}"/>`, front: '' };
    }
    case 'wings':
      return {
        behind: `<path d="M50 88 C10 40 0 70 2 112 C12 104 18 124 30 118 C34 130 44 128 54 120 Z M150 88 C190 40 200 70 198 112 C188 104 182 124 170 118 C166 130 156 128 146 120 Z" fill="#dff4ff" stroke="#9fd6ee" stroke-width="4"/>`,
        front: '',
      };
    case 'tail':
      return { behind: `<path d="M150 150 C190 158 196 120 180 104 L198 92 L174 82 L164 110 C176 124 168 136 146 130 Z" fill="${dark}"/>`, front: '' };
    case 'spots':
      return {
        behind: '',
        front: `<g fill="${dark}"><circle cx="48" cy="118" r="10"/><circle cx="152" cy="116" r="11"/><circle cx="58" cy="146" r="7"/><circle cx="146" cy="146" r="8"/></g>`,
      };
    case 'bowtie':
      return {
        behind: '',
        front: `<path d="M100 164 L66 148 V178 Z M100 164 L134 148 V178 Z" fill="#ef4b50"/><circle cx="100" cy="164" r="9" fill="#b92f35"/>`,
      };
    case 'none':
      return { behind: '', front: '' };
  }
}

/**
 * Builds the picture. Frame 1 and frame 2 have different feet forward, which is
 * all it takes to look like walking. `size` is the picture's width and height.
 */
export function avatarSvg(avatar: Avatar, frame: 1 | 2, size: number): string {
  const dark = shade(avatar.color, -0.25);
  const light = shade(avatar.color, 0.6);
  const [left, right] = frame === 1 ? [172, 186] : [186, 172];
  const extra = extraParts(avatar.extra, avatar.color);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 200 200">
    ${extra.behind}
    <ellipse cx="66" cy="${left}" rx="28" ry="15" fill="${dark}"/>
    <ellipse cx="134" cy="${right}" rx="28" ry="15" fill="${dark}"/>
    ${TOPS[avatar.top](dark)}
    ${BODIES[avatar.body](avatar.color)}
    <ellipse cx="100" cy="128" rx="40" ry="30" fill="${light}"/>
    ${extra.front}
    ${EYES[avatar.eyes](avatar.color)}
    ${MOUTHS[avatar.mouth]}
  </svg>`;
}
