import { useSearchParams } from 'react-router-dom';
import BearGame from '../../games/bears/BearGame';
import BearsPageMeta from '../../games/bears/shared/BearsPageMeta';
import { BEARS_PAGE_META } from '../../games/bears/shared/pageMeta';
import { bearsFromParam } from '../../games/bears/shared/routes';
import BearsGameHeader from './BearsGameHeader';
import '../../games/bears/shared/bears-shared.css';
import './BearsGamePage.css';

const CampRules = () => {
  const [searchParams] = useSearchParams();
  const from = bearsFromParam(searchParams);

  return (
    <div className="bears-game-page">
      <BearsPageMeta meta={BEARS_PAGE_META.camp} />
      <BearsGameHeader title="Camp Rules" from={from} />
      <main>
        <BearGame from={from} />
      </main>
    </div>
  );
};

export default CampRules;
