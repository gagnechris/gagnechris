import PageHead from '../../../components/PageHead';
import type { BearsPageMetaEntry } from './pageMeta';

const APEX = 'https://gagnechris.com';

type BearsPageMetaProps = {
  meta: BearsPageMetaEntry;
};

const BearsPageMeta = ({ meta }: BearsPageMetaProps) => (
  <PageHead
    title={meta.title}
    url={`${APEX}/${meta.routePath}`}
    description={meta.description}
    image={`${APEX}${meta.ogImagePath}`}
  />
);

export default BearsPageMeta;
