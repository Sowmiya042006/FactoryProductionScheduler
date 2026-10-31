/**
 * src/api/hooks.js
 * Small React hooks wrapping the api client.
 * Keeps calling code in components clean.
 */
import { useState, useCallback } from 'react';
import { api, ApiError } from './client.js';

/** Generic async action hook – returns [execute, { loading, error }] */
export function useAction(fn) {
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  const execute = useCallback(async (...args) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fn(...args);
      setLoading(false);
      return result;
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'An unexpected error occurred.';
      setError(msg);
      setLoading(false);
      throw e;
    }
  }, [fn]);

  return [execute, { loading, error }];
}
