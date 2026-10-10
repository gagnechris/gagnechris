/** @jsxRuntime automatic */
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
import { PublicLink } from '../link.js';
import { ProjectCard } from '../projects/ProjectCard.js';

const HeroLink = ({ link }: { link: HomeLink }) => (
  <PublicLink
    href={link.href}
    spa={link.kind === 'spa'}
    newTab={link.kind === 'external'}
    trackId={link.trackId}
  >
    {link.label}
  </PublicLink>
);

const RecentPost = ({ post }: { post: HomeRecentPost }) => {
  const date = formatPostDate(post.publishedAt);
  return (
    <li className="home-post" data-id={post.id}>
      <h3 className="home-post__title">
        <PublicLink href={homePostHref(post.slug)}>{post.title}</PublicLink>
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

/** Nothing when there are no posts: the section has no empty state. */
export const HomeRecentPosts = ({
  posts,
}: {
  posts: readonly HomeRecentPost[];
}) =>
  posts.length === 0 ? null : (
    <section
      className="home-section"
      aria-labelledby={HOME_RECENT_POSTS_HEADING_ID}
    >
      <div className="home-section__head">
        <h2 className="home-section__label" id={HOME_RECENT_POSTS_HEADING_ID}>
          {HOME_RECENT_POSTS_HEADING}
        </h2>
        <PublicLink className="home-section__more" href="/posts">
          {HOME_ALL_POSTS_LABEL}
        </PublicLink>
      </div>
      <ul className="home-posts">
        {posts.map((post) => (
          <RecentPost key={post.id} post={post} />
        ))}
      </ul>
    </section>
  );

/** Nothing when only ideas are published. */
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
        <PublicLink className="home-section__more" href={PROJECTS_PATH}>
          {HOME_ALL_PROJECTS_LABEL}
        </PublicLink>
      </div>
      <ul className="project-list project-list--home">
        {projects.map((card) => (
          <ProjectCard key={card.id} card={card} heading="h3" />
        ))}
      </ul>
    </section>
  );

export type HomeBodyProps = {
  name: string;
  title: string;
  /** Escaped paragraphs from `renderHomeAboutHtml`. */
  aboutHtml: string;
  recentPosts: readonly HomeRecentPost[];
  projects: readonly ProjectCardView[];
};

/**
 * `home-page-prerender` and the data attributes are what the app reads back
 * on a cold load (`homeDocumentFromRoot`).
 */
export const HomeBody = ({
  name,
  title,
  aboutHtml,
  recentPosts,
  projects,
}: HomeBodyProps) => (
  <main
    className="home-page home-page-prerender"
    data-name={name}
    data-title={title}
  >
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
    <HomeRecentPosts posts={recentPosts} />
    <HomeProjects projects={projects} />
  </main>
);
