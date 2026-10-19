import { Close } from 'ui';
import { KitDemo, KitMatrix } from './kit-entry';

function CloseDemo() {
  return (
    <KitMatrix
      labelWidth={100}
      cols={['default', 'small', 'disabled']}
      rows={[
        {
          label: 'close ×',
          cells: [<Close />, <Close size='sm' aria-label='remove item' />, <Close disabled />],
        },
      ]}
    />
  );
}

export const closeDemo: KitDemo = {
  names: ['Close'],
  keywords: ['×', 'remove', 'dismiss', 'x'],
  Demo: CloseDemo,
};
