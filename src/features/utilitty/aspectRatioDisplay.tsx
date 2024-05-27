import { FC } from 'react';

interface AspectRatio {
  width: string | undefined;
  height: string | undefined;
}

export const AspectRatioDisplay: FC<AspectRatio> = ({ width, height }) => {
  return <div>AspectRatioDisplay</div>;
};
