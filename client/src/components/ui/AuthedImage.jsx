import { useEffect, useState } from 'react';
import api from '../../api/client';

/**
 * Displays an image served by the authenticated /api/files route.
 *
 * A plain <img src="/api/files/..."> does not work: the access token lives in
 * memory and is attached by the axios interceptor, but the browser sends no
 * Authorization header for an <img> request, so protected files come back 401
 * and render as a broken image. Fetching through the API client and handing
 * the <img> an object URL is what makes them appear.
 *
 * Results are cached per URL for the life of the page. The same photograph is
 * shown in the form, the live card preview and the review screen, and each
 * re-render must not refetch it.
 */
const cache = new Map();
const inflight = new Map();

async function loadImage(url) {
  if (cache.has(url)) return cache.get(url);
  if (inflight.has(url)) return inflight.get(url);

  // Stored urls are absolute paths like "/api/files/...". The API client is
  // already based at /api (or a full origin in a split deployment), so the
  // prefix is stripped rather than the baseURL overridden - overriding it
  // would send the request to the web origin whenever the API lives elsewhere.
  const path = url.replace(/^\/api(?=\/)/, '');

  const request = api
    .get(path, { responseType: 'blob' })
    .then((response) => {
      const objectUrl = URL.createObjectURL(response.data);
      cache.set(url, objectUrl);
      inflight.delete(url);
      return objectUrl;
    })
    .catch((err) => {
      inflight.delete(url);
      throw err;
    });

  inflight.set(url, request);
  return request;
}

/** Frees every cached object URL. Called on sign-out. */
export function clearImageCache() {
  for (const objectUrl of cache.values()) URL.revokeObjectURL(objectUrl);
  cache.clear();
  inflight.clear();
}

/**
 * Resolves a protected file URL to something an <img> can display.
 * A local object URL (a just-picked file) is passed straight through.
 */
export function useAuthedImage(url) {
  const [resolved, setResolved] = useState(() => {
    if (!url) return null;
    if (url.startsWith('blob:') || url.startsWith('data:')) return url;
    return cache.get(url) || null;
  });

  useEffect(() => {
    if (!url) {
      setResolved(null);
      return undefined;
    }
    if (url.startsWith('blob:') || url.startsWith('data:')) {
      setResolved(url);
      return undefined;
    }
    const cached = cache.get(url);
    if (cached) {
      setResolved(cached);
      return undefined;
    }

    let cancelled = false;
    loadImage(url)
      .then((objectUrl) => {
        if (!cancelled) setResolved(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setResolved(null);
      });

    return () => {
      cancelled = true;
    };
  }, [url]);

  return resolved;
}

export default function AuthedImage({ src, alt = '', fallback = null, ...rest }) {
  const resolved = useAuthedImage(src);
  if (!resolved) return fallback;
  return <img src={resolved} alt={alt} {...rest} />;
}
