import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import Text from 'ui/components/text';

import type { PresenceAudit } from './operations-presence';

// ДВА БАННЕРА СОХРАНЕНИЯ, И ОБА ГОВОРЯТ ОДНО: ПОТЕРИ НЕТ, ЕСТЬ РАСХОЖДЕНИЕ ВЕРСИЙ.
//
// Отказ, противоречащий экрану («required» про заполненное поле), и молчаливое несовпадение
// прочитанного с отправленным — две стороны одной болезни: приложение и бэкенд разошлись. Ни то,
// ни другое не является ошибкой человека, поэтому ни то, ни другое не красит поле.
//
// Оба баннера стоят на странице и держатся до следующего сохранения или до [dismiss] — как
// `stagingError` и отчёт конверта: это факт о записи, а не сообщение в ленте. Тост исчезает
// раньше, чем человек успевает прочитать имя виновника.
//
// Атрибут-якорь (`data-version-skew` / `data-presence-loss`) стоит на ОБЁРТКЕ, а не на
// `CalloutBox`: примитив принимает три пропа и чужие атрибуты не пробрасывает.
//
// Текст английский: интерфейс админки английский с 18.08.

export type VersionSkew = {
  // Поля, отказ по которым противоречит экрану: путь RHF + описание с провода.
  fields: { path: string; description: string }[];
  // Сообщение строгого маршалера целиком — в нём имя поля или члена словаря, которого сервер не
  // знает. Цитируется дословно: перефразировать значило бы потерять единственную улику.
  quote?: string;
};

// Сколько строк списка показывать. Хвост считается числом — экран, залитый сотней строк, не
// читают вовсе, а «и ещё 94» человек дочитывает.
const MAX_ROWS = 12;

export function VersionSkewBanner({
  skew,
  onDismiss,
}: {
  skew: VersionSkew;
  onDismiss: () => void;
}) {
  const rows = skew.fields.slice(0, MAX_ROWS);
  const rest = skew.fields.length - rows.length;
  return (
    <div data-version-skew=''>
      <CalloutBox tone='error' className='mt-2.5'>
        <div className='flex flex-wrap items-start gap-2'>
          <div className='flex-1'>
            <Text size='micro'>
              <b>
                The server did not recognise part of this card — the admin app and the backend are
                on different versions.
              </b>{' '}
              The card was <b>NOT saved</b>, and nothing was lost: your values are still in the
              form. Retry after the backend deploy, or reload this tab if the backend was just
              updated.
            </Text>
            {rows.length > 0 && (
              <ul className='mt-2'>
                {rows.map((f) => (
                  <li key={f.path} data-skew-field={f.path}>
                    <Text size='micro' variant='label'>
                      {f.path} — {f.description}
                    </Text>
                  </li>
                ))}
                {rest > 0 && (
                  <li>
                    <Text size='micro' variant='label'>
                      and {rest} more
                    </Text>
                  </li>
                )}
              </ul>
            )}
            {skew.quote && (
              <div className='mt-2' data-skew-quote=''>
                <Text size='micro' variant='label'>
                  Server said: “{skew.quote}”
                </Text>
              </div>
            )}
          </div>
          <Button type='button' variant='secondary' size='sm' onClick={onDismiss}>
            dismiss
          </Button>
        </div>
      </CalloutBox>
    </div>
  );
}

export function PresenceLossBanner({
  audit,
  onDismiss,
}: {
  audit: PresenceAudit;
  onDismiss: () => void;
}) {
  const rows = audit.losses.slice(0, MAX_ROWS);
  const rest = audit.losses.length - rows.length;
  const n = audit.losses.length;
  const stepsDiffer = audit.sentSteps !== audit.readSteps;
  return (
    <div data-presence-loss=''>
      <CalloutBox tone='error' className='mt-2.5'>
        <div className='flex flex-wrap items-start gap-2'>
          <div className='flex-1'>
            <Text size='micro'>
              <b>
                The backend accepted the save, but {n} field{n === 1 ? '' : 's'} did not come back.
              </b>{' '}
              Most likely the backend is on an older version than this app and dropped what it did
              not recognise. Your values are still in the form — <b>do not close the tab</b>. Retry
              after the backend deploy.
            </Text>
            {stepsDiffer && (
              <div className='mt-2' data-presence-steps=''>
                <Text size='micro' variant='label'>
                  sent {audit.sentSteps} operation step{audit.sentSteps === 1 ? '' : 's'}, read back{' '}
                  {audit.readSteps}
                </Text>
              </div>
            )}
            {rows.length > 0 && (
              <ul className='mt-2'>
                {rows.map((l) => (
                  <li key={l.path} data-lost-field={l.path}>
                    <Text size='micro' variant='label'>
                      step {l.step + 1} — {l.field} ({l.path})
                    </Text>
                  </li>
                ))}
                {rest > 0 && (
                  <li>
                    <Text size='micro' variant='label'>
                      and {rest} more
                    </Text>
                  </li>
                )}
              </ul>
            )}
          </div>
          <Button type='button' variant='secondary' size='sm' onClick={onDismiss}>
            dismiss
          </Button>
        </div>
      </CalloutBox>
    </div>
  );
}
