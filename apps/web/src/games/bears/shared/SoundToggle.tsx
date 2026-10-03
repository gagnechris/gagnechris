type SoundToggleProps = {
  on: boolean;
  onToggle: () => void;
};

const SoundToggle = ({ on, onToggle }: SoundToggleProps) => (
  <button
    type="button"
    className="bears-btn bears-btn--ghost"
    aria-pressed={on}
    onClick={onToggle}
    title={on ? 'Mute game sounds' : 'Turn on short sound effects'}
  >
    Sound: {on ? 'On' : 'Off'}
  </button>
);

export default SoundToggle;
