import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import CampRulesGame, {
  type CampMode,
} from '../../games/bears/camp/CampRulesGame';
import { campShortDate } from '../../games/bears/camp/campResult';
import { dailyCampKey } from '../../games/bears/camp/dailyCamp';
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
  const [mode, setMode] = useState<CampMode>('daily');
  const dailyKey = useMemo(() => dailyCampKey(new Date()), []);

  return (
    <div className="bears-game-page">
      <BearsPageMeta meta={BEARS_PAGE_META.camp} />
      <BearsGameHeader
        title="Camp Rules"
        from={from}
        aside={
          mode === 'daily'
            ? `Daily camp · ${campShortDate(dailyKey)}`
            : 'Random camp'
        }
        actions={
          <>
            <SoundToggle on={soundOn} onToggle={() => setSoundOn((v) => !v)} />
            <SkipToTips from={from} />
          </>
        }
      />
      <main>
        <CampRulesGame
          from={from}
          soundOn={soundOn}
          dailyKey={dailyKey}
          mode={mode}
          onModeChange={setMode}
        />
      </main>
    </div>
  );
};

export default CampRules;
