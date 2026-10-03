import { Link } from 'react-router-dom';
import { BEARS_LANDING_PATH, withFrom } from '../../games/bears/shared/routes';

type BearsGameHeaderProps = {
  title: string;
  from: string;
};

const BearsGameHeader = ({ title, from }: BearsGameHeaderProps) => (
  <header className="bears-game-page__header">
    <Link
      to={withFrom(BEARS_LANDING_PATH, from)}
      className="bears-game-page__back"
    >
      Don’t Feed the Bears
    </Link>
    <h1>{title}</h1>
  </header>
);

export default BearsGameHeader;
