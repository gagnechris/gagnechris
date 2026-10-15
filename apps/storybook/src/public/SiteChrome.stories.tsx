import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  SiteFooter,
  SiteHeader,
  SiteMenu,
  SitePage,
} from '@gagnechris/public-ui';
import { SITE_NAV_LINKS } from '@gagnechris/shared/site-chrome';
import '@web/public.css';
import { catalog } from '../catalog';
import { YEAR } from './samples';

const meta = {
  title: 'Public site/SiteChrome',
  component: SitePage,
  parameters: {
    layout: 'fullscreen',
    ...catalog(
      'none: the tab bar in `apps/mobile/app/site/_layout.tsx` (`SpaceTabs`) replaces the header, nav and footer',
      'The public site’s header with the primary nav and phone menu, and the footer, around one page body. `SitePage` is everything inside `#root`.',
    ),
  },
  args: { current: null, year: YEAR },
  argTypes: {
    current: {
      control: 'select',
      options: [null, ...SITE_NAV_LINKS.map((link) => link.href)],
    },
  },
} satisfies Meta<typeof SitePage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Page: Story = {
  args: {
    current: '/posts',
    children: (
      <main className="posts-index">
        <h1>Page body</h1>
        <p>The page’s own content sits between the header and the footer.</p>
      </main>
    ),
  },
};

export const Header: Story = {
  render: ({ current }) => <SiteHeader current={current} />,
};

export const HeaderOnResume: Story = {
  args: { current: '/resume' },
  render: ({ current }) => <SiteHeader current={current} />,
};

export const Footer: Story = {
  render: ({ year }) => <SiteFooter year={year} />,
};

const phone = { viewport: { value: 'mobile1', isRotated: false } };

export const PhoneMenuClosed: Story = {
  args: { current: '/posts' },
  globals: phone,
  render: ({ current }) => <SiteHeader current={current} />,
};

export const PhoneMenuOpen: Story = {
  args: { current: '/posts' },
  globals: phone,
  render: ({ current }) => (
    <SiteHeader current={current} menu={<SiteMenu current={current} open />} />
  ),
};
