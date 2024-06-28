import { Slide, useScrollTrigger } from '@mui/material';
import { FC } from 'react';

interface HideOnScrollProps {
  children: React.ReactElement;
}

export const HideOnScroll: FC<HideOnScrollProps> = ({ children }) => {
  const trigger = useScrollTrigger();

  return (
    <Slide appear={false} direction='down' in={!trigger}>
      {children}
    </Slide>
  );
};
