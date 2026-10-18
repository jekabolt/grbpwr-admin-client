import { BackLink, Section, Text } from 'ui';

/** Crossed sample: a form the kit forbids. */
function Dont({ children }: { children: React.ReactNode }) {
  return (
    <div className='relative flex w-fit items-center gap-2 opacity-60'>
      {children}
      <span aria-hidden className='pointer-events-none absolute inset-x-0 top-1/2 h-px bg-error' />
    </div>
  );
}

export function BackLinkBlock() {
  return (
    <Section id='BackLink' title='BackLink' question="import { BackLink } from 'ui'">
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
          <BackLink to='/ui-kit'>orders</BackLink>
          <BackLink onClick={() => undefined}>back</BackLink>
          <BackLink disabled>back</BackLink>
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
              className='border border-textColor px-3 py-1 text-micro uppercase'
            >
              ← back
            </button>
          </Dont>
          <Dont>
            <span className='text-textColor'>‹</span>
          </Dont>
        </div>
      </div>
    </Section>
  );
}
