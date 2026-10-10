import { siteUrl } from '@gagnechris/shared';
import { HomeBody } from '@gagnechris/public-ui';
import {
  documentHome,
  fallbackHomeView,
  loadPublishedHome,
  loadRecentPosts,
} from './home/publishedHome';
import { usePublishedView } from './prerender/usePublishedView';
import './App.css';
import './home/homeSections.css';
import './projects/ProjectCard.css';
import './projects/ProjectStage.css';
import './projects/ProjectPreview.css';
import PageHead from './components/PageHead';

const documentRecentPosts = () => documentHome()?.recentPosts ?? null;

function App() {
  // Without a published home the bundled default shows, so it never blanks.
  const published = usePublishedView('home', documentHome, loadPublishedHome);
  const recent = usePublishedView('home', documentRecentPosts, loadRecentPosts);
  const home = published.status === 'ready' ? published.view : null;
  const { name, title, aboutHtml, headTitle } = home ?? fallbackHomeView();

  return (
    <>
      <PageHead title={headTitle} url={siteUrl('/')} />
      <HomeBody
        name={name}
        title={title}
        aboutHtml={aboutHtml}
        recentPosts={recent.status === 'ready' ? recent.view : []}
        projects={home?.projects ?? []}
      />
    </>
  );
}

export default App;
