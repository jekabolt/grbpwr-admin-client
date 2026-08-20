import React, { useEffect, useMemo, useState } from 'react';
import { Chip, ChipRow } from 'ui/components/chip';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { GroupLabel } from 'ui/components/group-label';
import Input from 'ui/components/input';
import Select from 'ui/components/select';
import Text from 'ui/components/text';

import { suggestUnitCode } from './assembly-suggest';
import { machineTypeOptions, pressEquipmentOptions } from './equipment-options';
import { operationTypeOptionsFor, zoneOptions } from './operation-options';

// Диалог создания операции из схемы.
//
// ЕГО ЕДИНСТВЕННАЯ ЗАДАЧА — СОБРАТЬ ВАЛИДНЫЙ МИНИМУМ. До Ф7 «сшить» и «+ операция» создавали шаг
// из `emptyOperation`, у которого тип и зона стоят в UNKNOWN, — то есть заведомо невалидный:
// сервер обе требует, и zod требует тоже. Технолог получал на рельсе строку с «!» и шёл её
// дозаполнять, а жест, который должен был закончиться результатом, заканчивался долгом.
//
// ЭТО НЕ ВТОРОЙ РЕДАКТОР ШАГА. SMV, шов, отстрочка, настройки ВТО здесь не собираются: после
// создания открывается полный редактор, и место всему остальному там. Граница проходит ровно по
// валидности — что нужно, чтобы шаг существовал законно, спрашивается тут; что описывает шаг
// подробнее — там.
//
// НИКАКИХ ДЕФОЛТОВ В ТИП И ЗОНУ. Пустой выбор и явный ответ: подставленный «machine» прошёл бы все
// проверки и уехал на печать как утверждение, которого никто не делал. Это та же философия, по
// которой `emptyOperation` перестал подставлять пресеты.

export type CreatePrefill = {
  /** Входы, назначенные жестом: выбор на полотне или пара «тащили → бросили». */
  inputKeys: string[];
  /** Цель жеста — живой узел: значит предлагается ПОГЛОЩЕНИЕ, и оно предвыбрано. */
  absorbInto?: string;
  /**
   * Чего хотел жест. «Обработка» и «сшить» приходят с разных кнопок, и угадывать намерение по
   * числу входов значило бы переигрывать выбор автора: два входа бывают и у обработки.
   */
  intent?: 'unit' | 'process';
  /**
   * ПОЗИЦИЯ В ПОСЛЕДОВАТЕЛЬНОСТИ, на которую жест метил. Пусто — «в конец листа», как было всегда.
   *
   * Число это меняет и то, ЧТО диалог имеет право предлагать: входы берутся из фронтира ПЕРЕД
   * шагом `at`, а не из конечного. Деталь, свободная в конце, на позиции 4 может быть ещё не
   * произведена или уже съедена — конечный фронтир предложил бы заведомо неверный состав.
   */
  at?: number;
  /**
   * УЗЕЛ, В КОТОРЫЙ ЖЕСТ ОБЕЩАЛ ПОПАСТЬ. Принадлежность шага узлу — ВЫЧИСЛЯЕМАЯ ПРОЕКЦИЯ (её
   * выводит `assembly-blocks.ts` из входов), в данных её нет, и «вставить операцию в узел» прямым
   * действием невыразимо. Значит обещание жеста обязано ехать сюда отдельным полем: только так
   * диалог может сказать словами, что набранный состав его больше не держит.
   */
  intoUnit?: string;
};

export type CreateResult = {
  inputKeys: string[];
  operationType: string;
  zone: string;
  machineType?: string;
  pressEquipment?: string;
  /** Пусто = обработка: шаг ничего не собирает, входы остаются на столе. */
  outputUnitKey: string;
  outputUnitName: string;
};

const UNKNOWN_TYPE = 'TECH_CARD_OPERATION_TYPE_UNKNOWN';
const UNKNOWN_ZONE = 'TECH_CARD_GARMENT_ZONE_UNKNOWN';
const UNKNOWN_MACHINE = 'TECH_CARD_MACHINE_TYPE_UNKNOWN';
const UNKNOWN_PRESS = 'TECH_CARD_PRESS_EQUIPMENT_UNKNOWN';

