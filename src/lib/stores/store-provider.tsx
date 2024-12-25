import { FC, useEffect } from 'react';
import { useDictionaryStore } from './store';

interface Props {
  children: React.ReactNode;
}

export const StoreProvider: FC<Props> = ({ children }) => {
  const { fetchDictionary, loading } = useDictionaryStore();
  useEffect(() => {
    fetchDictionary();
  }, []);
  return <>{children} </>;
};
