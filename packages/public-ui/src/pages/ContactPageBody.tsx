/** @jsxRuntime automatic */
import type { ReactNode } from 'react';
import {
  CONTACT_HEADING,
  CONTACT_INTRO,
} from '@gagnechris/shared/public-pages';

/**
 * The published page has the header only: the form needs JavaScript (a
 * script-less submit would put the message in the URL), so the app passes it
 * as `children` once hydrated.
 */
export const ContactPageBody = ({ children }: { children?: ReactNode }) => (
  <main className="contact-page">
    <header className="contact-page__header">
      <h1>{CONTACT_HEADING}</h1>
      <p className="contact-page__intro">{CONTACT_INTRO}</p>
    </header>
    {children}
  </main>
);
