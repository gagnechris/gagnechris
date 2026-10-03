import { Link } from 'react-router-dom';
import { BEARS_LANDING_PATH, withFrom } from './routes';

type SkipToTipsProps = {
  from: string;
};

const SkipToTips = ({ from }: SkipToTipsProps) => (
  <Link
    to={withFrom(BEARS_LANDING_PATH, from, 'tips')}
    className="bears-btn bears-btn--ghost"
  >
    Skip to the bear tips
  </Link>
);

export default SkipToTips;
