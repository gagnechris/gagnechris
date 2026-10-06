import { siteUrl } from '@gagnechris/shared/site-config';
import PageHead from '../../../components/PageHead';
import type { BearsPageMetaEntry } from './pageMeta';

type BearsPageMetaProps = {
  meta: BearsPageMetaEntry;
};

const BearsPageMeta = ({ meta }: BearsPageMetaProps) => (
  <PageHead
    title={meta.title}
    url={siteUrl(`/${meta.routePath}`)}
    description={meta.description}
    image={siteUrl(meta.ogImagePath)}
  />
);

export default BearsPageMeta;
