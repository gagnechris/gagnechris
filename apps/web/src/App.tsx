import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import {
  formatPostDate,
  postDateAttribute,
  PROJECTS_PATH,
  type ProjectCardView,
} from '@gagnechris/shared';
import {
  HOME_ALL_POSTS_LABEL,
  HOME_ALL_PROJECTS_LABEL,
  HOME_LINKS_SENTENCE,
  HOME_PROJECTS_HEADING,
  HOME_PROJECTS_HEADING_ID,
  HOME_RECENT_POSTS_HEADING,
  HOME_RECENT_POSTS_HEADING_ID,
  homePostHref,
  type HomeLink,
  type HomeRecentPost,
} from '@gagnechris/shared/render';
import { trackEvent } from './utils/analytics';
import {
  documentHome,
  fallbackHomeView,
  loadPublishedHome,
  loadRecentPosts,
  type HomeView,
} from './home/publishedHome';
import ProjectCard from './projects/ProjectCard';
import './App.css';
import PageHead from './components/PageHead';

// Markup must match `renderHomeBodyHtml` element for element (App.test.tsx).

const HeroLink = ({ link }: { link: HomeLink }) => {
  if (link.kind === 'spa') {
    return (
      <Link to={link.href} discover="none">
        {link.label}
      </Link>
    );
  }
  const trackId = link.trackId;
  return (
    <a
      href={link.href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={
        trackId
          ? () => trackEvent('click', 'external_link', trackId)
          : undefined
      }
    >
      {link.label}
    </a>
  );
};

const RecentPost = ({ post }: { post: HomeRecentPost }) => {
  const date = formatPostDate(post.publishedAt);
  return (
    <li className="home-post" data-id={post.id}>
      <h3 className="home-post__title">
        <Link to={homePostHref(post.slug)} discover="none">
          {post.title}
        </Link>
      </h3>
      {post.excerpt ? (
        <p className="home-post__excerpt">{post.excerpt}</p>
      ) : null}
      {date ? (
        <time
          className="home-post__date"
          dateTime={postDateAttribute(post.publishedAt) || undefined}
        >
          {date}
        </time>
      ) : null}
    </li>
  );
};

const RecentPosts = ({ posts }: { posts: readonly HomeRecentPost[] }) =>
  posts.length === 0 ? null : (
    <section
      className="home-section"
      aria-labelledby={HOME_RECENT_POSTS_HEADING_ID}
    >
      <div className="home-section__head">
        <h2 className="home-section__label" id={HOME_RECENT_POSTS_HEADING_ID}>
          {HOME_RECENT_POSTS_HEADING}
        </h2>
        <Link className="home-section__more" to="/posts" discover="none">
          {HOME_ALL_POSTS_LABEL}
        </Link>
      </div>
      <ul className="home-posts">
        {posts.map((post) => (
          <RecentPost key={post.id} post={post} />
        ))}
      </ul>
    </section>
  );

const HomeProjects = ({
  projects,
}: {
  projects: readonly ProjectCardView[];
}) =>
  projects.length === 0 ? null : (
    <section
      className="home-section"
      aria-labelledby={HOME_PROJECTS_HEADING_ID}
    >
      <div className="home-section__head">
        <h2 className="home-section__label" id={HOME_PROJECTS_HEADING_ID}>
          {HOME_PROJECTS_HEADING}
        </h2>
        <Link className="home-section__more" to={PROJECTS_PATH} discover="none">
          {HOME_ALL_PROJECTS_LABEL}
        </Link>
      </div>
      <ul className="project-list project-list--home">
        {projects.map((card) => (
          <ProjectCard key={card.id} card={card} heading="h3" />
        ))}
      </ul>
    </section>
  );

function App() {
  const [home, setHome] = useState<HomeView>(
    () => documentHome() ?? fallbackHomeView(),
  );
  const [recentPosts, setRecentPosts] = useState<HomeRecentPost[]>(
    () => documentHome()?.recentPosts ?? [],
  );
  const [projects, setProjects] = useState<ProjectCardView[]>(
    () => documentHome()?.projects ?? [],
  );

  useEffect(() => {
    // A cold load on `/` already parsed the prerender out of the document.
    if (documentHome()) return;
    let cancelled = false;
    void loadPublishedHome()
      .then((published) => {
        if (published && !cancelled) {
          setHome({
            name: published.name,
            title: published.title,
            aboutHtml: published.aboutHtml,
            headTitle: published.headTitle,
          });
          setProjects(published.projects);
        }
      })
      .catch(() => {
        /* fall back to the bundled default content */
      });
    void loadRecentPosts()
      .then((posts) => {
        if (!cancelled) setRecentPosts(posts);
      })
      .catch(() => {
        /* no Recent posts section */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main
      className="home-page home-page-prerender"
      data-name={home.name}
      data-title={home.title}
    >
      <PageHead title={home.headTitle} url="https://gagnechris.com" />
      <header className="home-hero">
        <h1 className="home-hero__name">{home.name}</h1>
        <p className="home-hero__title">{home.title}</p>
        <div
          className="home-hero__about"
          dangerouslySetInnerHTML={{ __html: home.aboutHtml }}
        />
        <p className="home-hero__links">
          {HOME_LINKS_SENTENCE.map((segment, i) =>
            typeof segment === 'string' ? (
              segment
            ) : (
              <HeroLink key={i} link={segment} />
            ),
          )}
        </p>
      </header>
      <RecentPosts posts={recentPosts} />
      <HomeProjects projects={projects} />
    </main>
  );
}

export default App;
