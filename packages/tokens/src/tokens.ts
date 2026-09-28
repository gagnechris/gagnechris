/**
 * Design tokens (CHR-140). Single source for web CSS vars and future RN styles.
 * Values match the previous `apps/web/src/index.css` `:root` block (no visual change).
 */
export const tokens = {
  text: {
    xs: '0.75rem',
    sm: '0.875rem',
    base: '1rem',
    lg: '1.125rem',
    xl: '1.333rem',
    '2xl': '1.777rem',
    '3xl': '2.369rem',
    '4xl': '3.157rem',
  },
  space: {
    1: '0.25rem',
    2: '0.5rem',
    3: '0.75rem',
    4: '1rem',
    6: '1.5rem',
    8: '2rem',
    12: '3rem',
    16: '4rem',
  },
  primary: {
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
  },
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
  font: {
    sans: "'Inter', system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
    display:
      "'Inter', system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
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
    sm: '0.25rem',
    md: '0.5rem',
    lg: '1rem',
    full: '9999px',
  },
} as const;

export type Tokens = typeof tokens;

/** Flat CSS custom-property map: `--text-xs` → value. */
export function tokenCssEntries(
  source: Tokens = tokens,
): Array<[string, string]> {
  const entries: Array<[string, string]> = [];
  for (const [group, values] of Object.entries(source)) {
    for (const [key, value] of Object.entries(values)) {
      entries.push([`--${group}-${key}`, value]);
    }
  }
  return entries;
}

/** `:root { … }` block generated from tokens (comments match prior index.css). */
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
    '--font-sans': '  /* Font Family */',
    '--line-tight': '  /* Line Heights */',
    '--transition-fast': '  /* Transitions */',
    '--shadow-sm': '  /* Shadows */',
    '--radius-sm': '  /* Border Radius */',
  };

  const remComments: Record<string, string> = {
    '--text-xs': ' /* 12px */',
    '--text-sm': ' /* 14px */',
    '--text-base': ' /* 16px */',
    '--text-lg': ' /* 18px */',
    '--text-xl': ' /* 21.33px */',
    '--text-2xl': ' /* 28.43px */',
    '--text-3xl': ' /* 37.9px */',
    '--text-4xl': ' /* 50.52px */',
    '--space-1': ' /* 4px */',
    '--space-2': ' /* 8px */',
    '--space-3': ' /* 12px */',
    '--space-4': ' /* 16px */',
    '--space-6': ' /* 24px */',
    '--space-8': ' /* 32px */',
    '--space-12': ' /* 48px */',
    '--space-16': ' /* 64px */',
    '--primary-500': ' /* Base sage green */',
    '--radius-sm': ' /* 4px */',
    '--radius-md': ' /* 8px */',
    '--radius-lg': ' /* 16px */',
  };

  for (const [name, value] of tokenCssEntries(source)) {
    const section = commentBefore[name];
    if (section) {
      lines.push('');
      lines.push(section);
    }
    const suffix = remComments[name] ?? '';
    if (name === '--font-sans' || name === '--font-display') {
      lines.push(`  ${name}:`);
      lines.push(`    ${value};`);
    } else {
      lines.push(`  ${name}: ${value};${suffix}`);
    }
  }

  lines.push('}');
  lines.push('');
  return lines.join('\n');
}
