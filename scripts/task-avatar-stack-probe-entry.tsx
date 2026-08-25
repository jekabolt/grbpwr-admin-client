// СТЕНД АВАТАРОВ: рядом стоят СТАРЫЙ одиночный `Avatar` и НОВЫЙ `AvatarStack` — тот же кит,
// та же css. Сравниваются коробки и разметка.
import { createRoot } from 'react-dom/client';
import { Avatar } from '../src/ui/components/avatar';
import { AvatarStack } from '../src/components/managers/tasks/components/avatar-stack';

createRoot(document.getElementById('root')!).render(
  <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'flex-start' }}>
    <div id='old-one'><Avatar name='nina petrova' /></div>
    <div id='new-one'><AvatarStack names={['nina petrova']} /></div>
    <div id='old-none'><Avatar name='' /></div>
    <div id='new-none'><AvatarStack names={[]} /></div>
    <div id='new-two'><AvatarStack names={['nina petrova', 'oleg k']} /></div>
    <div id='new-five'><AvatarStack names={['a a', 'b b', 'c c', 'd d', 'e e']} /></div>
  </div>,
);
