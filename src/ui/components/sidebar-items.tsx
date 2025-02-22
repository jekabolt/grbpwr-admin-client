import { sideBarItems } from 'constants/side-bar';
import { FC } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from 'ui/components/button';

export const SideBarItems: FC = () => {
  const navigate = useNavigate();
  return (
    <div className='w-full h-full space-y-10 bg-text'>
      {sideBarItems.map((item) => (
        <Button key={item.label} className='w-full h-10' onClick={() => navigate(item.route)}>
          {item.label}
        </Button>
      ))}
    </div>
  );
};
