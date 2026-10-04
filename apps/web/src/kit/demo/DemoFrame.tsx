import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from '../Button';
import '../kit.css';
import './DemoFrame.css';

export const DEMO_NOTE = 'Sample data, runs in your browser, nothing is saved';

type Props = { onReset: () => void } & (
  | { layout?: 'bar'; children: ReactNode }
  | {
      /** The note sits in the slot's label row and the demo places Reset in its own toolbar. */
      layout: 'split';
      note: ReactNode;
      children: (resetButton: ReactNode) => ReactNode;
    }
);

/**
 * Sits in the project page's Try it slot, which owns the "Try it" heading.
 * Reset also remounts the demo so editor history and typed-but-unsent input go too.
 */
export function DemoFrame(props: Props) {
  const { onReset } = props;
  const [generation, setGeneration] = useState(0);
  const frameRef = useRef<HTMLDivElement>(null);
  const split = props.layout === 'split';

  // In the split layout Reset remounts with the demo, so focus would drop to <body>.
  useEffect(() => {
    if (!split || generation === 0) return;
    frameRef.current
      ?.querySelector<HTMLButtonElement>('[data-demo-reset]')
      ?.focus();
  }, [split, generation]);

  const resetButton = (
    <Button
      data-demo-reset=""
      onClick={() => {
        onReset();
        setGeneration((g) => g + 1);
      }}
    >
      Reset
    </Button>
  );

  if (props.layout === 'split') {
    return (
      <div className="demo-frame demo-frame--split" ref={frameRef}>
        <p className="demo-frame__note demo-frame__note--label">{props.note}</p>
        <div className="demo-frame__split" key={generation}>
          {props.children(resetButton)}
        </div>
      </div>
    );
  }

  return (
    <div className="demo-frame" ref={frameRef}>
      <div className="demo-frame__bar">
        <p className="demo-frame__note">{DEMO_NOTE}</p>
        {resetButton}
      </div>
      <div className="demo-frame__body" key={generation}>
        {props.children}
      </div>
    </div>
  );
}
