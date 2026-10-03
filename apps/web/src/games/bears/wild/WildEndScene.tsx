type WildEndSceneProps = {
  outcome: 'den' | 'habituated';
  reducedMotion: boolean;
};

const FLAKES = Array.from({ length: 18 }, (_, i) => ({
  left: (i * 71) % 100,
  top: (i * 37) % 90,
  delay: i * 0.5,
}));

const SleepingMaple = () => (
  <g transform="translate(160 470)">
    <path d="M0 90 a150 110 0 0 1 300 0 z" fill="#6b4f3a" />
    <path d="M70 90 a80 70 0 0 1 160 0 z" fill="#2b2018" />
    <ellipse cx="150" cy="70" rx="60" ry="24" fill="#1d1a19" />
    <circle cx="105" cy="58" r="16" fill="#1d1a19" />
    <circle cx="98" cy="44" r="6" fill="#1d1a19" />
    <ellipse cx="92" cy="64" rx="9" ry="6" fill="#c9a27a" />
    <path d="M104 54 q5 3 10 0" stroke="#ffffff" strokeWidth="2" fill="none" />
    <text
      x="190"
      y="-10"
      fill="#ffffff"
      fontSize="28"
      fontWeight="700"
      fontFamily="Inter, system-ui, sans-serif"
    >
      z z z
    </text>
  </g>
);

const CampsiteMaple = () => (
  <g transform="translate(150 440)">
    <rect x="40" y="40" width="56" height="90" rx="6" fill="#4d5871" />
    <rect
      x="30"
      y="18"
      width="76"
      height="14"
      rx="4"
      fill="#2b3138"
      transform="rotate(-18 30 25)"
    />
    <rect
      x="50"
      y="96"
      width="24"
      height="16"
      rx="3"
      fill="#f4b942"
      transform="rotate(-12 60 104)"
    />
    <ellipse cx="190" cy="98" rx="62" ry="36" fill="#1d1a19" />
    <circle cx="132" cy="76" r="22" fill="#1d1a19" />
    <circle cx="124" cy="56" r="8" fill="#1d1a19" />
    <circle cx="142" cy="56" r="8" fill="#1d1a19" />
    <ellipse cx="116" cy="84" rx="11" ry="8" fill="#c9a27a" />
    <circle cx="136" cy="70" r="3" fill="#ffffff" />
  </g>
);

const WildEndScene = ({ outcome, reducedMotion }: WildEndSceneProps) => {
  const den = outcome === 'den';
  return (
    <div
      className={`wild-scene wild-scene--${outcome}${reducedMotion ? ' wild-scene--still' : ''}`}
      aria-hidden="true"
    >
      <svg viewBox="0 0 1280 720" preserveAspectRatio="xMinYMax slice">
        {den ? (
          <path
            d="M0 430 L260 300 L540 380 L800 280 L1280 400 L1280 720 L0 720 Z"
            fill="#3b5068"
          />
        ) : (
          <path
            d="M0 450 L280 330 L560 410 L860 320 L1280 430 L1280 720 L0 720 Z"
            fill="#e7cfa9"
          />
        )}
        <rect
          x="0"
          y="560"
          width="1280"
          height="160"
          fill={den ? '#eef3f7' : '#8b6a4c'}
        />
        {den ? null : (
          <rect x="0" y="548" width="1280" height="14" fill="#5b7f3a" />
        )}
        {den ? <SleepingMaple /> : <CampsiteMaple />}
      </svg>
      {den
        ? FLAKES.map((f, i) => (
            <span
              key={i}
              className="wild-scene__flake"
              style={{
                left: `${f.left}%`,
                top: `${f.top}%`,
                animationDelay: `-${f.delay}s`,
              }}
            />
          ))
        : null}
    </div>
  );
};

export default WildEndScene;
