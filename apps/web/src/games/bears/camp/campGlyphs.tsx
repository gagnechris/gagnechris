import type { CampItemKind } from './campLogic';
import { PALETTE } from '../shared/palette';

type ItemGlyphProps = {
  kind: CampItemKind;
};

export const CampItemGlyph = ({ kind }: ItemGlyphProps) => {
  switch (kind) {
    case 'trash':
      return (
        <svg viewBox="0 0 48 48" width="34" height="34" aria-hidden="true">
          <rect
            x="12"
            y="16"
            width="24"
            height="26"
            rx="3"
            fill={PALETTE.steel}
          />
          <rect
            className="camp-glyph__lid"
            x="9"
            y="6"
            width="30"
            height="6"
            rx="2"
            fill={PALETTE.charcoal}
          />
          <path d="M20 22v14M28 22v14" stroke={PALETTE.mist} strokeWidth="2" />
        </svg>
      );
    case 'feeder':
      return (
        <svg viewBox="0 0 48 48" width="34" height="34" aria-hidden="true">
          <g className="camp-glyph__feeder">
            <path d="M24 4v10" stroke={PALETTE.pine} strokeWidth="3" />
            <path d="M12 18h24l-4 6H16z" fill={PALETTE.pine} />
            <rect
              x="15"
              y="24"
              width="18"
              height="16"
              rx="3"
              fill={PALETTE.gold}
            />
            <circle cx="24" cy="32" r="3" fill="#7a5a12" />
          </g>
        </svg>
      );
    case 'cooler':
      return (
        <svg viewBox="0 0 48 48" width="34" height="34" aria-hidden="true">
          <rect
            x="7"
            y="18"
            width="34"
            height="22"
            rx="4"
            fill={PALETTE.water}
          />
          <rect
            className="camp-glyph__lid"
            x="7"
            y="6"
            width="34"
            height="7"
            rx="3"
            fill={PALETTE.waterDark}
          />
          <rect
            x="19"
            y="26"
            width="10"
            height="3"
            rx="1.5"
            fill={PALETTE.white}
          />
        </svg>
      );
    case 'grill':
      return (
        <svg viewBox="0 0 48 48" width="34" height="34" aria-hidden="true">
          <path d="M8 20h32a16 12 0 0 1-32 0z" fill={PALETTE.charcoal} />
          <path
            d="M14 31l-4 12M34 31l4 12"
            stroke={PALETTE.charcoal}
            strokeWidth="3"
          />
          <path
            className="camp-glyph__grease"
            d="M10 20h28"
            stroke={PALETTE.rust}
            strokeWidth="3"
          />
        </svg>
      );
    case 'pet':
      return (
        <svg viewBox="0 0 48 48" width="34" height="34" aria-hidden="true">
          <g className="camp-glyph__bowl">
            <path d="M8 26h32l-4 12H12z" fill={PALETTE.rust} />
            <circle cx="18" cy="23" r="3" fill={PALETTE.rustDark} />
            <circle cx="25" cy="22" r="3" fill={PALETTE.rustDark} />
            <circle cx="31" cy="24" r="3" fill={PALETTE.rustDark} />
          </g>
        </svg>
      );
  }
};

export const CampBearGlyph = () => (
  <svg viewBox="0 0 64 56" width="52" height="46" aria-hidden="true">
    <circle cx="14" cy="12" r="9" fill={PALETTE.bearFur} />
    <circle cx="50" cy="12" r="9" fill={PALETTE.bearFur} />
    <circle cx="14" cy="12" r="4" fill="#8a6a4f" />
    <circle cx="50" cy="12" r="4" fill="#8a6a4f" />
    <ellipse cx="32" cy="30" rx="24" ry="22" fill={PALETTE.bearFur} />
    <ellipse cx="32" cy="38" rx="11" ry="9" fill={PALETTE.muzzle} />
    <ellipse cx="32" cy="34" rx="4.5" ry="3.2" fill={PALETTE.bearFur} />
    <circle cx="23" cy="25" r="2.6" fill={PALETTE.white} />
    <circle cx="41" cy="25" r="2.6" fill={PALETTE.white} />
    <circle cx="23.5" cy="25.5" r="1.3" fill={PALETTE.bearFur} />
    <circle cx="41.5" cy="25.5" r="1.3" fill={PALETTE.bearFur} />
  </svg>
);

export const CampScenery = () => (
  <>
    <div className="camp-field__sky" aria-hidden="true" />
    <svg
      className="camp-field__mountains"
      viewBox="0 0 160 30"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path
        d="M0 30 L0 18 L14 6 L26 16 L40 2 L56 15 L72 4 L88 17 L104 5 L120 16 L136 3 L150 14 L160 8 L160 30 Z"
        fill={PALETTE.pineLight}
      />
      <path
        d="M0 30 L0 22 L18 12 L34 22 L50 10 L66 21 L84 11 L102 22 L118 12 L134 22 L150 13 L160 20 L160 30 Z"
        fill={PALETTE.pine}
      />
    </svg>
    <svg className="camp-field__tent" viewBox="0 0 40 30" aria-hidden="true">
      <path d="M2 28 L20 3 L38 28 Z" fill={PALETTE.rust} />
      <path d="M15 28 L20 15 L25 28 Z" fill={PALETTE.rustDark} />
    </svg>
    <div className="camp-field__firepit" aria-hidden="true" />
  </>
);
