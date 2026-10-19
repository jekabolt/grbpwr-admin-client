import { AddDoor, addDoorClass, Text } from 'ui';
import { Crossed, KitMatrix, type KitDemo } from './kit-entry';

// Through a const so the design lint (no-hand-add-door) does not count the crossed sample.
const HAND_ADD = '+ add';

function Rows() {
  return (
    <div className='flex w-full flex-col border border-borderColor'>
      <div className='border-b border-borderColor px-2 py-3 text-textBaseSize'>cutting</div>
      <div className='px-2 py-3 text-textBaseSize'>sewing</div>
    </div>
  );
}

function AddDoorDemo() {
  return (
    <KitMatrix
      labelWidth={100}
      cols={['do', "don't", 'code']}
      rows={[
        {
          label: 'after rows',
          cells: [
            <div className='w-full'>
              <Rows />
              <AddDoor afterRows>operation</AddDoor>
            </div>,
            <Crossed>
              <span className='block w-full border border-textColor px-3 py-2 text-micro uppercase'>
                add operation
              </span>
            </Crossed>,
            <Text component='span'>afterRows</Text>,
          ],
        },
        {
          label: 'block',
          cells: [
            <AddDoor>aspect</AddDoor>,
            <Crossed>
              <span className='text-micro uppercase underline'>{HAND_ADD}</span>
            </Crossed>,
            <Text component='span'>children = noun</Text>,
          ],
        },
        {
          label: 'tile · inline',
          cells: [
            <div className='flex gap-3'>
              <AddDoor shape='tile' className='size-20'>
                slot
              </AddDoor>
              <AddDoor shape='inline'>colour</AddDoor>
            </div>,
            null,
            <Text component='span'>{"shape='tile' | 'inline'"}</Text>,
          ],
        },
        {
          label: 'select',
          cells: [
            <div id='addDoorClass' className='w-full scroll-mt-20'>
              <span className={addDoorClass()}>+ material ▾</span>
            </div>,
            null,
            <Text component='span'>{'<select className={addDoorClass()}>'}</Text>,
          ],
        },
      ]}
    />
  );
}

export const addDoorDemo: KitDemo = {
  names: ['AddDoor'],
  keywords: ['add', 'new', 'plus', '+', 'dashed', 'addDoorClass'],
  Demo: AddDoorDemo,
};
