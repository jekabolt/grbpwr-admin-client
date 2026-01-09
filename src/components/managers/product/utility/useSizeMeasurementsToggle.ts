import { useState } from 'react';

export interface MeasurementsToggleState {
  bottoms: boolean;
  tailored: boolean;
}

const INITIAL_STATE: MeasurementsToggleState = {
  bottoms: false,
  tailored: false,
};

export function useSizeMeasurementsToggle() {
  const [measurementsNames, setMeasurementsNames] = useState(INITIAL_STATE);

  const handleToggleChange = (type: 'bottoms' | 'tailored', checked: boolean) => {
    setMeasurementsNames({ ...measurementsNames, [type]: checked });
  };

  return {
    measurementsNames,
    handleToggleChange,
  };
}
