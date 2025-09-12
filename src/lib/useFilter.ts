import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';

export default function useFilter(filterTerm: string, multiple: boolean = false) {
  const [searchParams] = useSearchParams();
  const pathName = useLocation().pathname;
  const navigate = useNavigate();

  function handleFilterChange(term?: string | string[], additionalTerms?: Record<string, string>) {
    const params = new URLSearchParams(searchParams);

    if (term) {
      if (Array.isArray(term)) {
        if (term.length > 0) {
          params.set(filterTerm, term.join(','));
        } else {
          params.delete(filterTerm);
        }
      } else {
        params.set(filterTerm, term);
      }
    } else {
      params.delete(filterTerm);
    }

    if (additionalTerms) {
      Object.entries(additionalTerms).forEach(([key, value]) => {
        if (value) {
          params.set(key, value);
        } else {
          params.delete(key);
        }
      });
    }

    navigate(`${pathName}?${params.toString()}`, { replace: true });
  }

  const paramValue = searchParams.get(filterTerm);
  const defaultValue = multiple ? paramValue?.split(',') || [] : paramValue || '';

  return { defaultValue, handleFilterChange };
}
