import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * Warns before leaving a page with unsaved work.
 *
 * React Router's `useBlocker` only exists on a data router
 * (createBrowserRouter). This app uses <BrowserRouter>, so the in-app half is
 * done by intercepting link clicks in the capture phase - which works with any
 * router and covers the realistic loss case: clicking away mid-edit.
 *
 * Two layers:
 *   1. beforeunload  - refresh, tab close, external navigation
 *   2. link capture  - in-app navigation via <Link> / <a>
 */
export default function useUnsavedChanges(dirty) {
  const navigate = useNavigate();
  const [pending, setPending] = useState(null);
  // Read inside listeners so they always see the current value without
  // needing to be re-registered on every keystroke.
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  useEffect(() => {
    const onBeforeUnload = (e) => {
      if (!dirtyRef.current) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  useEffect(() => {
    const onClick = (e) => {
      if (!dirtyRef.current) return;
      // Let the browser handle modified clicks (new tab, download, etc).
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
        return;
      }

      const anchor = e.target.closest?.('a[href]');
      if (!anchor) return;
      if (anchor.target && anchor.target !== '_self') return;
      if (anchor.hasAttribute('download')) return;

      const href = anchor.getAttribute('href');
      if (!href || href.startsWith('#') || /^[a-z]+:/i.test(href)) return;

      const url = new URL(anchor.href, window.location.origin);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname) return;

      e.preventDefault();
      e.stopPropagation();
      setPending(url.pathname + url.search);
    };

    // Capture phase, so this runs before React Router's own click handler.
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);

  const confirmLeave = useCallback(() => {
    const target = pending;
    setPending(null);
    // Cleared first so the guard does not re-trigger on the way out.
    dirtyRef.current = false;
    if (target) navigate(target);
  }, [navigate, pending]);

  const cancelLeave = useCallback(() => setPending(null), []);

  return { blocked: Boolean(pending), confirmLeave, cancelLeave };
}
