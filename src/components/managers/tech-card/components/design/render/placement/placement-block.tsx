import type { GetDesignBandResponse } from 'api/proto-http/admin';
import { useMemo, useState, type JSX } from 'react';
import { Button } from 'ui/components/button';
import { Chip, ChipRow } from 'ui/components/chip';
import Input from 'ui/components/input';
import { Section } from 'ui/components/section';
import Text from 'ui/components/text';

import { assetFull, assetIsPattern, assetLabel } from '../../assets/model';
import { useAssetWrites } from '../../assets/use-assets';
import { FieldRow, Hint } from '../field-row';
import { FittingView } from './fitting-view';
import {
  DEFAULT_SPAN_MM,
  REPEAT_MAX_MM,
  REPEAT_MIN_MM,
  ROTATION_MAX_DEG,
  SPANS,
  SURVIVES,
  assetSaveInput,
  clampRepeat,
  fittingCloths,
  fittingFlats,
  flatLabel,
  pictureUrl,
  pinAnnotation,
  pinOnFlat,
  pinPoint,
  pinSaveGate,
  repeatLabel,
  repeatSaveGate,
  tilesAcross,
  wrapRotation,
} from './model';

/**
 * ПРИМЕРКА ТКАНИ НА ФЛЭТЕ (K-14) — ЭКРАННАЯ ЧАСТЬ.
 *
 * «Возьмём флет, обрежем белый фон, подложим паттерн и прикинем размер руками». Здесь это ровно
 * то, чем выглядит: два ряда выбора, кадр и три регулятора. НИЧЕГО НЕ ГЕНЕРИРУЕТСЯ И НЕ
 * ОПЛАЧИВАЕТСЯ — у блока нет ни одной ручки, которая ходит к провайдеру, и заголовок говорит это
 * первым делом, потому что стоит он в разделе, где все остальные кнопки платные.
 *
 * ДВА ПИСАТЕЛЯ, А НЕ ОДИН, И ОБА НАЗЫВАЮТ СВОЮ ЦЕНУ. Раппорт с поворотом ложатся на САМУ ТКАНЬ и
 * меняют её на всей карточке; метка ложится на ОДИН флэт и сужает ткань в платном промпте. Это
 * разные последствия, поэтому это разные кнопки с разными глаголами, а не одна «сохранить».
 * Полный довод — в шапке `./model`.
 *
 * ⚠ ОБЪЯСНЯЮЩИХ АБЗАЦЕВ ЗДЕСЬ НЕТ НАМЕРЕННО (владелец снимал их четырежды). Всё, что блок должен
 * сказать, он говорит глаголом на кнопке и одной строкой рядом с тем регулятором, к которому она
 * относится.
 */
