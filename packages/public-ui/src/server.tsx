/** @jsxRuntime automatic */
import { renderToString } from 'react-dom/server';
import { postsIndexView, type PostsIndexItem } from '@gagnechris/shared';
import { PostsIndexBody } from './posts/PostsIndexBody.js';

// `renderToString`, not static markup: it marks adjacent text nodes, which
// hydration needs to match them one to one.
export const renderPostsIndexBodyHtml = (
  posts: readonly PostsIndexItem[],
): string => renderToString(<PostsIndexBody years={postsIndexView(posts)} />);
