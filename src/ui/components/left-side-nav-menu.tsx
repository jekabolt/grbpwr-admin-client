import { DesktopNavMenu } from './DesktopNavMenu';
import { MobileNavMenu } from './MobileNavMenu';

export function LeftSideNavMenu({
  className,
  onNavOpenChange,
}: {
  className?: string;
  onNavOpenChange: (value: boolean) => void;
}) {
  return (
    <div className='grow basis-0'>
      <div className='hidden lg:block'>
        <DesktopNavMenu className={className} onNavOpenChange={onNavOpenChange} />
      </div>
      <div className='block lg:hidden'>
        <MobileNavMenu />
      </div>
    </div>
  );
}
