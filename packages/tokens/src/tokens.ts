/**
 * `text`, `space`, and `radius` are px numbers so React Native can use them
 * directly; the generator converts them to `rem` for CSS.
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

export const tokens = {
  text: {
    xs: 12,
    sm: 14,
    base: 16,
    lg: 18,
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
    link: primary[700],
  },
  font: {
    sans: "'Inter', 'Inter Fallback', system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
    display:
      "'Inter', 'Inter Fallback', system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
    serif:
      "'Newsreader', 'Newsreader Fallback', Georgia, 'Times New Roman', serif",
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
} as const;

export type Tokens = typeof tokens;

const ROOT_FONT_SIZE_PX = 16;

/** `radius-full` is a pill sentinel, so scaling it with the root font size is meaningless. */
const pxOnly = new Set(['--radius-full']);

function round(value: number, decimals: number): string {
  return String(Number(value.toFixed(decimals)));
}

function toCssValue(name: string, value: number | string): string {
  if (typeof value === 'string') return value;
  if (pxOnly.has(name)) return `${value}px`;
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
      entries.push({ name, css: toCssValue(name, raw), raw });
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
