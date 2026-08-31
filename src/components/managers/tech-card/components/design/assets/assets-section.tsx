import type { GetDesignBandResponse } from 'api/proto-http/admin';
import type { JSX } from 'react';
import { Section } from 'ui/components/section';
import Text from 'ui/components/text';

import { AssetMarks } from './asset-marks';
import { AssetShelves } from './asset-shelf';
import { ASSET_SHELVES, shelfAssets } from './model';

/**
 * ASSETS — СВОЯ СЕКЦИЯ СТУДИИ (V-11).
 *
 * Владелец выбрал форму прямым ответом на прямой вопрос: «Своя секция ASSETS в студии» — три полки
 * (ткани, паттерны, фурнитура), «оттуда их берут и фабрик-рендер, и разметка на флэтах». Не ящик
 * внутри инпута и не три плейсхолдера, разложенные по чужим блокам: ассет ПЕРЕЖИВАЕТ прогон, а
 * орган, живущий внутри формы запуска, читается как свойство запуска.
 *
 * ОДИН БЛОК, ЧЕТЫРЕ ГРУППЫ, НИ ОДНОЙ ВЛОЖЕННОЙ РАМКИ. Полки и разметка — это `GroupLabel` плюс
 * содержимое, то есть веса линейки; блок в блоке в этой системе запрещён.
 *
 * ПОЧЕМУ РАЗМЕТКА СТОИТ ЗДЕСЬ, А НЕ НА ФЛЭТАХ. Метка отвечает на вопрос «какая часть какой тканью»,
 * то есть на вопрос ПРО АССЕТ, заданный на чертеже. Поставленная на экране флэтов, она была бы
 * органом, которому нужен список из другого блока; поставленная здесь — она стоит рядом со своим
 * словарём, и «чем размечаю» находится в одном взгляде с «что размечено».
 */
export function AssetsSection({
  techCardId,
  band,
  disabled,
}: {
  techCardId: number;
  band: GetDesignBandResponse;
  disabled?: boolean;
}): JSX.Element {
  const counts = ASSET_SHELVES.map((s) => shelfAssets(band, s.kind).length);
  const total = counts.reduce((a, b) => a + b, 0);
  const marks = (band.assetPlacements ?? []).length;

  return (
    <Section
      id='design-assets'
      title='assets'
      question='— the cloths, patterns and hardware this style is made of'
      action={
        <Text size='micro' variant='label' component='span'>
          {total === 0
            ? 'nothing on the shelves yet'
            : `${counts[0]} fabric${counts[0] === 1 ? '' : 's'} · ${counts[1]} pattern${
                counts[1] === 1 ? '' : 's'
              } · ${counts[2]} hardware · ${marks} marked`}
        </Text>
      }
    >
      {/* ПУСТОЕ СОСТОЯНИЕ УЧИТ ЭКРАНУ, а не сообщает, что здесь пусто: это первое, что человек
          видит на новой карточке, и «nothing here» не сказало бы ему, зачем сюда возвращаться. */}
      {total === 0 && (
        <Text size='micro' variant='label' component='p' className='normal-case'>
          A cloth put here is remembered by the card, not by one run: the fabric render is built out
          of these, and the marks below say which part of the garment each of them covers.
        </Text>
      )}

      <AssetShelves techCardId={techCardId} band={band} disabled={disabled} />
      <AssetMarks techCardId={techCardId} band={band} disabled={disabled} />
    </Section>
  );
}
