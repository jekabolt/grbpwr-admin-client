import { BASE_PATH } from 'constants/routes';
import { FC } from 'react';
import { Link } from 'react-router-dom';
import Text from 'ui/components/text';

interface ProductNameLinkProps {
  productId?: number | string | null;
  productName?: string | null;
  /** Max width for truncation (e.g. '150px', '120px') */
  maxWidth?: string;
  /** Additional class names */
  className?: string;
}

/** Parses product_id to number. Handles int32 and string (BigQuery/GA4) IDs. */
function toProductId(value: number | string | null | undefined): number | null {
  if (value == null) return null;
  if (typeof value === 'number' && !isNaN(value)) return value;
  const str = String(value).trim();
  if (!str) return null;
  let parsed = parseInt(str, 10);
  if (!isNaN(parsed)) return parsed;
  // Fallback: extract digits (e.g. "item_123", "prod_123", "/products/123" -> 123)
  const match = str.match(/\d+/);
  return match ? parseInt(match[0], 10) : null;
}

export const ProductNameLink: FC<ProductNameLinkProps> = ({
  productId,
  productName,
  maxWidth = '150px',
  className = '',
}) => {
  const id = toProductId(productId);
  const displayName = (productName || (id != null ? `#${id}` : '—')).trim();

  if (id != null) {
    return (
      <Link
        to={`${BASE_PATH}/products/${id}`}
        className={`truncate block hover:underline cursor-pointer text-inherit ${className}`}
        style={{ maxWidth }}
        title={displayName}
      >
        <Text className='truncate'>{displayName}</Text>
      </Link>
    );
  }

  return (
    <Text className={`truncate ${className}`} style={{ maxWidth }} title={displayName}>
      {displayName}
    </Text>
  );
};
