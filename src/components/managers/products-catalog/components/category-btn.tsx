import { Link } from 'react-router-dom';
import { Button } from 'ui/components/button';

export function CategoryButton({
  href,
  children,
  disabled = false,
  variant = 'default',
}: {
  href: string;
  children: React.ReactNode;
  disabled?: boolean;
  variant?: 'default' | 'underline';
}) {
  return (
    <Button
      asChild={!disabled}
      variant={variant}
      className='whitespace-nowrap uppercase hover:underline'
      disabled={disabled}
    >
      {disabled ? <>{children}</> : <Link to={href}>{children}</Link>}
    </Button>
  );
}
