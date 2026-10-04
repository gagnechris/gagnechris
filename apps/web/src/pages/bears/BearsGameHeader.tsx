import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { BEARS_LANDING_PATH, withFrom } from '../../games/bears/shared/routes';

type BearsGameHeaderProps = {
  title: string;
  from: string;
  actions?: ReactNode;
};

const BearsGameHeader = ({ title, from, actions }: BearsGameHeaderProps) => (
  <header className="bears-game-page__header">
    <div>
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
      <h1>{title}</h1>
    </div>
    {actions ? <div className="bears-game-page__actions">{actions}</div> : null}
  </header>
);

export default BearsGameHeader;
