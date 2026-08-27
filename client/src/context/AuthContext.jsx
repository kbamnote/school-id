import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import api, { setAccessToken, setUnauthorizedHandler, errorMessage } from '../api/client';

const AuthContext = createContext(null);

/**
 * Session state for the whole app.
 *
 * On mount it attempts a silent refresh: the access token lives only in memory
 * and is therefore gone after a page reload, but the httpOnly refresh cookie
 * survives - so a reload restores the session without re-entering credentials.
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [initialising, setInitialising] = useState(true);
  const bootstrapped = useRef(false);

  const clearSession = useCallback(() => {
    setAccessToken(null);
    setUser(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(clearSession);
  }, [clearSession]);

  useEffect(() => {
    // React 18 StrictMode double-invokes effects in development; without this
    // guard the refresh fires twice and the second call races the rotated cookie.
    if (bootstrapped.current) return;
    bootstrapped.current = true;

    (async () => {
      try {
        const res = await api.post('/auth/refresh', {}, { _skipAuthRefresh: true });
        setAccessToken(res.data.data.accessToken);
        setUser(res.data.data.user);
      } catch {
        clearSession(); // no valid session - land on the sign-in screen
      } finally {
        setInitialising(false);
      }
    })();
  }, [clearSession]);

  const login = useCallback(async (credentials) => {
    const res = await api.post('/auth/login', credentials);
    const { accessToken, user: signedIn } = res.data.data;
    setAccessToken(accessToken);
    setUser(signedIn);
    return signedIn;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // Even if the call fails, drop local state - the user asked to leave.
    }
    clearSession();
  }, [clearSession]);

  const changePassword = useCallback(async (payload) => {
    const res = await api.post('/auth/change-password', payload);
    const { accessToken, user: updated } = res.data.data;
    setAccessToken(accessToken);
    setUser(updated);
    return updated;
  }, []);

  /** Refetches the current user - used after a profile or permission change. */
  const reloadUser = useCallback(async () => {
    const res = await api.get('/auth/me');
    setUser(res.data.data.user);
    return res.data.data.user;
  }, []);

  const value = useMemo(
    () => ({
      user,
      initialising,
      isAuthenticated: Boolean(user),
      login,
      logout,
      changePassword,
      reloadUser,
      setUser,
      /**
       * Convenience checks for rendering. These are COSMETIC only - the server
       * re-checks every permission on every request. Hiding a button here is
       * never the thing that keeps data safe.
       */
      can: (...perms) => perms.flat().every((p) => user?.permissions?.includes(p)),
      canAny: (...perms) => perms.flat().some((p) => user?.permissions?.includes(p)),
      hasRole: (...roles) => roles.flat().includes(user?.role),
      errorMessage,
    }),
    [user, initialising, login, logout, changePassword, reloadUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