export function PlacementBlock({
  band,
  techCardId,
  disabled,
}: {
  band: GetDesignBandResponse;
  techCardId: number;
  disabled?: boolean;
}): JSX.Element {
  const flats = useMemo(() => fittingFlats(band), [band]);
  const cloths = useMemo(() => fittingCloths(band), [band]);
  const writes = useAssetWrites(techCardId);

  const [flatId, setFlatId] = useState(0);
  const [clothId, setClothId] = useState(0);
  const [spanMm, setSpanMm] = useState(DEFAULT_SPAN_MM);
  const [note, setNote] = useState('');
  /** `null` = человек ещё не двигал регулятор; кадр тогда показывает раппорт самой ткани. */
  const [repeatDraft, setRepeatDraft] = useState<number | null>(null);
  const [rotationDraft, setRotationDraft] = useState<number | null>(null);
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);

  const flat = flats.find((p) => (p.id ?? 0) === flatId) ?? null;
  const cloth = cloths.find((a) => (a.id ?? 0) === clothId) ?? null;

  /**
   * ЧИСЛА КАДРА — ЧЕРНОВИК ПОВЕРХ СОХРАНЁННОГО, а не отдельная величина.
   *
   * Пока регулятор не тронут, кадр показывает то, что лежит НА ТКАНИ, — иначе примерка открывалась
   * бы с числом, которого у ткани нет, и «сохранить» записывало бы придуманное. Тронутый регулятор
   * старше: он и есть то, что человек сейчас прикидывает.
   *
   * Ткань без раппорта (`0`) получает 120 мм ТОЛЬКО ДЛЯ ПОКАЗА: нулевой раппорт не рисуется вовсе,
   * а кадр, показывающий голый флэт при выбранной ткани, читается как поломка. Число при этом
   * НИКУДА НЕ ЕДЕТ, пока человек не нажмёт кнопку.
   */
  const savedRepeat = cloth?.repeatMm ?? 0;
  const savedRotation = cloth?.rotationDeg ?? 0;
  const repeatMm = repeatDraft ?? (savedRepeat > 0 ? savedRepeat : 120);
  const rotationDeg = rotationDraft ?? savedRotation;

  const existingPin = pinOnFlat(band, clothId, flatId);
  const shownPin = at ?? (existingPin ? pinPoint(existingPin) : null);

  const repeatGate = repeatSaveGate(cloth);
  const pinGate = pinSaveGate(cloth, flat, shownPin, note);
  const across = tilesAcross(repeatMm, spanMm);
  const dirty = repeatMm !== savedRepeat || rotationDeg !== savedRotation;

  /** Смена ткани сбрасывает черновики: числа принадлежат ТКАНИ, а не регулятору на экране. */
  function pickCloth(id: number) {
    setClothId(id === clothId ? 0 : id);
    setRepeatDraft(null);
    setRotationDraft(null);
    setAt(null);
    setNote('');
  }

  /** Смена флэта сбрасывает только метку: доли принадлежат КАДРУ и на другом кадре бессмысленны. */
  function pickFlat(id: number) {
    setFlatId(id === flatId ? 0 : id);
    setAt(null);
    setNote('');
  }

  return (
    <Section
      title='fabric fitting'
      question='— lay a cloth under a flat and size it by hand. Nothing is generated and nothing is charged'
    >
      <FieldRow label='flat'>
        {flats.length === 0 ? (
          <Hint>none on this card — a fitting needs a drawing to lay the cloth under.</Hint>
        ) : (
          <ChipRow>
            {flats.map((p) => {
              const id = p.id ?? 0;
              return (
                <Chip
                  key={id}
                  nonForm
                  selected={id === flatId}
                  pressed={id === flatId}
                  disabled={disabled}
                  data-flat={id}
                  onClick={() => pickFlat(id)}
                >
                  {flatLabel(band, p)}
                </Chip>
              );
            })}
          </ChipRow>
        )}
      </FieldRow>

      <FieldRow label='cloth'>
        {cloths.length === 0 ? (
          <Hint>
            none with a picture — a cloth stated in words and colour only has nothing to lay down.
          </Hint>
        ) : (
          <ChipRow>
            {cloths.map((a) => {
              const id = a.id ?? 0;
              return (
                <Chip
                  key={id}
                  nonForm
                  selected={id === clothId}
                  pressed={id === clothId}
                  disabled={disabled}
                  data-cloth={id}
                  /* РОД НАЗВАН НА ЧИПЕ, потому что от него зависит, сохранится ли раппорт: на
                     обычной ткани сервер его отвергает. Молчащий чип оставил бы человека гадать,
                     почему кнопка погашена именно на этой ткани. */
                  title={assetIsPattern(a) ? `${assetLabel(a)} — pattern` : `${assetLabel(a)} — fabric`}
                  onClick={() => pickCloth(id)}
                >
                  {assetLabel(a)}
                </Chip>
              );
            })}
          </ChipRow>
        )}
      </FieldRow>

      <FittingView
        flatUrl={pictureUrl(flat)}
        clothUrl={assetFull(cloth ?? undefined)}
        repeatMm={repeatMm}
        spanMm={spanMm}
        rotationDeg={rotationDeg}
        pin={shownPin}
        onPick={cloth && flat ? setAt : undefined}
        disabled={disabled}
      />

      <FieldRow label='frame span'>
        <ChipRow>
          {SPANS.map((s) => (
            <Chip
              key={s.mm}
              nonForm
              selected={s.mm === spanMm}
              pressed={s.mm === spanMm}
              disabled={disabled}
              data-span={s.mm}
              title={s.what}
              onClick={() => setSpanMm(s.mm)}
            >
              {s.label}
            </Chip>
          ))}
        </ChipRow>
        <Hint>how wide the garment is across this drawing — a stated assumption, not a measurement</Hint>
      </FieldRow>

      <FieldRow label='repeat'>
        <Input
          type='number'
          min={REPEAT_MIN_MM}
          max={REPEAT_MAX_MM}
          step={5}
          value={repeatMm}
          disabled={disabled}
          data-probe='repeat-input'
          className='w-[92px]'
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            setRepeatDraft(clampRepeat(Number(e.target.value)))
          }
        />
        <Text size='micro' variant='label' component='span' className='normal-case'>
          {repeatLabel(repeatMm)}
        </Text>
        {across > 0 && (
          <Hint>
            about {across < 10 ? across.toFixed(1) : Math.round(across)} tiles across {spanMm} mm
          </Hint>
        )}
      </FieldRow>

      <FieldRow label='rotation'>
        <Input
          type='number'
          min={0}
          max={ROTATION_MAX_DEG}
          step={15}
          value={rotationDeg}
          disabled={disabled}
          data-probe='rotation-input'
          className='w-[92px]'
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            setRotationDraft(wrapRotation(Number(e.target.value)))
          }
        />
        <ChipRow>
          {[0, 45, 90, 135].map((d) => (
            <Chip
              key={d}
              nonForm
              selected={d === rotationDeg}
              pressed={d === rotationDeg}
              disabled={disabled}
              onClick={() => setRotationDraft(d)}
            >
              {d}°
            </Chip>
          ))}
        </ChipRow>
      </FieldRow>

      {/* ═══ ЗАПИСЬ ПЕРВАЯ: ЧИСЛА — НА ТКАНЬ, НА ВСЮ КАРТОЧКУ ══════════════════════════════ */}
      <FieldRow label='keep size'>
        <Button
          size='sm'
          disabled={disabled || !repeatGate.ok || !dirty || writes.upsertAsset.isPending}
          data-probe='save-repeat'
          onClick={() =>
            cloth && writes.upsertAsset.mutate(assetSaveInput(cloth, repeatMm, rotationDeg))
          }
        >
          save repeat on this cloth
        </Button>
        <Hint>
          {!repeatGate.ok
            ? repeatGate.reason
            : dirty
              ? `writes ${repeatMm} mm and ${rotationDeg}° onto ${assetLabel(cloth ?? undefined)} — everywhere this cloth is used on the card, not only here`
              : 'the cloth already carries these numbers'}
        </Hint>
      </FieldRow>

      {/* ═══ ЗАПИСЬ ВТОРАЯ: «ЭТА ТКАНЬ ЗДЕСЬ» — НА ОДИН ФЛЭТ, И ЭТО УЕЗЖАЕТ В ПРОМПТ ═══════ */}
      <FieldRow label='mark part'>
        <Input
          type='text'
          value={note}
          maxLength={500}
          disabled={disabled || !cloth || !flat}
          placeholder='body, back yoke'
          data-probe='pin-note'
          className='w-[200px]'
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNote(e.target.value)}
        />
        <Button
          size='sm'
          disabled={disabled || !pinGate.ok || writes.setPlacement.isPending}
          data-probe='save-pin'
          onClick={() =>
            cloth &&
            flat &&
            shownPin &&
            writes.setPlacement.mutate({
              placementId: existingPin?.id ?? 0,
              assetId: cloth.id ?? 0,
              pictureId: flat.id ?? 0,
              annotation: pinAnnotation(shownPin.x, shownPin.y),
              note: note.trim(),
            })
          }
        >
          mark this cloth on the flat
        </Button>
        {existingPin && (
          <Button
            size='sm'
            disabled={disabled || writes.deletePlacement.isPending}
            data-probe='remove-pin'
            onClick={() => writes.deletePlacement.mutate(existingPin.id ?? 0)}
          >
            remove mark
          </Button>
        )}
        <Hint>
          {!pinGate.ok
            ? pinGate.reason
            : 'the render prompt will read: it is used on this part and on no other part of this garment'}
        </Hint>
      </FieldRow>

      {/* ЧТО ПЕРЕЖИВЁТ ПЕРЕЗАГРУЗКУ — СКАЗАНО, А НЕ ПОДРАЗУМЕВАЕТСЯ. Регулятор, чьё значение
          пропадёт, обязан объявить это рядом с собой: иначе человек читает потерю как поломку. */}
      <FieldRow label='keeps'>
        <Hint>
          <span data-probe='survives'>
            {SURVIVES.map((s) => `${s.what} — ${s.where}`).join(' · ')}
          </span>
        </Hint>
      </FieldRow>
    </Section>
  );
}
