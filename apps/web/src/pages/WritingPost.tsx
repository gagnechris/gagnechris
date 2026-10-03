import { Link, useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { formatPostDate, postDateAttribute } from '@gagnechris/shared';
import { publishedPostPageUrl } from '../writing/publishedPosts';
import PublicNav from '../components/PublicNav';
import NotFound from './NotFound';
import './WritingPost.css';

interface PostData {
  title: string;
  date: string;
  /** HTML from publisher prerender (shared markdown → HTML). */
  contentHtml: string;
}

/** Load a CMS-published post from Option B static HTML (`blog/<slug>/index.html`). */
async function loadPublishedPost(slug: string): Promise<PostData | null> {
  const response = await fetch(publishedPostPageUrl(slug), {
    headers: { Accept: 'text/html' },
  });
  if (!response.ok) return null;

  const html = await response.text();
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const article = doc.querySelector('article.blog-post-prerender');
  if (!article) return null;

  const title =
    article.querySelector('header h1')?.textContent?.trim() ||
    doc
      .querySelector('title')
      ?.textContent?.replace(/\s*-\s*Chris Gagne\s*$/, '')
      .trim() ||
    'Untitled';
  const date =
    article.querySelector('time')?.getAttribute('datetime') ||
    article.querySelector('time')?.textContent?.trim() ||
    '';
  const body = article.querySelector('.blog-post-body');
  if (!body) return null;

  return {
    title,
    date,
    contentHtml: body.innerHTML,
  };
}

function WritingPost() {
  const { slug } = useParams<{ slug: string }>();
  const [post, setPost] = useState<PostData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadPost = async () => {
      if (!slug?.trim()) {
        setError('Post not found');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const published = await loadPublishedPost(slug);
        if (published) {
          setPost(published);
          return;
        }

        setError('Post not found');
        setPost(null);
      } catch (err) {
        setError('Error loading post');
        setPost(null);
        console.error('Error details:', err);
      } finally {
        setLoading(false);
      }
    };

    void loadPost();
  }, [slug]);

  if (loading) {
    return (
      <div className="writing-post">
        <header>
          <Link to="/writing" className="back-link">
            ← Back to Writing
          </Link>
          <PublicNav current="/writing" />
        </header>
        <main>
          <p>Loading post...</p>
        </main>
      </div>
    );
  }

  if (error || !post) {
    return <NotFound />;
  }

  const dateLabel = formatPostDate(post.date);
  const dateAttr = postDateAttribute(post.date);

  return (
    <div className="writing-post">
      <title>{`${post.title} - Chris Gagne`}</title>
      <link rel="canonical" href={`https://gagnechris.com/writing/${slug}`} />
      <link
        rel="alternate"
        type="application/rss+xml"
        title="Chris Gagne"
        href="/rss.xml"
      />
      <header>
        <Link to="/writing" className="back-link">
          ← Back to Writing
        </Link>
        <PublicNav current="/writing" />
      </header>
      <article>
        <h1>{post.title}</h1>
        {dateLabel ? (
          <time className="post-date" dateTime={dateAttr || undefined}>
            {dateLabel}
          </time>
        ) : null}
        <div
          className="post-content"
          dangerouslySetInnerHTML={{ __html: post.contentHtml }}
        />
      </article>
      <footer>
        <Link to="/writing" className="back-link-footer">
          ← Back to Writing
        </Link>
      </footer>
    </div>
  );
}

export default WritingPost;
