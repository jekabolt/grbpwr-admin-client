import { AddDoor, addDoorClass, Section, Text } from 'ui';

/** Crossed sample: a form the kit forbids. */
function Dont({ children }: { children: React.ReactNode }) {
  return (
    <div className='relative opacity-60'>
      {children}
      <span aria-hidden className='pointer-events-none absolute inset-x-0 top-1/2 h-px bg-error' />
    </div>
  );
}

function Rows() {
  return (
    <div className='flex flex-col border border-borderColor'>
      <div className='border-b border-borderColor px-2 py-3 text-textBaseSize'>cutting</div>
      <div className='px-2 py-3 text-textBaseSize'>sewing</div>
    </div>
  );
}

export function AddDoorBlock() {
  return (
    <Section id='AddDoor' title='AddDoor' question="import { AddDoor, addDoorClass } from 'ui'">
      <div className='grid grid-cols-2 gap-6'>
        <div className='flex flex-col gap-3'>
          <Text
            size='micro'
            variant='label'
            tracking='label'
            component='span'
            className='uppercase'
          >
            do
          </Text>
          <div>
            <Rows />
            <AddDoor afterRows>operation</AddDoor>
          </div>
          <AddDoor>aspect</AddDoor>
          <div className='flex gap-3'>
            <AddDoor shape='tile' className='size-20'>
              slot
            </AddDoor>
            <AddDoor shape='inline'>colour</AddDoor>
          </div>
          <select className={addDoorClass()} defaultValue=''>
            <option value='' disabled>
              + material
            </option>
          </select>
        </div>
        <div className='flex flex-col gap-3'>
          <Text
            size='micro'
            variant='label'
            tracking='label'
            component='span'
            className='uppercase'
          >
            don't
          </Text>
          <Dont>
            <button
              type='button'
              className='w-full border border-textColor px-3 py-2 text-micro uppercase'
            >
              add operation
            </button>
          </Dont>
          <Dont>
            <span className='text-micro uppercase underline'>+ add</span>
          </Dont>
        </div>
      </div>
    </Section>
  );
}
