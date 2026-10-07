/**
 * `text`, `space`, `radius` and `breakpoint` are px numbers so React Native
 * can use them directly; the generator converts all but breakpoints to `rem`
 * for CSS.
 */
const primary = {
  50: '#f0f7f7',
  100: '#dceae8',
  200: '#badcd8',
  300: '#8ec8c3',
  400: '#5eafa9',
  500: '#3d9690',
  600: '#2d7471',
  700: '#235a58',
  800: '#1c4744',
  900: '#173736',
} as const;

/**
 * Viewport widths in px. CSS can't read custom properties in `@media`, so
 * stylesheets write these numbers and a test holds them to this list.
 */
export const breakpoint = {
  /** Public pages switch to the phone layout at or below this. */
  phone: 480,
  narrow: 640,
  /** The project demos stack their panes. */
  demoStack: 760,
  /** The workspace sidebar becomes the tab bar. */
  tabBar: 767,
  sidebar: 1000,
  wide: 1024,
  wider: 1100,
} as const;

export const tokens = {
  text: {
    xs: 12,
    caption: 13,
    sm: 14,
    base: 16,
    body: 17,
    lg: 18,
    lead: 19,
    xl: 21.328,
    '2xl': 28.432,
    '3xl': 37.904,
    '4xl': 50.512,
  },
  space: {
    1: 4,
    2: 8,
    3: 12,
    4: 16,
    6: 24,
    8: 32,
    12: 48,
    16: 64,
  },
  primary,
  neutral: {
    50: '#f9fafb',
    100: '#f2f4f7',
    200: '#e5e8ed',
    300: '#d1d6df',
    400: '#9ba5b7',
    500: '#667085',
    600: '#4d5871',
    700: '#384259',
    800: '#1e2a3b',
    900: '#121926',
  },
  accent: {
    coral: '#ff7a5c',
    gold: '#f4b942',
    blue: '#4ea5d9',
  },
  color: {
    ink: '#16191d',
    inkSoft: '#4a515a',
    inkMuted: '#2b3138',
    prose: '#22272d',
    placeholder: '#757575',
    link: primary[700],
    error: '#b42318',
    errorBg: '#fef3f2',
    errorBorder: '#fda29b',
    /** Destructive actions and the access a removal takes away. */
    alert: '#a3341f',
    alertBorder: '#f1b8ad',
    danger: '#9b1c1c',
    dangerBg: '#fef2f2',
    dangerBorder: '#fecaca',
    onDanger: '#fff7f7',
    warning: '#7a5a12',
    warningInk: '#3d2a05',
    warningBg: '#fdf3dc',
    warningDot: '#c08a1e',
    /** The Building stage dot on project cards and pages. */
    building: '#c28d24',
    notice: '#92400e',
    noticeBg: '#fef3c7',
    info: '#23436b',
    infoBg: '#e4ecf7',
  },
  font: {
    sans: "'Inter', 'Inter Fallback', system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
    display:
      "'Inter', 'Inter Fallback', system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
    serif:
      "'Newsreader', 'Newsreader Fallback', Georgia, 'Times New Roman', serif",
    mono: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  },
  line: {
    tight: '1.2',
    snug: '1.375',
    normal: '1.5',
    relaxed: '1.75',
  },
  transition: {
    fast: '150ms ease',
    normal: '250ms ease',
    slow: '350ms cubic-bezier(0.4, 0, 0.2, 1)',
  },
  shadow: {
    sm: '0 1px 2px rgba(16, 24, 40, 0.05)',
    md: '0 2px 6px rgba(16, 24, 40, 0.08)',
    lg: '0 8px 16px rgba(16, 24, 40, 0.1)',
  },
  radius: {
    sm: 4,
    md: 8,
    lg: 16,
    full: 9999,
  },
  breakpoint,
} as const;

export type Tokens = typeof tokens;

const ROOT_FONT_SIZE_PX = 16;

/** `radius-full` is a pill sentinel, so scaling it with the root font size is meaningless. */
const pxOnly = new Set(['--radius-full']);

/** Media queries match viewport px, whatever the root font size. */
const pxGroups = new Set(['breakpoint']);

function round(value: number, decimals: number): string {
  return String(Number(value.toFixed(decimals)));
}

function toCssValue(
  group: string,
  name: string,
  value: number | string,
): string {
  if (typeof value === 'string') return value;
  if (pxOnly.has(name) || pxGroups.has(group)) return `${value}px`;
  return `${round(value / ROOT_FONT_SIZE_PX, 6)}rem`;
}

const kebab = (key: string): string =>
  key.replace(/[A-Z]/g, (ch) => `-${ch.toLowerCase()}`);

type TokenEntry = {
  name: string;
  css: string;
  raw: number | string;
};

function tokenEntries(source: Tokens): TokenEntry[] {
  const entries: TokenEntry[] = [];
  for (const [group, values] of Object.entries(source)) {
    for (const [key, raw] of Object.entries(values)) {
      const name = `--${group}-${kebab(key)}`;
      entries.push({ name, css: toCssValue(group, name, raw), raw });
    }
  }
  return entries;
}

export function tokenCssEntries(
  source: Tokens = tokens,
): Array<[string, string]> {
  return tokenEntries(source).map(({ name, css }) => [name, css]);
}

export function tokensToCssRoot(source: Tokens = tokens): string {
  const lines = [
    '/* Generated from @gagnechris/tokens — do not edit by hand. */',
    '/* Run: npm run generate -w @gagnechris/tokens */',
    ':root {',
    '  /* Modular Type Scale (1.333 - Perfect Fourth) */',
  ];

  const commentBefore: Record<string, string> = {
    '--space-1': '  /* Spacing Scale (8px grid) */',
    '--primary-50': '  /* Primary Colors - Soft, Digital Comfort Palette */',
    '--neutral-50': '  /* Neutral Colors */',
    '--accent-coral': '  /* Accent Colors */',
    '--color-ink': '  /* Text Colors */',
    '--font-sans': '  /* Font Family */',
    '--line-tight': '  /* Line Heights */',
    '--transition-fast': '  /* Transitions */',
    '--shadow-sm': '  /* Shadows */',
    '--radius-sm': '  /* Border Radius */',
    '--breakpoint-phone':
      '  /* Breakpoints (reference only: @media cannot use var()) */',
  };

  const valueComments: Record<string, string> = {
    '--primary-500': ' /* Base sage green */',
  };

  for (const { name, css, raw } of tokenEntries(source)) {
    const section = commentBefore[name];
    if (section) {
      lines.push('');
      lines.push(section);
    }
    const derivedPx =
      typeof raw === 'number' && css.endsWith('rem')
        ? ` /* ${round(raw, 2)}px */`
        : '';
    const suffix = valueComments[name] ?? derivedPx;
    if (name.startsWith('--font-')) {
      lines.push(`  ${name}:`);
      lines.push(`    ${css};`);
    } else {
      lines.push(`  ${name}: ${css};${suffix}`);
    }
  }

  lines.push('}');
  lines.push('');
  return lines.join('\n');
}
