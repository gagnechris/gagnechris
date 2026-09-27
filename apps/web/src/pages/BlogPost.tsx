import { Link, useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { parseFrontmatter } from '../utils/frontmatter';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import NotFound from './NotFound';
import './BlogPost.css';

interface PostData {
  title: string;
  date: string;
  excerpt: string;
  /** Markdown source, or HTML when loaded from publisher prerender. */
  content: string;
  contentFormat: 'markdown' | 'html';
}

/** Load a CMS-published post from Option B static HTML (`blog/<slug>/index.html`). */
async function loadPublishedPost(slug: string): Promise<PostData | null> {
  // Local Vite: fetch via /__site → static origin (keeps /blog on the SPA + HMR).
  // Prod / preview: same-origin publisher HTML at /blog/<slug>/.
  const localSite = import.meta.env.VITE_LOCAL_SITE_ORIGIN?.trim()
  const url = localSite ? `/__site/blog/${slug}/` : `/blog/${slug}/`
  const response = await fetch(url, {
    headers: { Accept: 'text/html' },
  });
  if (!response.ok) return null;

  const html = await response.text();
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const article = doc.querySelector('article.blog-post-prerender');
  if (!article) return null;

  const title =
    article.querySelector('header h1')?.textContent?.trim() ||
    doc.querySelector('title')?.textContent?.replace(/\s*-\s*Chris Gagne\s*$/, '').trim() ||
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
    excerpt: '',
    content: body.innerHTML,
    contentFormat: 'html',
  };
}

function formatPostDate(date: string): string {
  if (!date) return '';
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function BlogPost() {
  const { slug } = useParams<{ slug: string }>();
  const [post, setPost] = useState<PostData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadPost = async () => {
      if (!slug) {
        setError('Blog post not found');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        // Bundled markdown (legacy / welcome posts)
        const postModules = import.meta.glob('../posts/*.md', {
          eager: true,
          query: '?raw',
          import: 'default',
        }) as Record<string, string>;

        for (const path in postModules) {
          const content = postModules[path];
          const { data, content: markdownContent } = parseFrontmatter(content);

          if (data.slug === slug) {
            setPost({
              title: data.title || 'Untitled',
              date: data.date || '',
              excerpt: data.excerpt || '',
              content: markdownContent,
              contentFormat: 'markdown',
            });
            return;
          }
        }

        // Publisher Option B static page (CMS posts)
        const published = await loadPublishedPost(slug);
        if (published) {
          setPost(published);
          return;
        }

        setError('Blog post not found');
      } catch (err) {
        setError('Error loading blog post');
        console.error('Error details:', err);
      } finally {
        setLoading(false);
      }
    };

    void loadPost();
  }, [slug]);

  if (loading) {
    return (
      <div className="blog-post">
        <header>
          <Link to="/blog" className="back-link">← Back to Blog</Link>
          <Link to="/" className="home-link">Back to Home</Link>
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

  return (
    <div className="blog-post">
      <title>{`${post.title} - Chris Gagne`}</title>
      <link rel="canonical" href={`https://gagnechris.com/blog/${slug}`} />
      <header>
        <Link to="/blog" className="back-link">← Back to Blog</Link>
        <Link to="/" className="home-link">Back to Home</Link>
      </header>
      <article>
        <h1>{post.title}</h1>
        {dateLabel ? <time className="post-date">{dateLabel}</time> : null}
        <div className="post-content">
          {post.contentFormat === 'html' ? (
            <div dangerouslySetInnerHTML={{ __html: post.content }} />
          ) : (
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {post.content}
            </ReactMarkdown>
          )}
        </div>
      </article>
      <footer>
        <Link to="/blog" className="back-link-footer">← Back to Blog</Link>
      </footer>
    </div>
  );
}

export default BlogPost;
