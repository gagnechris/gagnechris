import type { CampItemKind } from './campLogic';

type ItemGlyphProps = {
  kind: CampItemKind;
};

export const CampItemGlyph = ({ kind }: ItemGlyphProps) => {
  switch (kind) {
    case 'trash':
      return (
        <svg viewBox="0 0 48 48" width="34" height="34" aria-hidden="true">
          <rect x="12" y="16" width="24" height="26" rx="3" fill="#4d5871" />
          <rect
            className="camp-glyph__lid"
            x="9"
            y="6"
            width="30"
            height="6"
            rx="2"
            fill="#2b3138"
          />
          <path d="M20 22v14M28 22v14" stroke="#c5ccd6" strokeWidth="2" />
        </svg>
      );
    case 'feeder':
      return (
        <svg viewBox="0 0 48 48" width="34" height="34" aria-hidden="true">
          <g className="camp-glyph__feeder">
            <path d="M24 4v10" stroke="#2f5d50" strokeWidth="3" />
            <path d="M12 18h24l-4 6H16z" fill="#2f5d50" />
            <rect x="15" y="24" width="18" height="16" rx="3" fill="#f4b942" />
            <circle cx="24" cy="32" r="3" fill="#7a5a12" />
          </g>
        </svg>
      );
    case 'cooler':
      return (
        <svg viewBox="0 0 48 48" width="34" height="34" aria-hidden="true">
          <rect x="7" y="18" width="34" height="22" rx="4" fill="#4ea5d9" />
          <rect
            className="camp-glyph__lid"
            x="7"
            y="6"
            width="34"
            height="7"
            rx="3"
            fill="#2b6f97"
          />
          <rect x="19" y="26" width="10" height="3" rx="1.5" fill="#ffffff" />
        </svg>
      );
    case 'grill':
      return (
        <svg viewBox="0 0 48 48" width="34" height="34" aria-hidden="true">
          <path d="M8 20h32a16 12 0 0 1-32 0z" fill="#2b3138" />
          <path d="M14 31l-4 12M34 31l4 12" stroke="#2b3138" strokeWidth="3" />
          <path
            className="camp-glyph__grease"
            d="M10 20h28"
            stroke="#c2552d"
            strokeWidth="3"
          />
        </svg>
      );
    case 'pet':
      return (
        <svg viewBox="0 0 48 48" width="34" height="34" aria-hidden="true">
          <g className="camp-glyph__bowl">
            <path d="M8 26h32l-4 12H12z" fill="#c2552d" />
            <circle cx="18" cy="23" r="3" fill="#7a2e17" />
            <circle cx="25" cy="22" r="3" fill="#7a2e17" />
            <circle cx="31" cy="24" r="3" fill="#7a2e17" />
          </g>
        </svg>
      );
  }
};

export const CampBearGlyph = () => (
  <svg viewBox="0 0 64 56" width="52" height="46" aria-hidden="true">
    <circle cx="14" cy="12" r="9" fill="#1d1a19" />
    <circle cx="50" cy="12" r="9" fill="#1d1a19" />
    <circle cx="14" cy="12" r="4" fill="#8a6a4f" />
    <circle cx="50" cy="12" r="4" fill="#8a6a4f" />
    <ellipse cx="32" cy="30" rx="24" ry="22" fill="#1d1a19" />
    <ellipse cx="32" cy="38" rx="11" ry="9" fill="#c9a27a" />
    <ellipse cx="32" cy="34" rx="4.5" ry="3.2" fill="#1d1a19" />
    <circle cx="23" cy="25" r="2.6" fill="#ffffff" />
    <circle cx="41" cy="25" r="2.6" fill="#ffffff" />
    <circle cx="23.5" cy="25.5" r="1.3" fill="#1d1a19" />
    <circle cx="41.5" cy="25.5" r="1.3" fill="#1d1a19" />
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
        fill="#3f7a5f"
      />
      <path
        d="M0 30 L0 22 L18 12 L34 22 L50 10 L66 21 L84 11 L102 22 L118 12 L134 22 L150 13 L160 20 L160 30 Z"
        fill="#2f5d50"
      />
    </svg>
    <svg className="camp-field__tent" viewBox="0 0 40 30" aria-hidden="true">
      <path d="M2 28 L20 3 L38 28 Z" fill="#c2552d" />
      <path d="M15 28 L20 15 L25 28 Z" fill="#7a2e17" />
    </svg>
    <div className="camp-field__firepit" aria-hidden="true" />
  </>
);
