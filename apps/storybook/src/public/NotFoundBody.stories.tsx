import type { Meta, StoryObj } from '@storybook/react-vite';
import { NotFoundBody } from '@gagnechris/public-ui';
import '@web/public.css';
import '@web/pages/NotFound.css';
import { catalog } from '../catalog';
import { withSiteChrome } from './siteChrome';

const meta = {
  title: 'Public site/NotFoundBody',
  component: NotFoundBody,
  parameters: {
    layout: 'fullscreen',
    ...catalog(
      '`LoadError` in `apps/mobile/src/site/ui.tsx` is the closest; a missing post shows a "Post not found" empty state in `apps/mobile/app/site/posts/[slug].tsx`',
      'The 404 page: what happened, links back into the site and the bears game.',
    ),
  },
  decorators: [withSiteChrome(null)],
} satisfies Meta<typeof NotFoundBody>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
