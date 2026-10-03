import { Navigate, useParams } from 'react-router-dom';

/** `/blog/:slug` → `/writing/:slug` for local dev; CloudFront 301s in prod (CHR-206). */
const LegacyPostRedirect = () => {
  const { slug = '' } = useParams<{ slug: string }>();
  return <Navigate to={`/writing/${slug}`} replace />;
};

export default LegacyPostRedirect;
