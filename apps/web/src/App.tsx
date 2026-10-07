import {
  formatPostDate,
  postDateAttribute,
  PROJECTS_PATH,
  siteUrl,
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
import {
  documentHome,
  fallbackHomeView,
  loadPublishedHome,
  loadRecentPosts,
} from './home/publishedHome';
import { usePublishedView } from './prerender/usePublishedView';
import ProjectCard from './projects/ProjectCard';
import SiteLink from './components/SiteLink';
import './App.css';
import './home/homeSections.css';
import PageHead from './components/PageHead';

// Markup must match `renderHomeBodyHtml` element for element (App.test.tsx).

const HeroLink = ({ link }: { link: HomeLink }) => (
  <SiteLink
    href={link.href}
    spa={link.kind === 'spa'}
    newTab={link.kind === 'external'}
    trackId={link.trackId}
  >
    {link.label}
  </SiteLink>
);

const RecentPost = ({ post }: { post: HomeRecentPost }) => {
  const date = formatPostDate(post.publishedAt);
  return (
    <li className="home-post" data-id={post.id}>
      <h3 className="home-post__title">
        <SiteLink href={homePostHref(post.slug)}>{post.title}</SiteLink>
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
        <SiteLink className="home-section__more" href="/posts">
          {HOME_ALL_POSTS_LABEL}
        </SiteLink>
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
        <SiteLink className="home-section__more" href={PROJECTS_PATH}>
          {HOME_ALL_PROJECTS_LABEL}
        </SiteLink>
      </div>
      <ul className="project-list project-list--home">
        {projects.map((card) => (
          <ProjectCard key={card.id} card={card} heading="h3" />
        ))}
      </ul>
    </section>
  );

const documentRecentPosts = () => documentHome()?.recentPosts ?? null;

function App() {
  // Without a published home the bundled default shows, so it never blanks.
  const published = usePublishedView('home', documentHome, loadPublishedHome);
  const recent = usePublishedView('home', documentRecentPosts, loadRecentPosts);
  const home = published.status === 'ready' ? published.view : null;
  const { name, title, aboutHtml, headTitle } = home ?? fallbackHomeView();
  const projects = home?.projects ?? [];
  const recentPosts = recent.status === 'ready' ? recent.view : [];

  return (
    <main
      className="home-page home-page-prerender"
      data-name={name}
      data-title={title}
    >
      <PageHead title={headTitle} url={siteUrl('/')} />
      <header className="home-hero">
        <h1 className="home-hero__name">{name}</h1>
        <p className="home-hero__title">{title}</p>
        <div
          className="home-hero__about"
          dangerouslySetInnerHTML={{ __html: aboutHtml }}
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
