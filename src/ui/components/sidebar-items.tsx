import { sideBarItems } from 'constants/routes';
import { FC } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from 'ui/components/button';

export const SideBarItems: FC = () => {
  const navigate = useNavigate();
  return (
    <div className='w-full h-full flex flex-col gap-10 justify-center items-center bg-text'>
      {sideBarItems.map((item) => (
        <Button
          variant='simple'
          key={item.label}
          className='w-full h-10'
          onClick={() => navigate(item.route)}
        >
          {item.label}
        </Button>
      ))}
    </div>
  );
};
