/**
 * Colours shared by the bears pages, canvas and SVG art. bears-shared.css
 * mirrors each as `--bears-<kebab-name>`; palette.test.ts keeps them equal.
 */
export const PALETTE = {
  ink: '#16191d',
  charcoal: '#2b3138',
  slate: '#4a515a',
  steel: '#4d5871',
  mist: '#c5ccd6',
  haze: '#e5e8ed',
  white: '#ffffff',
  bearFur: '#1d1a19',
  muzzle: '#c9a27a',
  skin: '#f2c9a0',
  soil: '#2b2018',
  earth: '#6b4f3a',
  dirt: '#8b6a4c',
  sand: '#e9dcc0',
  pine: '#2f5d50',
  pineLight: '#3f7a5f',
  leaf: '#4f8a3a',
  moss: '#5b7f3a',
  berry: '#6b2a4a',
  beechnut: '#8a5a35',
  acorn: '#a8552a',
  rust: '#c2552d',
  rustDark: '#7a2e17',
  autumnFar: '#b5652f',
  autumnNear: '#8a4b25',
  alert: '#a3341f',
  gold: '#f4b942',
  goldDark: '#c08a1e',
  water: '#4ea5d9',
  waterDark: '#2b6f97',
  skyCamp: '#cfe6ef',
  skySummer: '#dbecf2',
  skyAutumn: '#f6e3c8',
} as const;

export type PaletteName = keyof typeof PALETTE;

export const paletteVar = (name: PaletteName) =>
  `--bears-${name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
