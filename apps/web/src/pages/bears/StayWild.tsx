import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import StayWildGame from '../../games/bears/wild/StayWildGame';
import BearsPageMeta from '../../games/bears/shared/BearsPageMeta';
import SkipToTips from '../../games/bears/shared/SkipToTips';
import SoundToggle from '../../games/bears/shared/SoundToggle';
import { BEARS_PAGE_META } from '../../games/bears/shared/pageMeta';
import { bearsFromParam } from '../../games/bears/shared/routes';
import BearsGameHeader from './BearsGameHeader';
import '../../games/bears/shared/bears-shared.css';
import './BearsGamePage.css';

const StayWild = () => {
  const [searchParams] = useSearchParams();
  const from = bearsFromParam(searchParams);
  const [soundOn, setSoundOn] = useState(false);

  return (
    <main className="bears-game-page">
      <BearsPageMeta meta={BEARS_PAGE_META.wild} />
      <BearsGameHeader
        title="Stay Wild"
        from={from}
        actions={
          <>
            <SoundToggle on={soundOn} onToggle={() => setSoundOn((v) => !v)} />
            <SkipToTips from={from} />
          </>
        }
      />
      <div className="bears-game-page__body">
        <StayWildGame from={from} soundOn={soundOn} />
      </div>
    </main>
  );
};

export default StayWild;
