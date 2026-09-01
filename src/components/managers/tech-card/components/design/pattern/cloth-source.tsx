import type { GetDesignBandResponse } from 'api/proto-http/admin';
import { useMemo, type JSX } from 'react';
import { CalloutBox } from 'ui/components/callout-box';
import { Pill } from 'ui/components/pill';
import { Section } from 'ui/components/section';
import Text from 'ui/components/text';

import { assetLabel } from '../assets/model';
import { FABRIC_AUTHORITY } from '../render';
import { fabricAssets, patternAssets } from './model';

/**
 * ═══ КАКОЙ ИЗ ДВУХ ИСТОЧНИКОВ ТКАНИ СЕЙЧАС ДЕЙСТВУЕТ (K-13, ХВОСТ) ════════════════════════════
 *
 * Владелец: «если мы заполнили новую вкладку и выбрали артефакт из паттернмейкера то cloth не надо
 * заполнять». Это правило легко сделать МОЛЧАЛИВЫМ — и молчаливым оно причиняет ровно тот вред,
 * от которого написано: человек заполняет оба, платит за рендер и не узнаёт, что победило.
 *
 * ЧТО ЗДЕСЬ ПРАВДА, А ЧТО БЫЛО БЫ ВЫДУМКОЙ. На проводе НЕТ двух конкурирующих полей: у фабрик-
 * рендера ткань одна — `params.colour`, и паттерн попадает в неё ТЕМ ЖЕ СПОСОБОМ, что лоскут, —
 * чипом в ряду CLOTHS (полка карточки читается `clothShelf`, который берёт обе полки, `fabric` и
 * `pattern`). Значит «взаимоисключение» — не запрет в коде, а СОСТОЯНИЕ ПОЛКИ, и единственное
 * честное поведение экрана — назвать это состояние словами: что на полке лежит, что из этого
 * поедет в промпт и что человеку НЕ надо делать.
 *
 * ПОЭТОМУ ЗДЕСЬ НЕТ НИ ОДНОЙ БЛОКИРОВКИ. Клиент, который «на всякий случай» гасил бы поля CLOTH
 * при наличии паттерна, отнимал бы законный случай — набивную ткань поверх названного цвета — и
 * отнимал бы его молча, потому что промпт всё равно ранжирует источники сам
 * (`FABRIC_AUTHORITY`, `internal/designgen/renderprompt.go`). Экран повторяет ранжирование, а не
 * заводит второе мнение о нём.
 *
 * БЛОК СТОИТ НА ВКЛАДКЕ ВСЕГДА, включая карточку без единой плитки: вопрос «заполнять ли CLOTH»
 * возникает ДО первого прогона, и ответ «пока нечем не заполнено — заполняйте там» тоже ответ.
 */
export function ClothSource({ band }: { band: GetDesignBandResponse }): JSX.Element {
  const patterns = useMemo(() => patternAssets(band), [band]);
  const fabrics = useMemo(() => fabricAssets(band), [band]);

  const patternNames = patterns.map(assetLabel).join(', ');
  const fabricNames = fabrics.map(assetLabel).join(', ');

  /** Три состояния полки — три разные новости, и ни одна не выводится из двух других. */
  const state = patterns.length === 0 ? 'none' : fabrics.length === 0 ? 'pattern-only' : 'both';

  return (
    <Section
      title='cloth of the render — which source is in force'
      question='— what FABRIC RENDER will be given, and what you no longer have to fill in'
      action={
        <span className='flex items-center gap-1'>
          <Pill tone={patterns.length ? 'ink' : 'mut'} data-probe='shelf-patterns'>
            {patterns.length} pattern{patterns.length === 1 ? '' : 's'}
          </Pill>
          <Pill tone={fabrics.length ? 'ink' : 'mut'} data-probe='shelf-fabrics'>
            {fabrics.length} cloth{fabrics.length === 1 ? '' : 's'}
          </Pill>
        </span>
      }
    >
      {state === 'none' && (
        <Text size='micro' component='p' className='normal-case' data-cloth-source='none'>
          Nothing from this tab is on the card’s cloth shelf yet. Until a tile is kept, FABRIC
          RENDER is clothed the way it always was — a cloth photo, a picked colour, words, or any
          mix of them, stated over there.
        </Text>
      )}

      {/* ⚠ АТРИБУТ ПРОБЫ ЖИВЁТ НА `Text`, А НЕ НА `CalloutBox`: примитив коробки принимает ровно
          три пропа и ЛИШНИЕ МОЛЧА ВЫБРАСЫВАЕТ, то есть `data-*` на нём до DOM не доезжает. */}
      {state === 'pattern-only' && (
        <CalloutBox tone='note'>
          <Text size='micro' component='p' data-cloth-source='pattern-only' className='normal-case'>
            <b>the pattern is the cloth of this card.</b> The shelf holds {patternNames} and no
            other cloth. Tick it under <b>FABRIC RENDER → FABRIC → CLOTHS</b> and the render is
            built out of it: you do <b>not</b> have to attach a cloth photo, pick a colour or
            describe the cloth in words as well. Nothing here fills that tick in for you — a run
            renders the cloths a person ticked, and inventing that tick would be spending money on
            a decision nobody made.
          </Text>
        </CalloutBox>
      )}

      {state === 'both' && (
        <CalloutBox tone='warning'>
          <Text size='micro' component='p' data-cloth-source='both' className='normal-case'>
            <b>two sources are on the shelf, and they are not alternatives.</b> The card holds{' '}
            {patternNames} from this tab and {fabricNames} from FABRIC RENDER → INPUT → CLOTH. A run
            renders <b>every cloth that is ticked</b> under FABRIC → CLOTHS, so ticking both sends
            both. If the garment is the pattern, untick the others there; if it is two cloths, that
            is a legal garment and the prompt ranks them: {FABRIC_AUTHORITY}.
          </Text>
        </CalloutBox>
      )}

      <Text size='nano' variant='label' component='p' className='normal-case'>
        A tile kept here is an <b>asset of the card</b>: it outlives the run that made it, it
        carries the repeat it was made at, and it is what the prompt cites by name. The picture on
        its own — the one in the feed above — reaches no prompt at all.
      </Text>
    </Section>
  );
}
