import type { Meta, StoryObj } from '@storybook/react-vite';
import { PostArticle, PostContent, PostPageBody } from '@gagnechris/public-ui';
import { EVERY_MARKDOWN_ELEMENT } from '@gagnechris/shared/fixtures/every-markdown-element';
import { postArticleView } from '@gagnechris/shared/render';
import '@web/public.css';
import '@web/pages/PostPage.css';
import { catalog } from '../catalog';
import { withSiteChrome } from './siteChrome';
import { placeholderImage, SAMPLE_POST } from './samples';

const FIXTURE_IMAGE = 'https://gagnechris.com/og-image.jpg';

// The sanitizer keeps only http(s) images, so the placeholder goes in after rendering.
const everyElement = postArticleView({
  ...SAMPLE_POST,
  slug: 'every-markdown-element',
  title: 'Every markdown element',
  excerpt:
    'Each element the post editor can produce, as the post page shows it.',
  bodyMarkdown: EVERY_MARKDOWN_ELEMENT,
});
everyElement.contentHtml = everyElement.contentHtml.replace(
  FIXTURE_IMAGE,
  placeholderImage('A view of the site'),
);

const meta = {
  title: 'Public site/PostPageBody',
  component: PostPageBody,
  parameters: {
    layout: 'fullscreen',
    ...catalog(
      '`apps/mobile/app/site/posts/[slug].tsx` (body rendered natively by `MarkdownView`)',
      'A published post: date and reading time, title, excerpt, the projects it belongs to, the sanitized body and the author note.',
    ),
  },
  decorators: [withSiteChrome('/posts')],
  args: { post: postArticleView(SAMPLE_POST) },
} satisfies Meta<typeof PostPageBody>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const PartOfProjects: Story = {
  args: {
    post: postArticleView(SAMPLE_POST, [
      { name: 'Posts', href: '/projects/posts' },
      { name: 'Notebook', href: '/projects/notebook' },
    ]),
  },
};

export const PartOfUnlinkedProject: Story = {
  args: {
    post: postArticleView(SAMPLE_POST, [{ name: 'Next project', href: null }]),
  },
};

export const EveryMarkdownElement: Story = { args: { post: everyElement } };

export const NoDateOrExcerpt: Story = {
  args: {
    post: postArticleView({ ...SAMPLE_POST, excerpt: '', publishedAt: null }),
  },
};

export const ArticleEmbed: Story = {
  parameters: { layout: 'padded', siteChrome: false },
  render: ({ post }) => <PostArticle post={post} headingLevel={2} />,
};

export const ContentOnly: Story = {
  parameters: { layout: 'padded', siteChrome: false },
  render: () => <PostContent html={everyElement.contentHtml} />,
};
