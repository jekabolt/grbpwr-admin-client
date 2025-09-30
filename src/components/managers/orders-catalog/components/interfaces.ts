import { ListOrdersRequest } from 'api/proto-http/admin';

export interface FilterProps {
  onSearch?: (filters: Partial<ListOrdersRequest>) => void;
  loading?: boolean;
}

export interface SearchItemsProps {
  value?: string | number;
  disabled?: boolean;
  onChange: (value: any) => void;
}
