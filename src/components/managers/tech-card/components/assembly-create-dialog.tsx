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
}: {
  prefill: CreatePrefill | null;
  onClose: () => void;
  onCreate: (r: CreateResult) => void;
  /** Что лежит на столе в конце последовательности — из чего вообще можно брать входы. */
  frontier: string[];
  /** Ключи существующих узлов — для правила 6 и для варианта «дособрать». */
  unitKeys: Set<string>;
  /** Ключи деталей — второе полукольцо того же пространства имён. */
  pieceKeys: Set<string>;
  /** Человеческое имя ноды: имя детали или код узла. */
  labelOf: (key: string) => string;
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
    if (!code) return 'узлу нужен код — им он и называется во всех остальных шагах';
    if (pieceKeys.has(code)) return `ключ «${code}» занят деталью — у деталей и узлов одно пространство имён`;
    if (unitKeys.has(code)) return `узел «${code}» уже существует — второй производитель того же узла невозможен`;
    if (new TextEncoder().encode(code).length > 64) return 'код длиннее 64 байт — столько не влезет в колонку';
    return '';
  })();

  const needsMachine = operationType === 'TECH_CARD_OPERATION_TYPE_MACHINE';
  const needsPress = PRESS_TYPES.has(operationType);

  const problem = (() => {
    if (distinct.length === 0) return 'у шага должен быть хотя бы один вход';
    // ВХОД ОБЯЗАН ЛЕЖАТЬ НА СТОЛЕ (правило 1). Прийти сюда мёртвый ключ может: выбор на полотне
    // переживает соседний жест, который эту деталь съел, и «обработка · 1» по ней родила бы шаг,
    // который движок и сервер отвергнут. Диалог, обещающий валидный шаг, обязан это ловить.
    const dead = distinct.find((k) => !frontier.includes(k));
    if (dead) return `«${dead}» больше не лежит на столе — входом его не взять`;
    // Поглощение теряет смысл, если поглощаемый узел сняли из входов: получился бы ВТОРОЙ
    // производитель живого узла, а не его дособирание.
    if (produces === 'absorb') {
      if (!distinct.includes(absorbInto)) {
        return `узел ${absorbInto} снят из входов — дособрать можно только то, что шаг берёт`;
      }
      // Поглощение — тоже сборка узла, и правило 3 на него распространяется: `GARMENT → GARMENT`
      // не дособирает ничего, движок отвечает too-few-inputs.
      if (distinct.length < 2) {
        return `дособрать ${absorbInto} нечем — возьмите на шаг ещё хотя бы один вход`;
      }
    }
    if (!operationType || operationType === UNKNOWN_TYPE) return 'выберите, что шаг делает';
    if (!zone || zone === UNKNOWN_ZONE) return 'выберите зону — «other» это законный ответ';
    if (needsMachine && (!machineType || machineType === UNKNOWN_MACHINE)) return 'выберите машинку';
    if (needsPress && (!pressEquipment || pressEquipment === UNKNOWN_PRESS)) return 'выберите оборудование ВТО';
    if (produces === 'unit' && !canBeUnit) {
      return 'узел из одного входа — это обработка, а не узел: возьмите хотя бы два входа';
    }
    return codeProblem;
  })();

  const submit = () => {
    if (problem) return;
    onCreate({
      inputKeys: distinct,
      operationType,
      zone,
      machineType: needsMachine ? machineType : undefined,
      pressEquipment: needsPress ? pressEquipment : undefined,
      outputUnitKey: produces === 'absorb' ? absorbInto : produces === 'unit' ? unitKey.trim() : '',
      outputUnitName: produces === 'unit' ? unitName.trim() : '',
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
      title='новая операция'
      confirmLabel='создать'
      cancelLabel='отменить'
      confirmDisabled={problem !== ''}
      closeOnConfirm={false}
    >
      <div className='flex flex-col gap-2.5'>
        <div>
          <GroupLabel>входы</GroupLabel>
          <ChipRow>
            {distinct.length === 0 && (
              <Text size='micro' variant='label' component='span'>
                входов нет — возьмите хотя бы один
              </Text>
            )}
            {distinct.map((k) => (
              <Chip key={k} onClick={() => setInputs((cur) => cur.filter((x) => x !== k))} title='снять вход'>
                {labelOf(k)} ✕
              </Chip>
            ))}
          </ChipRow>
          {addable.length > 0 && (
            <ChipRow className='mt-1'>
              <Text size='micro' variant='label' component='span' className='uppercase'>
                добавить:
              </Text>
              {addable.map((k) => (
                <Chip key={k} dashed onClick={() => setInputs((cur) => [...cur, k])} title='взять входом'>
                  {labelOf(k)}
                </Chip>
              ))}
            </ChipRow>
          )}
        </div>

        <div>
          <GroupLabel>результат</GroupLabel>
          <ChipRow>
            <Chip
              dashed={produces !== 'process'}
              onClick={() => setProduces('process')}
              title='шаг ничего не собирает — входы остаются доступными следующим шагам'
            >
              обработка
            </Chip>
            <Chip
              dashed={produces !== 'unit'}
              onClick={() => setProduces('unit')}
              title={canBeUnit ? 'собрать новый узел' : 'узлу нужно минимум два входа'}
            >
              ▣ новый узел
            </Chip>
            {absorbInto && (
              <Chip
                dashed={produces !== 'absorb'}
                onClick={() => setProduces('absorb')}
                title='дособрать существующий узел — он сохранит свой код'
              >
                дособрать ▣ {absorbInto}
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
                placeholder='код узла'
                maxLength={64}
              />
              <Input
                name='assemblyUnitName'
                value={unitName}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUnitName(e.target.value)}
                placeholder='имя узла — необязательно, но на печати читают его'
                maxLength={255}
              />
            </div>
          )}
        </div>

        <div className='flex flex-col gap-1'>
          <GroupLabel>что и где</GroupLabel>
          <Select
            name='assemblyOperationType'
            value={operationType}
            onValueChange={setOperationType}
            // Плейсхолдер — это UNKNOWN-значение словаря, а НЕ пустая строка: Radix запрещает
            // `Select.Item` с пустым value (пустое значение зарезервировано за «выбор снят») и
            // роняет весь экран. Зона, машинка и ВТО несут такой пункт в своих словарях с самого
            // начала; у типа операции его нет, поэтому он добавляется здесь — тем же способом.
            items={[
              { value: UNKNOWN_TYPE, label: '— what the step does —' },
              ...operationTypeOptionsFor(operationType),
            ]}
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
