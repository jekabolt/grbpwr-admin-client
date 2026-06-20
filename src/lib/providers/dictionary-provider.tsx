import { adminService } from 'api/api';
import { common_Dictionary } from 'api/proto-http/admin';
import { isTokenExpired } from 'components/login/protectedRoute';

import { createContext, FC, ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';

interface DictionaryContextValue {
  dictionary: common_Dictionary | undefined;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

const DictionaryContext = createContext<DictionaryContextValue | undefined>(undefined);

interface Props {
  children: ReactNode;
}

const MAX_ATTEMPTS = 3;

export const DictionaryProvider: FC<Props> = ({ children }) => {
  const [dictionary, setDictionary] = useState<common_Dictionary | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasFetched = useRef(false);

  const fetchDictionary = useCallback(async () => {
    // Prevent duplicate fetches (especially in StrictMode).
    if (hasFetched.current) return;

    // Don't attempt without a valid token: the request would 401 and leave the
    // dictionary empty with no recovery. It will run once the provider mounts
    // inside the authenticated area (after login).
    if (isTokenExpired(localStorage.getItem('authToken'))) {
      setLoading(false);
      return;
    }

    hasFetched.current = true;
    setLoading(true);
    setError(null);

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const response = await adminService.GetDictionary({});
        setDictionary(response.dictionary);
        setLoading(false);
        return;
      } catch (err) {
        if (attempt < MAX_ATTEMPTS) {
          // Transient failure — back off briefly and retry.
          await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
          continue;
        }
        const msg = err instanceof Error ? err.message : 'Failed to fetch dictionary';
        setError(msg);
        hasFetched.current = false; // Allow retry on next mount / manual refetch.
        setLoading(false);
      }
    }
  }, []);

  const refetch = useCallback(async () => {
    hasFetched.current = false; // Reset to allow refetch.
    await fetchDictionary();
  }, [fetchDictionary]);

  useEffect(() => {
    fetchDictionary();
  }, [fetchDictionary]);

  return (
    <DictionaryContext.Provider value={{ dictionary, loading, error, refetch }}>
      {children}
    </DictionaryContext.Provider>
  );
};

export const useDictionary = () => {
  const context = useContext(DictionaryContext);
  if (context === undefined) {
    throw new Error('useDictionary must be used within a DictionaryProvider');
  }
  return context;
};
