import { NAV_GROUPS } from 'constants/routes';
import { NavDropdownMenu } from './nav-dropdown-menu';

export function DesktopNavMenu({
  className,
  onNavOpenChange,
}: {
  className?: string;
  onNavOpenChange: (value: boolean) => void;
}) {
  return (
    <NavDropdownMenu
      groups={NAV_GROUPS}
      align='start'
      onOpenChange={onNavOpenChange}
      className={className}
    />
  );
}
