import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { BEARS_LANDING_PATH, withFrom } from '../../games/bears/shared/routes';
import { useBearsPhone } from '../../games/bears/shared/useMediaQuery';

type BearsGameHeaderProps = {
  title: string;
  from: string;
  actions?: ReactNode;
  /** Beside the title on phones only. */
  aside?: ReactNode;
};

const BearsGameHeader = ({
  title,
  from,
  actions,
  aside,
}: BearsGameHeaderProps) => {
  const phone = useBearsPhone();
  return (
    <header className="bears-game-page__header">
      <div className="bears-game-page__heading">
        <Link
          to={withFrom(BEARS_LANDING_PATH, from)}
          className="bears-game-page__back"
        >
          <span aria-hidden="true" className="bears-arrow">
            ←
          </span>
          <span className="bears-game-page__back-label">
            Don’t Feed the Bears
          </span>
        </Link>
        {aside && phone ? (
          <div className="bears-game-page__title-row">
            <h1>{title}</h1>
            <p className="bears-game-page__aside">{aside}</p>
          </div>
        ) : (
          <h1>{title}</h1>
        )}
      </div>
      {actions ? (
        <div className="bears-game-page__actions">{actions}</div>
      ) : null}
    </header>
  );
};

export default BearsGameHeader;
