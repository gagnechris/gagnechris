import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { parseFrontmatter } from '../utils/frontmatter';
import './BlogIndex.css';

interface BlogPost {
  slug: string;
  title: string;
  date: string;
  excerpt: string;
}

function BlogIndex() {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadPosts = async () => {
      try {
        // Use Vite's import.meta.glob to load all markdown files eagerly
        const postModules = import.meta.glob('../posts/*.md', { eager: true, query: '?raw', import: 'default' }) as Record<string, string>;
        const loadedPosts: BlogPost[] = [];

        console.log('Found post modules:', Object.keys(postModules));

        for (const path in postModules) {
          const content = postModules[path];
          console.log('Loaded content for', path, typeof content);
          const { data } = parseFrontmatter(content);

          loadedPosts.push({
            slug: data.slug || '',
            title: data.title || 'Untitled',
            date: data.date || '',
            excerpt: data.excerpt || '',
          });
        }

        // Sort posts by date (newest first)
        loadedPosts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        console.log('Loaded posts:', loadedPosts);
        setPosts(loadedPosts);
      } catch (error) {
        console.error('Error loading posts:', error);
      } finally {
        setLoading(false);
      }
    };

    loadPosts();
  }, []);

  if (loading) {
    return (
      <div className="blog-index">
        <Helmet>
          <title>Blog - Chris Gagne</title>
        </Helmet>
        <header>
          <h1>Blog</h1>
          <Link to="/" className="back-link">Back to Home</Link>
        </header>
        <main>
          <p>Loading posts...</p>
        </main>
      </div>
    );
  }

  return (
    <div className="blog-index">
      <Helmet>
        <title>Blog - Chris Gagne</title>
        <meta
          name="description"
          content="Read Chris Gagne's insights on software engineering, leadership, and technology trends."
        />
        <meta property="og:title" content="Blog - Chris Gagne" />
        <meta
          property="og:description"
          content="Read Chris Gagne's insights on software engineering, leadership, and technology trends."
        />
        <meta property="og:url" content="https://gagnechris.com/blog" />
        <link rel="canonical" href="https://gagnechris.com/blog" />
      </Helmet>
      <header>
        <h1>Blog</h1>
        <Link to="/" className="back-link">Back to Home</Link>
      </header>
      <main>
        {posts.length === 0 ? (
          <p>No blog posts yet. Check back soon!</p>
        ) : (
          <div className="posts-list">
            {posts.map((post) => (
              <article key={post.slug} className="post-preview">
                <h2>
                  <Link to={`/blog/${post.slug}`}>{post.title}</Link>
                </h2>
                <time className="post-date">
                  {new Date(post.date).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </time>
                <p className="post-excerpt">{post.excerpt}</p>
                <Link to={`/blog/${post.slug}`} className="read-more">
                  Read more →
                </Link>
              </article>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

export default BlogIndex;
