import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { notificationsApi } from '../api/activityApi.js';
import { useAuth } from './AuthContext.jsx';

const NotificationContext = createContext(null);

/** How often the bell re-checks. Long enough not to be chatty on a shared API. */
const POLL_MS = 60_000;

/**
 * The unread count, shared by the bell badge and the notifications page.
 *
 * Kept in one place so the two cannot disagree - reading a notification on the
 * page must clear the badge in the same instant, without a round trip.
 */
export function NotificationProvider({ children }) {
  const { isAuthenticated, user } = useAuth();
  const [unread, setUnread] = useState(0);
  const timer = useRef(null);

  const refresh = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      setUnread(await notificationsApi.unreadCount());
    } catch {
      // A failed count must never surface as an error - the bell just keeps
      // its previous number until the next poll.
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) {
      setUnread(0);
      return undefined;
    }

    refresh();
    timer.current = setInterval(refresh, POLL_MS);

    // Coming back to the tab is the moment someone most wants a current
    // count, and costs one request.
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);

    return () => {
      clearInterval(timer.current);
      window.removeEventListener('focus', onFocus);
    };
    // Keyed on the user id so switching account starts a clean count.
  }, [isAuthenticated, user?.id, refresh]);

  const value = useMemo(
    () => ({
      unread,
      refresh,
      /** Applied locally after reading, so the badge responds immediately. */
      setUnread,
      decrement: () => setUnread((n) => Math.max(0, n - 1)),
      clear: () => setUnread(0),
    }),
    [unread, refresh]
  );

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used inside a NotificationProvider');
  }
  return context;
}
