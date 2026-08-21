import Text from 'ui/components/text';

// ПОЛОСА ОСТАТКОВ — ГДЕ ЖИВЁТ ЗАПОЛНЕННОЕ, КОТОРОГО ЭТОТ ШАГ НЕ НЕСЁТ.
//
// Форма перестала стирать (эффекты сняты), маппер перестал зануливать (закон «едет, если
// заполнено»). Между этими двумя починками зияет дыра, и она хуже обеих болезней сразу: значение
// живо, едет на провод, сервер отвергает его ПО ИМЕНИ — а на экране его нет, потому что контрол
// своего семейства шаг не рисует. Отказ приходит на контрол, которого нет: «Failed to submit tech
// card» и всё. Полоса закрывает ровно это.
//
// СТРОКА — ЭТО ТРИ ВЕЩИ: подпись поля, значение как оно есть, и [clear]. Больше ничего: ни
// «перенести в note», ни undo смены вида, ни красная/янтарная градация — это следующая фаза. Здесь
// закрывается потеря, а не строится редактор.
//
// [clear] — ЕДИНСТВЕННОЕ МЕСТО, ГДЕ ФОРМА СТИРАЕТ, И ОНО ЧЕЛОВЕЧЕСКОЕ. В этом вся разница с
// эффектами, которые стояли до Ф4: те писали пустоту на МОНТИРОВАНИИ — карточка пачкалась от
// одного открытия, и значение исчезало раньше, чем кто-нибудь успевал его прочитать.
//
// ДВА РОДА СТРОК, И ВТОРОЙ НЕ ОЧЕВИДЕН.
//   1. ОСТАТОК — значение заполнено, контрол не смонтирован. Есть что показать и что стереть.
//   2. ОТКАЗ НА ПУСТОМ ПОЛЕ БЕЗ КОНТРОЛА — стирать нечего, показать нечего, а отказ есть. Ровно
//      этот случай приносит Ф3: «ширина отстрочки задана, режим — нет» → сервер отвечает
//      `topstitch_mode: required`. Без второго рода строк карточка снова перестала бы сохраняться
//      молча — тот же дефект, только на новом поле. Поэтому полоса рисует ЛЮБУЮ ошибку на пути
//      `operations.N.*`, чей контрол сейчас не на экране, — включая ошибку на пустом поле.
//
// Текст английский: интерфейс админки английский с 18.08.

export type ResidueRow = {
  // Имя поля в форме (без префикса `operations.N.`) — оно же ключ строки и адрес ошибки.
  field: string;
  // Полный путь RHF. Стоит на строке атрибутом `data-field`, тем же, что у настоящих контролов:
  // роутер серверных ошибок ищет поле по нему и подсвечивает — и теперь ДОВОДИТ до строки полосы,
  // а не возвращает «поля нет на экране».
  path: string;
  // Подпись — ТА ЖЕ, что у контрола этого поля в его собственном блоке. Прочитанное в полосе и
  // прочитанное в блоке обязаны называться одинаково, иначе человек ищет на экране слово, которого
  // там нет.
  label: string;
  // Значение как оно читается человеком: токен уже разложен подписью своего словаря.
  value: string;
  // Отказ сервера или zod на этом поле, если он есть.
  error?: string;
};

// Строка второго рода: отказ на поле, которого не видно и в котором нечего стирать.
export type ResidueErrorRow = {
  field: string;
  path: string;
  label: string;
  error: string;
};

export function StepResidueStrip({
  rows,
  errorRows,
  onClear,
}: {
  rows: ResidueRow[];
  errorRows: ResidueErrorRow[];
  onClear: (field: string) => void;
}) {
  if (rows.length === 0 && errorRows.length === 0) return null;
  return (
    <div data-residue-strip className='mb-2 border border-borderColor p-2'>
      {/* ЗАГОЛОВОК НАЗЫВАЕТ ПРИЧИНУ, А НЕ СОСТОЯНИЕ. «Left over» без объяснения читается как
          «мусор, удали» — и человек удаляет чужую работу. Здесь сказано, ОТКУДА это взялось (шаг
          отвечает за другое) и ЧТО будет (сохранение не пройдёт), потому что и то и другое —
          решение, которое принимает он, а не форма. */}
      <Text size='micro' variant='label' className='mb-1'>
        set here, but this step does not carry it — the save will be refused until these are cleared
        or the step is changed back
      </Text>
      <div className='space-y-px'>
        {rows.map((r) => (
          <div
            key={r.field}
            data-field={r.path}
            className='flex flex-wrap items-baseline gap-x-2 gap-y-0.5'
          >
            <Text size='micro' variant='label' component='span'>
              {r.label}
            </Text>
            <Text size='micro' component='span' className='font-bold'>
              {r.value}
            </Text>
            {/* Кнопка, а не крестик в углу: жест разрушительный и должен называться словом. */}
            <button
              type='button'
              onClick={() => onClear(r.field)}
              className='text-nano uppercase underline underline-offset-2 hover:no-underline focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-textColor'
            >
              clear
            </button>
            {r.error && (
              <Text size='micro' component='span' className='text-error'>
                {r.error}
              </Text>
            )}
          </div>
        ))}
        {errorRows.map((r) => (
          <div key={r.field} data-field={r.path} className='flex flex-wrap gap-x-2'>
            <Text size='micro' variant='label' component='span'>
              {r.label}
            </Text>
            <Text size='micro' component='span' className='text-error'>
              {r.error}
            </Text>
          </div>
        ))}
      </div>
    </div>
  );
}
