import { Link, useSearchParams } from 'react-router-dom';
import BearsPageMeta from '../../games/bears/shared/BearsPageMeta';
import SkipToTips from '../../games/bears/shared/SkipToTips';
import { BEARS_PAGE_META } from '../../games/bears/shared/pageMeta';
import {
  BEARS_GAME_PATHS,
  bearsFromParam,
  withFrom,
} from '../../games/bears/shared/routes';
import BearsGameHeader from './BearsGameHeader';
import '../../games/bears/shared/bears-shared.css';
import './BearsGamePage.css';

const StayWild = () => {
  const [searchParams] = useSearchParams();
  const from = bearsFromParam(searchParams);

  return (
    <div className="bears-game-page">
      <BearsPageMeta meta={BEARS_PAGE_META.wild} />
      <BearsGameHeader title="Stay Wild" from={from} />
      <main className="bears-game-page__soon">
        <p className="bears-game-page__soon-lede">
          Maple is still asleep in her den. Stay Wild, where you play as the
          bear, is coming soon.
        </p>
        <div className="bears-game-page__actions">
          <Link
            to={withFrom(BEARS_GAME_PATHS.camp, from)}
            className="bears-btn bears-btn--primary"
          >
            Play as the camper
          </Link>
          <SkipToTips from={from} />
        </div>
      </main>
    </div>
  );
};

export default StayWild;
