import { Close, GroupLabel, Section, Text } from 'ui';

export function CloseKitBlock() {
  return (
    <Section id='Close' title='Close' question='the one close / remove × control'>
      <GroupLabel>sizes × states</GroupLabel>
      <div className='flex flex-wrap items-center gap-stack'>
        <div className='flex items-center gap-1.5'>
          <Text size='micro' variant='label'>
            default
          </Text>
          <Close />
        </div>
        <div className='flex items-center gap-1.5'>
          <Text size='micro' variant='label'>
            small
          </Text>
          <Close size='sm' aria-label='remove item' />
        </div>
        <div className='flex items-center gap-1.5'>
          <Text size='micro' variant='label'>
            disabled
          </Text>
          <Close disabled />
        </div>
      </div>
    </Section>
  );
}
