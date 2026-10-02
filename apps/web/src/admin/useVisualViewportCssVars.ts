import { useEffect } from 'react';

/**
 * Publishes iOS Safari visualViewport metrics as CSS variables on `:root`
 * so sticky bars and editor panes can clear the on-screen keyboard (CHR-148).
 *
 * - `--vv-height`: layout viewport height accounting for the keyboard
 * - `--vv-offset-top`: visualViewport.offsetTop (URL bar / scroll offset)
 * - `--keyboard-inset-bottom`: overlap of the keyboard with the layout viewport
 */
export function useVisualViewportCssVars(): void {
  useEffect(() => {
    const root = document.documentElement;

    const sync = () => {
      const vv = window.visualViewport;
      if (!vv) {
        root.style.setProperty('--vv-height', `${window.innerHeight}px`);
        root.style.setProperty('--vv-offset-top', '0px');
        root.style.setProperty('--keyboard-inset-bottom', '0px');
        return;
      }
      root.style.setProperty('--vv-height', `${vv.height}px`);
      root.style.setProperty('--vv-offset-top', `${vv.offsetTop}px`);
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      root.style.setProperty('--keyboard-inset-bottom', `${inset}px`);
    };

    sync();
    const vv = window.visualViewport;
    vv?.addEventListener('resize', sync);
    vv?.addEventListener('scroll', sync);
    window.addEventListener('resize', sync);
    return () => {
      vv?.removeEventListener('resize', sync);
      vv?.removeEventListener('scroll', sync);
      window.removeEventListener('resize', sync);
    };
  }, []);
}
