import { Fragment } from 'react';
import {
  formatPostDate,
  POST_AUTHOR_NOTE,
  POST_PART_OF_LABEL,
  postPartOfSeparator,
  postPartOfSuffix,
  POST_META_SEPARATOR,
  postDateAttribute,
  readingTimeLabel,
} from '@gagnechris/shared';
import SiteLink from '../components/SiteLink';
import type { PostView } from './publishedPost';

const PartOfProject = ({ name, href }: PostView['partOf'][number]) =>
  href ? (
    <SiteLink className="post-part-of__project" href={href}>
      {name}
    </SiteLink>
  ) : (
    <span className="post-part-of__project">{name}</span>
  );

// Markup must stay byte-identical to `renderPostPageBodyHtml`
// (PostArticle.test.tsx). Single-expression text children avoid the `<!-- -->`
// separators React writes between adjacent text nodes.

const PostArticle = ({ post }: { post: PostView }) => {
  const dateLabel = formatPostDate(post.date);
  const dateAttr = postDateAttribute(post.date);
  const { name, role, about, rss } = POST_AUTHOR_NOTE;

  return (
    <div className="post-page">
      <article className="blog-post-prerender" data-slug={post.slug}>
        <header className="post-header">
          <p className="post-meta">
            {dateLabel ? (
              <>
                <time className="post-date" dateTime={dateAttr || undefined}>
                  {dateLabel}
                </time>
                {POST_META_SEPARATOR}
              </>
            ) : null}
            <span className="post-reading-time" data-minutes={post.minutes}>
              {readingTimeLabel(post.minutes)}
            </span>
          </p>
          <h1>{post.title}</h1>
          {post.excerpt ? <p className="post-excerpt">{post.excerpt}</p> : null}
          {post.partOf.length ? (
            <p className="post-part-of">
              {`${POST_PART_OF_LABEL} `}
              {post.partOf.map((project, i) => (
                <Fragment key={i}>
                  {postPartOfSeparator(i, post.partOf.length) || null}
                  <PartOfProject {...project} />
                </Fragment>
              ))}
              {postPartOfSuffix(post.partOf.length)}
            </p>
          ) : null}
        </header>
        <div
          className="post-content blog-post-body"
          dangerouslySetInnerHTML={{ __html: post.contentHtml }}
        />
      </article>
      <aside className="post-author" aria-label="About the author">
        <p>
          <strong>{name}</strong>
          {` ${role} `}
          <SiteLink href={about.href}>{about.label}</SiteLink>
          {', or follow along via '}
          <SiteLink href={rss.href} spa={false}>
            {rss.label}
          </SiteLink>
          .
        </p>
      </aside>
    </div>
  );
};

export default PostArticle;
