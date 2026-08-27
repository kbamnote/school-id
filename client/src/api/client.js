import axios from 'axios';

/**
 * Single axios instance for the whole app.
 *
 * Auth model: the short-lived access token lives in memory only (never
 * localStorage - that would expose it to any XSS on the page). The long-lived
 * refresh token is an httpOnly cookie the browser sends automatically, which
 * is why `withCredentials` is on.
 */
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  withCredentials: true,
  timeout: 30000,
});

let accessToken = null;
let onUnauthorized = null;

export function setAccessToken(token) {
  accessToken = token || null;
}
export function getAccessToken() {
  return accessToken;
}
/** Registered by AuthContext so a dead session can clear app state exactly once. */
export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler;
}

api.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

/* --------------------- silent refresh, single-flight ---------------------- */
let refreshPromise = null;

/**
 * Several requests can 401 at the same moment. Without this guard each one
 * would fire its own refresh, and all but the first would fail against a
 * rotated refresh token - logging the user out mid-session.
 */
function refreshAccessToken() {
  if (!refreshPromise) {
    refreshPromise = api
      .post('/auth/refresh', {}, { _skipAuthRefresh: true })
      .then((res) => {
        const token = res.data?.data?.accessToken || null;
        setAccessToken(token);
        return token;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { config, response } = error;

    if (
      response?.status === 401 &&
      config &&
      !config._retry &&
      !config._skipAuthRefresh &&
      !String(config.url || '').includes('/auth/login')
    ) {
      config._retry = true;
      try {
        const token = await refreshAccessToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
          return api(config);
        }
      } catch {
        /* fall through to the logout path below */
      }
      setAccessToken(null);
      if (onUnauthorized) onUnauthorized();
    }

    return Promise.reject(error);
  }
);

/** Pulls a displayable message out of any axios failure shape. */
export function errorMessage(error, fallback = 'Something went wrong') {
  if (error?.response?.data?.message) return error.response.data.message;
  if (error?.code === 'ECONNABORTED') return 'The request timed out. Please try again.';
  if (error?.message === 'Network Error') return 'Cannot reach the server. Is the API running?';
  return error?.message || fallback;
}

/** Field-level validation errors, keyed by field name, for react-hook-form. */
export function fieldErrors(error) {
  const details = error?.response?.data?.details;
  if (!Array.isArray(details)) return {};
  return details.reduce((acc, d) => {
    if (d.field) acc[d.field] = d.message;
    return acc;
  }, {});
}

export default api;
