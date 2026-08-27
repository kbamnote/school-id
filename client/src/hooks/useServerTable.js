import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { errorMessage } from '../api/client';

/**
 * State for a server-driven table: paging, search, sort and filters.
 *
 * Two things this deliberately does:
 *  - keeps state in the URL, so a filtered view can be bookmarked, shared and
 *    survives a refresh or a back-navigation from a detail page;
 *  - debounces the search box, so typing does not fire a request per keystroke.
 */
export default function useServerTable(fetcher, { defaultLimit = 20, defaultSort, filterKeys = [] } = {}) {
  const [searchParams, setSearchParams] = useSearchParams();

  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({ page: 1, limit: defaultLimit, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Local mirror of the search box so the input stays responsive while the
  // committed value (the one that triggers a fetch) lags behind.
  const [searchInput, setSearchInput] = useState(searchParams.get('search') || '');

  const page = Number(searchParams.get('page')) || 1;
  const limit = Number(searchParams.get('limit')) || defaultLimit;
  const search = searchParams.get('search') || '';
  const sort = searchParams.get('sort') || defaultSort || '';

  /**
   * Depend on the CONTENTS of filterKeys, not its identity.
   *
   * Callers naturally write `filterKeys: ['status', 'type']` inline, which is a
   * new array on every render. Keying the memo on the array itself made
   * `filters` unstable, which recreated `load`, which refired the effect - an
   * infinite fetch loop that left the table stuck on skeletons.
   */
  const filterKeysId = filterKeys.join('|');
  const filters = useMemo(() => {
    const out = {};
    for (const key of filterKeysId ? filterKeysId.split('|') : []) {
      const value = searchParams.get(key);
      if (value) out[key] = value;
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, filterKeysId]);

  /** Guards against an earlier slow request overwriting a newer result. */
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const params = { page, limit, ...(search ? { search } : {}), ...(sort ? { sort } : {}), ...filters };
      const res = await fetcher(params);
      if (id !== requestId.current) return; // a newer request already answered
      setRows(res.data || []);
      setMeta(res.meta || { page, limit, total: (res.data || []).length, totalPages: 1 });
    } catch (err) {
      if (id !== requestId.current) return;
      setError(errorMessage(err));
      setRows([]);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [fetcher, page, limit, search, sort, filters]);

  useEffect(() => {
    load();
  }, [load]);

  /** Debounce: commit the typed value to the URL 350ms after typing stops. */
  useEffect(() => {
    if (searchInput === search) return undefined;
    const timer = setTimeout(() => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (searchInput) next.set('search', searchInput);
          else next.delete('search');
          next.set('page', '1'); // a new search always restarts at page 1
          return next;
        },
        { replace: true }
      );
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput, search, setSearchParams]);

  const patchParams = useCallback(
    (updates, { resetPage = true } = {}) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        for (const [key, value] of Object.entries(updates)) {
          if (value === null || value === undefined || value === '') next.delete(key);
          else next.set(key, String(value));
        }
        if (resetPage) next.set('page', '1');
        return next;
      });
    },
    [setSearchParams]
  );

  const setPage = useCallback(
    (nextPage) => patchParams({ page: nextPage }, { resetPage: false }),
    [patchParams]
  );

  const setFilter = useCallback((key, value) => patchParams({ [key]: value }), [patchParams]);

  /** Click a column: ascending, then descending, then unsorted. */
  const toggleSort = useCallback(
    (field) => {
      const current = sort;
      let next;
      if (current === field) next = `-${field}`;
      else if (current === `-${field}`) next = '';
      else next = field;
      patchParams({ sort: next });
    },
    [sort, patchParams]
  );

  const clearFilters = useCallback(() => {
    setSearchInput('');
    setSearchParams({}, { replace: true });
  }, [setSearchParams]);

  const hasActiveFilters = Boolean(search || Object.keys(filters).length);

  return {
    rows,
    meta,
    loading,
    error,
    page,
    limit,
    search,
    searchInput,
    setSearchInput,
    sort,
    filters,
    setFilter,
    setPage,
    setLimit: (n) => patchParams({ limit: n }),
    toggleSort,
    clearFilters,
    hasActiveFilters,
    reload: load,
  };
}
