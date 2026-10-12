import { useCallback, useEffect, useMemo, useRef } from 'react';
import { withPublicUrls } from '../publicUrl';

const frameDocument = (styles: string) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>${styles}</style></head><body><div id="root"></div></body></html>`;

/**
 * Public page HTML in a frame with the public styles, so neither the admin
 * styles nor the public ones reach the other side. The frame is as tall as
 * the page; the pane around it scrolls.
 */
export const PublicPagePreview = ({
  title,
  styles,
  html,
}: {
  title: string;
  styles: string;
  html: string;
}) => {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const srcDoc = useMemo(() => frameDocument(styles), [styles]);

  const fit = useCallback(() => {
    const frame = frameRef.current;
    const root = frame?.contentDocument?.getElementById('root');
    if (frame && root) frame.style.height = `${root.offsetHeight}px`;
  }, []);

  const show = useCallback(() => {
    const doc = frameRef.current?.contentDocument;
    if (!doc?.body) return;
    let root = doc.getElementById('root');
    // A blank document until the srcdoc loads; jsdom never loads it.
    if (!root) {
      root = doc.createElement('div');
      root.id = 'root';
      doc.body.replaceChildren(root);
    }
    root.innerHTML = withPublicUrls(html);
    fit();
    void doc.fonts?.ready.then(fit);
  }, [html, fit]);

  useEffect(() => show(), [show]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(fit);
    observer.observe(frame);
    return () => observer.disconnect();
  }, [fit]);

  return (
    <iframe
      ref={frameRef}
      className="admin-page-preview"
      title={title}
      srcDoc={srcDoc}
      // Same origin so the editor can write the page in; no scripts run in it.
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      onLoad={show}
    />
  );
};
