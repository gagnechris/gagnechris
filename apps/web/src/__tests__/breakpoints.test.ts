import { describe, expect, it } from 'vitest';
import { breakpoint } from '@gagnechris/tokens';
import { PHONE_QUERY } from '../kit/useMediaQuery';
import { NOTEBOOK_DEMO_PHONE_QUERY } from '../demos/notebook';

describe('media queries in TS', () => {
  it('use the token widths their stylesheets break at', () => {
    expect(PHONE_QUERY).toBe(`(max-width: ${breakpoint.tabBar}px)`);
    expect(NOTEBOOK_DEMO_PHONE_QUERY).toBe(
      `(max-width: ${breakpoint.demoStack}px)`,
    );
  });
});
