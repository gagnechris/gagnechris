/** @jsxRuntime automatic */
import type { ReactNode } from 'react';
import {
  CONTACT_ELSEWHERE,
  CONTACT_HEADING,
  CONTACT_INTRO,
} from '@gagnechris/shared/public-pages';
import { PublicLink } from '../link.js';

/**
 * The form needs JavaScript (a script-less submit would put the message in
 * the URL), so the app passes it as `children` once hydrated; the published
 * page offers LinkedIn instead.
 */
export const ContactPageBody = ({ children }: { children?: ReactNode }) => (
  <main className="contact-page">
    <header className="contact-page__header">
      <h1>{CONTACT_HEADING}</h1>
      <p className="contact-page__intro">{CONTACT_INTRO}</p>
    </header>
    {children}
    <p className="contact-page__elsewhere">
      {CONTACT_ELSEWHERE.before}
      <PublicLink href={CONTACT_ELSEWHERE.href} spa={false} trackId="linkedin">
        {CONTACT_ELSEWHERE.label}
      </PublicLink>
      {CONTACT_ELSEWHERE.after}
    </p>
  </main>
);
