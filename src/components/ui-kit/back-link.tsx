import { BackLink, Text } from 'ui';
import { Crossed, KitMatrix, type KitDemo } from './kit-entry';

// Through consts so the design lint (no-hand-back-link) does not count the crossed samples.
const HAND_BACK = '← back';
const HAND_CHEVRON = '‹';

function BackLinkDemo() {
  return (
    <KitMatrix
      labelWidth={100}
      cols={['do', "don't", 'code']}
      rows={[
        {
          label: 'route',
          cells: [
            <BackLink to='/ui-kit'>orders</BackLink>,
            <Crossed>
              <span className='border border-textColor px-3 py-1 text-micro uppercase'>
                {HAND_BACK}
              </span>
            </Crossed>,
            <Text component='span'>{'to={ROUTES.orders}'}</Text>,
          ],
        },
        {
          label: 'step',
          cells: [
            <BackLink onClick={() => undefined}>back</BackLink>,
            <Crossed>
              <span className='text-textColor'>{HAND_CHEVRON}</span>
            </Crossed>,
            <Text component='span'>onClick</Text>,
          ],
        },
        {
          label: 'disabled',
          cells: [<BackLink disabled>back</BackLink>, null, <Text component='span'>disabled</Text>],
        },
      ]}
    />
  );
}

export const backLinkDemo: KitDemo = {
  names: ['BackLink'],
  keywords: ['back', 'arrow', 'return', '←'],
  Demo: BackLinkDemo,
};
