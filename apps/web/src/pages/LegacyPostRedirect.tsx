import { Navigate, useParams } from 'react-router-dom';

/** `/blog/:slug` → `/posts/:slug` for local dev; CloudFront 301s in prod (CHR-206). */
const LegacyPostRedirect = () => {
  const { slug = '' } = useParams<{ slug: string }>();
  return <Navigate to={`/posts/${slug}`} replace />;
};

export default LegacyPostRedirect;
