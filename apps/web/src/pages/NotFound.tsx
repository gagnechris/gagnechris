import { NotFoundBody } from '@gagnechris/public-ui';
import {
  NOT_FOUND_DESCRIPTION,
  NOT_FOUND_TITLE,
} from '@gagnechris/shared/public-pages';
import './NotFound.css';
import PageHead from '../components/PageHead';

function NotFound() {
  return (
    <>
      <PageHead
        title={NOT_FOUND_TITLE}
        url={null}
        description={NOT_FOUND_DESCRIPTION}
      />
      <NotFoundBody />
    </>
  );
}

export default NotFound;