const PRESS_TYPES = new Set([
  'TECH_CARD_OPERATION_TYPE_PRESS',
  'TECH_CARD_OPERATION_TYPE_PRESS_OPEN',
  'TECH_CARD_OPERATION_TYPE_FUSING',
]);

export function AssemblyCreateDialog({
  prefill,
  onClose,
  onCreate,
  frontier,
  unitKeys,
  pieceKeys,
  labelOf,
  unitOfPlanned,
  onCloseAutoFocus,
}: {
  prefill: CreatePrefill | null;
  onClose: () => void;
  onCreate: (r: CreateResult) => void;
  /**
   * Что лежит на столе ТАМ, КУДА МЕТИТ ЖЕСТ, — из чего вообще можно брать входы. Для жеста без
   * позиции это конец последовательности, для вставки — фронтир перед шагом `at`. Считает это
   * вызыватель: фронтир знает движок, а движок живёт у него.
   */
  frontier: string[];
  /** Ключи существующих узлов — для правила 6 и для варианта «дособрать». */
  unitKeys: Set<string>;
  /** Ключи деталей — второе полукольцо того же пространства имён. */
  pieceKeys: Set<string>;
  /** Человеческое имя ноды: имя детали или код узла. */
  labelOf: (key: string) => string;
  /**
   * В КАКОЙ УЗЕЛ ПОПАДЁТ ШАГ С ТАКИМ СОСТАВОМ, если создать его прямо сейчас. Пусто — «вне узлов».
   *
   * СЧИТАЕТ ЭТО ДВИЖОК, А НЕ ПЕРЕСКАЗ ДВИЖКА: вызыватель прогоняет `assemblySweep` +
   * `assemblyBlocks` по последовательности с ВСТАВЛЕННЫМ кандидатом и читает готовую атрибуцию.
   * Правило «блок решает первый вход, ведущий к узлу» переписанное здесь второй раз, разошлось бы
   * с оригиналом молча — а цена расхождения ровно та, ради которой предупреждение и заведено:
   * человек читает «попадёт в COLLAR» и получает шаг в хвосте «вне узлов».
   */
  unitOfPlanned?: (draft: { inputKeys: string[]; outputUnitKey: string }) => string;
  /**
   * Куда вернуть фокус, когда диалог закрылся. Нужен ФУЛСКРИНУ: его роутер клавиш — обработчик на
   * контенте оверлея, и фокус, упавший в `body`, гасит ⌘Z, ⌘F, ⌘A и все глаголы до первого клика
   * внутри. В инлайне роутера нет, проп не передаётся, поведение прежнее.
   */
  onCloseAutoFocus?: (event: Event) => void;
}) {
  const [inputs, setInputs] = useState<string[]>([]);
  // Начальное значение — UNKNOWN-сентинел словаря, а не пустая строка: именно он и означает
  // «не выбрано» во всём остальном редакторе, и именно он рисуется плейсхолдером.
  const [operationType, setOperationType] = useState(UNKNOWN_TYPE);
  const [zone, setZone] = useState(UNKNOWN_ZONE);
  const [machineType, setMachineType] = useState(UNKNOWN_MACHINE);
  const [pressEquipment, setPressEquipment] = useState(UNKNOWN_PRESS);
  const [produces, setProduces] = useState<'process' | 'unit' | 'absorb'>('process');
  const [unitKey, setUnitKey] = useState('');
  const [unitKeyTouched, setUnitKeyTouched] = useState(false);
  const [unitName, setUnitName] = useState('');

  const open = prefill !== null;

  // Каждое открытие — чистый лист: диалог собирает ОДИН жест, и донашивать за предыдущим он не
  // должен. Результат предвыбирается по жесту: бросили на живой узел — значит «дособрать».
  useEffect(() => {
    if (!prefill) return;
    setInputs(prefill.inputKeys);
    setOperationType(UNKNOWN_TYPE);
    setZone(UNKNOWN_ZONE);
    setMachineType(UNKNOWN_MACHINE);
    setPressEquipment(UNKNOWN_PRESS);
    setProduces(
      prefill.absorbInto
        ? 'absorb'
        : prefill.intent === 'process'
          ? 'process'
          : prefill.intent === 'unit' || prefill.inputKeys.length >= 2
            ? 'unit'
            : 'process',
    );
    setUnitKey('');
    setUnitKeyTouched(false);
    setUnitName('');
  }, [prefill]);

  const taken = useMemo(() => {
    const s = new Set<string>(pieceKeys);
    for (const k of unitKeys) s.add(k);
    return s;
  }, [pieceKeys, unitKeys]);

  // Код предлагается от ЗОНЫ и переигрывается, пока автор его не тронул руками: зона выбирается
  // раньше, и код, застывший на «UNIT» после выбора зоны, был бы предложением мимо.
  useEffect(() => {
    if (!open || produces !== 'unit' || unitKeyTouched) return;
    setUnitKey(suggestUnitCode(zone, taken));
  }, [open, produces, zone, taken, unitKeyTouched]);

  const distinct = useMemo(() => Array.from(new Set(inputs)), [inputs]);
  const canBeUnit = distinct.length >= 2;
  const absorbInto = prefill?.absorbInto ?? '';

  // Правило 6 и «второй производитель» — те же отказы, что в открытом шаге, теми же словами.
  const codeProblem = (() => {
    if (produces !== 'unit') return '';
    const code = unitKey.trim();
    if (!code) return 'a unit needs a code — that is what every other step calls it by';
    if (pieceKeys.has(code)) return `the key “${code}” is taken by a piece — pieces and units share one namespace`;
    if (unitKeys.has(code)) return `unit “${code}” already exists — a second producer of the same unit is impossible`;
    if (new TextEncoder().encode(code).length > 64) return "the code is longer than 64 bytes — that won't fit the column";
    return '';
  })();

  const needsMachine = operationType === 'TECH_CARD_OPERATION_TYPE_MACHINE';
  const needsPress = PRESS_TYPES.has(operationType);

  const problem = (() => {
    if (distinct.length === 0) return 'a step must have at least one input';
    // ВХОД ОБЯЗАН ЛЕЖАТЬ НА СТОЛЕ (правило 1). Прийти сюда мёртвый ключ может: выбор на полотне
    // переживает соседний жест, который эту деталь съел, и «обработка · 1» по ней родила бы шаг,
    // который движок и сервер отвергнут. Диалог, обещающий валидный шаг, обязан это ловить.
    const dead = distinct.find((k) => !frontier.includes(k));
    if (dead) return `“${dead}” is no longer on the table — it can't be taken as an input`;
    // Поглощение теряет смысл, если поглощаемый узел сняли из входов: получился бы ВТОРОЙ
    // производитель живого узла, а не его дособирание.
    if (produces === 'absorb') {
      if (!distinct.includes(absorbInto)) {
        return `unit ${absorbInto} has been removed from the inputs — you can only add to what the step takes`;
      }
      // Поглощение — тоже сборка узла, и правило 3 на него распространяется: `GARMENT → GARMENT`
      // не дособирает ничего, движок отвечает too-few-inputs.
      if (distinct.length < 2) {
        return `there is nothing to add to ${absorbInto} with — take at least one more input into the step`;
      }
    }
    if (!operationType || operationType === UNKNOWN_TYPE) return 'pick what the step does';
    if (!zone || zone === UNKNOWN_ZONE) return 'pick a zone — “other” is a legitimate answer';
    if (needsMachine && (!machineType || machineType === UNKNOWN_MACHINE)) return 'pick a machine';
    if (needsPress && (!pressEquipment || pressEquipment === UNKNOWN_PRESS)) return 'pick the pressing equipment';
    if (produces === 'unit' && !canBeUnit) {
      return 'a unit made of a single input is processing, not a unit: take at least two inputs';
    }
    return codeProblem;
  })();

  // РЕЗУЛЬТАТ ЖЕСТА, СОБРАННЫЙ ОДИН РАЗ. Его же читает и предупреждение о принадлежности, и
  // отправка: два сборщика одной строки разошлись бы ровно там, где предупреждение обещает одно,
  // а уезжает другое.
  const draft = {
    inputKeys: distinct,
    outputUnitKey: produces === 'absorb' ? absorbInto : produces === 'unit' ? unitKey.trim() : '',
    outputUnitName: produces === 'unit' ? unitName.trim() : '',
  };

  /**
   * ОБЕЩАНИЕ ЖЕСТА ПРОТИВ НАБРАННОГО СОСТАВА.
   *
   * Точка вставки внутри узла обещает шаг ИМЕННО В ЭТОМ УЗЛЕ, но принадлежность выводится из
   * входов: снял ключ узла из состава — и шаг уедет в хвост «вне узлов» или в чужой блок. Молчать
   * об этом нельзя, запрещать тоже: состав меняют осознанно, и «обработка соседней детали отсюда»
   * — законное намерение. Поэтому слова, а не блокировка.
   */
  // ПУСТОЙ СОСТАВ СУДИТСЯ НАРАВНЕ С ЛЮБЫМ ДРУГИМ, и это не мелочь: снятие ключа узла из входов —
  // и есть тот жест, ради которого предупреждение заведено, а у вставки внутрь узла ключ часто
  // единственный вход. Промолчи здесь — и человек, снявший его, увидит только «шагу нужен хотя бы
  // один вход», то есть узнает, что чего-то не хватает, но не узнает, что именно он потерял.
  const judged = !!prefill?.intoUnit && !!unitOfPlanned;
  const lands = judged ? unitOfPlanned!(draft) : '';
  const holds = judged ? lands === prefill!.intoUnit : true;
  const belongProblem = holds
    ? ''
    : lands
      ? `◌ this step will not belong to ▣ ${prefill!.intoUnit} — it lands in ▣ ${lands}`
      : `◌ this step will not belong to ▣ ${prefill!.intoUnit} — nothing it takes leads there`;

  const submit = () => {
    if (problem) return;
    onCreate({
      ...draft,
      operationType,
      zone,
      machineType: needsMachine ? machineType : undefined,
      pressEquipment: needsPress ? pressEquipment : undefined,
    });
  };

  // Кандидаты в дополнительные входы — только фронт: вход не на столе движок отвергнет, и
  // показывать такую строку значило бы предлагать заведомый отказ.
  const addable = frontier.filter((k) => !distinct.includes(k));

  return (
    <ConfirmationModal
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      onConfirm={submit}
      onCancel={onClose}
      title='new operation'
      confirmLabel='create'
      cancelLabel='cancel'
      confirmDisabled={problem !== ''}
      closeOnConfirm={false}
      // ФОКУС ВОЗВРАЩАЕТСЯ ЭКРАНУ ПРЯМО ЗДЕСЬ, а не эффектом вызывателя по следующему кадру.
      // Radix на закрытии делает `preventDefault()` и метит фокус на триггер — а триггера нет,
      // диалог открывается состоянием. Восстановление подавлено и ничем не заменено: фокус падает
      // в `body`, и весь клавиатурный роутер фулскрина умирает до первого клика внутри.
      // Вызыватель умеет то же самое эффектом, но эффект бежит РАНЬШЕ, чем `Presence` снимает
      // портал: на тот момент кнопка «cancel» ещё жива и держит фокус, и возврат приходится
      // откладывать на кадр. Здесь такта ждать не надо — Radix зовёт это ровно тогда, когда сам
      // готов отдать фокус.
      onCloseAutoFocus={onCloseAutoFocus}
    >
      <div className='flex flex-col gap-2.5'>
        {/* ГДЕ ШАГ ОКАЖЕТСЯ — ПЕРВОЙ СТРОКОЙ, потому что это рамка для всего остального. Без неё
            диалог вставки неотличим от диалога дописывания в конец: те же поля, то же «create», а
            результат в другом месте листа. Номер экранный, `(at + 1) * 10`, как везде; про переезд
            номеров следующих шагов говорит баннер `StepNumberDrift`, и второго здесь не будет. */}
        {prefill?.at !== undefined && (
          <div>
            <GroupLabel>position</GroupLabel>
            {/* «ВНУТРИ ▣ COLLAR» ГОВОРИТСЯ, ПОКА ЭТО ПРАВДА. Оставь его стоять рядом с
                предупреждением — и диалог сообщал бы обе новости сразу, а верна из них одна. */}
            <Text size='micro' variant='label'>
              {prefill.intoUnit && holds
                ? `step ${(prefill.at + 1) * 10}, inside ▣ ${prefill.intoUnit}`
                : `step ${(prefill.at + 1) * 10}`}
            </Text>
            {/* ЧЕРНИЛАМИ, А НЕ СЕРЫМ, И БЕЗ КРАСНОГО: красный занят ошибкой, а это не ошибка —
                это расхождение жеста с набранным составом, и различается оно глифом «◌» (тем же,
                каким рельс подписывает «вне узлов») и словами. */}
            {belongProblem && <Text size='micro'>{belongProblem}</Text>}
          </div>
        )}
        <div>
          <GroupLabel>inputs</GroupLabel>
          <ChipRow>
            {distinct.length === 0 && (
              <Text size='micro' variant='label' component='span'>
                no inputs — take at least one
              </Text>
            )}
            {distinct.map((k) => (
              <Chip key={k} onClick={() => setInputs((cur) => cur.filter((x) => x !== k))} title='remove the input'>
                {labelOf(k)} ✕
              </Chip>
            ))}
          </ChipRow>
          {addable.length > 0 && (
            <ChipRow className='mt-1'>
              <Text size='micro' variant='label' component='span' className='uppercase'>
                add:
              </Text>
              {addable.map((k) => (
                <Chip key={k} dashed onClick={() => setInputs((cur) => [...cur, k])} title='take as an input'>
                  {labelOf(k)}
                </Chip>
              ))}
            </ChipRow>
          )}
        </div>

        <div>
          <GroupLabel>result</GroupLabel>
          <ChipRow>
            <Chip
              dashed={produces !== 'process'}
              onClick={() => setProduces('process')}
              title='the step assembles nothing — the inputs stay available to the next steps'
            >
              processing
            </Chip>
            <Chip
              dashed={produces !== 'unit'}
              onClick={() => setProduces('unit')}
              title={canBeUnit ? 'assemble a new unit' : 'a unit needs at least two inputs'}
            >
              ▣ new unit
            </Chip>
            {absorbInto && (
              <Chip
                dashed={produces !== 'absorb'}
                onClick={() => setProduces('absorb')}
                title='add to an existing unit — it keeps its own code'
              >
                add to ▣ {absorbInto}
              </Chip>
            )}
          </ChipRow>
          {produces === 'unit' && (
            <div className='mt-1 flex flex-col gap-1'>
              <Input
                name='assemblyUnitKey'
                value={unitKey}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  setUnitKeyTouched(true);
                  setUnitKey(e.target.value);
                }}
                placeholder='unit code'
                maxLength={64}
              />
              <Input
                name='assemblyUnitName'
                value={unitName}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUnitName(e.target.value)}
                placeholder='unit name — optional, but it is what people read in print'
                maxLength={255}
              />
            </div>
          )}
        </div>

        <div className='flex flex-col gap-1'>
          <GroupLabel>what and where</GroupLabel>
          <Select
            name='assemblyOperationType'
            value={operationType}
            onValueChange={setOperationType}
            // Плейсхолдер — это UNKNOWN-значение словаря, а НЕ пустая строка: Radix запрещает
            // `Select.Item` с пустым value (пустое значение зарезервировано за «выбор снят») и
            // роняет весь экран. ВСЕ четыре словаря несут такой пункт сами — включая тип операции:
            // `OPERATION_TYPE_PICKER` открывается с `UNKNOWN` (`operation-options.ts`). Раньше здесь
            // стоял свой пункт-плейсхолдер сверху, и он ДУБЛИРОВАЛ словарный: `Select` кладёт
            // `key={item.value}`, так что React ругался на два ребёнка с одним ключом, а в открытом
            // списке плейсхолдер стоял дважды подряд. Метка берётся из общей карты и по той же
            // причине, что и все остальные: пикер и печатный лист не должны говорить о токене разное.
            items={operationTypeOptionsFor(operationType)}
            fullWidth
          />
          <Select
            name='assemblyZone'
            value={zone}
            onValueChange={setZone}
            items={zoneOptions}
            fullWidth
          />
          {needsMachine && (
            <Select
              name='assemblyMachineType'
              value={machineType}
              onValueChange={setMachineType}
              items={machineTypeOptions}
              fullWidth
            />
          )}
          {needsPress && (
            <Select
              name='assemblyPressEquipment'
              value={pressEquipment}
              onValueChange={setPressEquipment}
              items={pressEquipmentOptions}
              fullWidth
            />
          )}
        </div>

        {/* Причина названа словом, а не задизейбленной кнопкой без объяснения: «создать» гаснет и
            тут же сообщает, чего именно не хватает. */}
        {problem && (
          <Text size='micro' variant='label'>
            {problem}
          </Text>
        )}
      </div>
    </ConfirmationModal>
  );
}
