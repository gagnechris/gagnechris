import { useState, type ReactNode } from 'react';
import { Button } from '../Button';
import '../kit.css';
import './DemoFrame.css';

export const DEMO_NOTE = 'Sample data, runs in your browser, nothing is saved';

type Props = {
  onReset: () => void;
  children: ReactNode;
};

/**
 * Sits in the project page's Try it slot, which owns the "Try it" heading.
 * Reset also remounts the demo so editor history and typed-but-unsent input go too.
 */
export function DemoFrame({ onReset, children }: Props) {
  const [generation, setGeneration] = useState(0);
  return (
    <div className="demo-frame">
      <div className="demo-frame__bar">
        <p className="demo-frame__note">{DEMO_NOTE}</p>
        <Button
          onClick={() => {
            onReset();
            setGeneration((g) => g + 1);
          }}
        >
          Reset
        </Button>
      </div>
      <div className="demo-frame__body" key={generation}>
        {children}
      </div>
    </div>
  );
}
