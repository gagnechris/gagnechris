type PawsProps = {
  /** 0–3 */
  count: number;
};

const Paw = ({ filled }: { filled: boolean }) => (
  <svg
    viewBox="0 0 24 24"
    width="28"
    height="28"
    aria-hidden="true"
    className={filled ? 'bears-paw bears-paw--filled' : 'bears-paw'}
  >
    <ellipse cx="12" cy="16" rx="6" ry="5" />
    <circle cx="5.5" cy="9.5" r="2.3" />
    <circle cx="9.5" cy="6" r="2.3" />
    <circle cx="14.5" cy="6" r="2.3" />
    <circle cx="18.5" cy="9.5" r="2.3" />
  </svg>
);

const Paws = ({ count }: PawsProps) => {
  const n = Math.max(0, Math.min(3, Math.round(count)));
  return (
    <div className="bears-paws" role="img" aria-label={`${n} of 3 paws`}>
      {[0, 1, 2].map((k) => (
        <Paw key={k} filled={k < n} />
      ))}
    </div>
  );
};

export default Paws;
