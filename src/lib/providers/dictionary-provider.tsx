import { adminService } from 'api/api';
import { common_Dictionary } from 'api/proto-http/admin';

import { createContext, FC, ReactNode, useContext, useEffect, useRef, useState } from 'react';

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

export const DictionaryProvider: FC<Props> = ({ children }) => {
  const [dictionary, setDictionary] = useState<common_Dictionary | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasFetched = useRef(false);

  const fetchDictionary = async () => {
    // Prevent duplicate fetches (especially in StrictMode)
    if (hasFetched.current) return;
    hasFetched.current = true;

    setLoading(true);
    setError(null);
    try {
      const response = await adminService.GetDictionary({});
      setDictionary(response.dictionary);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch dictionary';
      setError(msg);
      hasFetched.current = false; // Allow retry on error
    } finally {
      setLoading(false);
    }
  };

  const refetch = async () => {
    hasFetched.current = false; // Reset to allow refetch
    await fetchDictionary();
  };

  useEffect(() => {
    fetchDictionary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
