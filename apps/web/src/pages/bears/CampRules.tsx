import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import CampRulesGame from '../../games/bears/camp/CampRulesGame';
import BearsPageMeta from '../../games/bears/shared/BearsPageMeta';
import SkipToTips from '../../games/bears/shared/SkipToTips';
import SoundToggle from '../../games/bears/shared/SoundToggle';
import { BEARS_PAGE_META } from '../../games/bears/shared/pageMeta';
import { bearsFromParam } from '../../games/bears/shared/routes';
import BearsGameHeader from './BearsGameHeader';
import '../../games/bears/shared/bears-shared.css';
import './BearsGamePage.css';

const CampRules = () => {
  const [searchParams] = useSearchParams();
  const from = bearsFromParam(searchParams);
  const [soundOn, setSoundOn] = useState(false);

  return (
    <div className="bears-game-page">
      <BearsPageMeta meta={BEARS_PAGE_META.camp} />
      <BearsGameHeader
        title="Camp Rules"
        from={from}
        actions={
          <>
            <SoundToggle on={soundOn} onToggle={() => setSoundOn((v) => !v)} />
            <SkipToTips from={from} />
          </>
        }
      />
      <main>
        <CampRulesGame from={from} soundOn={soundOn} />
      </main>
    </div>
  );
};

export default CampRules;
