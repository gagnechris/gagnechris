import { NotFoundBody } from '@gagnechris/public-ui';
import { NOT_FOUND_TITLE } from '@gagnechris/shared/public-pages';
import './NotFound.css';
import PageHead from '../components/PageHead';

function NotFound() {
  return (
    <>
      <PageHead title={NOT_FOUND_TITLE} url={null} />
      <NotFoundBody />
    </>
  );
}

export default NotFound;
