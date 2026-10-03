import type { BearsPageMetaEntry } from './pageMeta';

const APEX = 'https://gagnechris.com';

type BearsPageMetaProps = {
  meta: BearsPageMetaEntry;
};

const BearsPageMeta = ({ meta }: BearsPageMetaProps) => {
  const url = `${APEX}/${meta.routePath}`;
  const image = `${APEX}${meta.ogImagePath}`;
  return (
    <>
      <title>{meta.title}</title>
      <meta name="description" content={meta.description} />
      <link rel="canonical" href={url} />
      <meta property="og:title" content={meta.title} />
      <meta property="og:description" content={meta.description} />
      <meta property="og:type" content="website" />
      <meta property="og:url" content={url} />
      <meta property="og:image" content={image} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={meta.title} />
      <meta name="twitter:description" content={meta.description} />
      <meta name="twitter:image" content={image} />
    </>
  );
};

export default BearsPageMeta;
