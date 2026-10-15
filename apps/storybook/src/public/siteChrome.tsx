import type { Decorator } from '@storybook/react-vite';
import { SitePage } from '@gagnechris/public-ui';
import type { SiteNavHref } from '@gagnechris/shared/site-chrome';
import { YEAR } from './samples';

/** Wraps the story in the site header and footer unless `parameters.siteChrome` is false. */
export const withSiteChrome =
  (current: SiteNavHref | null): Decorator =>
  (Story, { parameters }) =>
    parameters.siteChrome === false ? (
      <Story />
    ) : (
      <SitePage current={current} year={YEAR}>
        <Story />
      </SitePage>
    );
