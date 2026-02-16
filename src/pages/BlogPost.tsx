import { Link, useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { parseFrontmatter } from '../utils/frontmatter';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import './BlogPost.css';

interface PostData {
  title: string;
  date: string;
  excerpt: string;
  content: string;
}

function BlogPost() {
  const { slug } = useParams<{ slug: string }>();
  const [post, setPost] = useState<PostData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadPost = async () => {
      try {
        setLoading(true);
        setError(null);

        // Load all markdown files eagerly to find the one with matching slug
        const postModules = import.meta.glob('../posts/*.md', { eager: true, query: '?raw', import: 'default' }) as Record<string, string>;

        console.log('Looking for post with slug:', slug);
        console.log('Available modules:', Object.keys(postModules));

        let foundPost = false;
        for (const path in postModules) {
          const content = postModules[path];
          console.log('Loaded content from', path, typeof content);
          const { data, content: markdownContent } = parseFrontmatter(content);

          console.log('Post slug:', data.slug);
          if (data.slug === slug) {
            setPost({
              title: data.title || 'Untitled',
              date: data.date || '',
              excerpt: data.excerpt || '',
              content: markdownContent,
            });
            foundPost = true;
            break;
          }
        }

        if (!foundPost) {
          setError('Blog post not found');
        }
      } catch (err) {
        setError('Error loading blog post');
        console.error('Error details:', err);
      } finally {
        setLoading(false);
      }
    };

    loadPost();
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
    return (
      <div className="blog-post">
        <header>
          <Link to="/blog" className="back-link">← Back to Blog</Link>
          <Link to="/" className="home-link">Back to Home</Link>
        </header>
        <main>
          <h1>Post Not Found</h1>
          <p>{error || 'The blog post you are looking for does not exist.'}</p>
        </main>
      </div>
    );
  }

  return (
    <div className="blog-post">
      <Helmet>
        <title>{post.title} - Chris Gagne</title>
        <meta name="description" content={post.excerpt} />
        <meta property="og:title" content={`${post.title} - Chris Gagne`} />
        <meta property="og:description" content={post.excerpt} />
        <meta property="og:type" content="article" />
        <meta property="og:url" content={`https://gagnechris.com/blog/${slug}`} />
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content={`${post.title} - Chris Gagne`} />
        <meta name="twitter:description" content={post.excerpt} />
        <link rel="canonical" href={`https://gagnechris.com/blog/${slug}`} />
      </Helmet>
      <header>
        <Link to="/blog" className="back-link">← Back to Blog</Link>
        <Link to="/" className="home-link">Back to Home</Link>
      </header>
      <article>
        <h1>{post.title}</h1>
        <time className="post-date">
          {new Date(post.date).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
        </time>
        <div className="post-content">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {post.content}
          </ReactMarkdown>
        </div>
      </article>
      <footer>
        <Link to="/blog" className="back-link-footer">← Back to Blog</Link>
      </footer>
    </div>
  );
}

export default BlogPost;
