import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import {
  HOME_FOOTER_LINKS,
  HOME_PROFILE_IMAGE_SRC,
  HOME_QUICK_LINKS,
  type SiteChromeLink,
} from '@gagnechris/shared/home';
import { trackEvent } from './utils/analytics';
import {
  documentHomeView,
  fallbackHomeView,
  loadPublishedHome,
  type HomeView,
} from './home/publishedHome';
import './App.css';

const ChromeLink = ({ link }: { link: SiteChromeLink }) => {
  const onTrack = link.trackId
    ? () => trackEvent('click', 'external_link', link.trackId!)
    : undefined;

  if (link.kind === 'spa') {
    return (
      <Link
        to={link.href}
        className={link.className}
        aria-label={link.ariaLabel}
        title={link.title}
      >
        {link.label}
      </Link>
    );
  }

  if (link.kind === 'external') {
    return (
      <a
        href={link.href}
        target="_blank"
        rel="noopener noreferrer"
        className={link.className}
        aria-label={link.ariaLabel}
        title={link.title}
        onClick={onTrack}
      >
        {link.label}
      </a>
    );
  }

  return (
    <a
      href={link.href}
      className={link.className}
      aria-label={link.ariaLabel}
      title={link.title}
      onClick={onTrack}
    >
      {link.label}
    </a>
  );
};

const ChromeLinkList = ({
  links,
  className,
}: {
  links: readonly SiteChromeLink[];
  className?: string;
}) => (
  <ul className={className}>
    {links.map((link) => (
      <li key={`${link.href}:${link.trackId ?? link.label}`}>
        <ChromeLink link={link} />
      </li>
    ))}
  </ul>
);

function App() {
  const [home, setHome] = useState<HomeView>(
    () => documentHomeView() ?? fallbackHomeView(),
  );

  useEffect(() => {
    // A cold load on `/` already parsed the prerender out of the document.
    if (documentHomeView()) return;
    let cancelled = false;
    void loadPublishedHome()
      .then((published) => {
        if (published && !cancelled) {
          setHome(published);
        }
      })
      .catch(() => {
        /* fall back to the bundled default content */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const year = new Date().getFullYear();

  return (
    <div className="home-page">
      <title>{`${home.name} - ${home.title}`}</title>
      <link rel="canonical" href="https://gagnechris.com" />
      <header className="home-header">
        <img
          src={HOME_PROFILE_IMAGE_SRC}
          className="profile"
          alt={`Photo of ${home.name}`}
          width={96}
          height={96}
        />
        <h1>{home.name}</h1>
        <p>{home.title}</p>
      </header>
      <main>
        <section id="about">
          <h2>About Me</h2>
          <div
            className="about-body"
            dangerouslySetInnerHTML={{ __html: home.aboutHtml }}
          />
        </section>
        <section id="quick-links">
          <h2>Quick Links</h2>
          <ChromeLinkList links={HOME_QUICK_LINKS} />
        </section>
      </main>
      <footer className="site-footer">
        <p className="site-footer__copy">© {year} Chris Gagne</p>
        <ChromeLinkList
          links={HOME_FOOTER_LINKS}
          className="site-footer__links"
        />
      </footer>
    </div>
  );
}

export default App;
