/**
 * ОТЧЁТ ИМПОРТА — ОДНА таблица на два экрана: страницу импорта (сухой прогон и результат
 * фиксации) и модалку на карточке, которая показывает тот же отчёт спустя дни. Поэтому в самой
 * `ImportReportTable` НЕТ ни загрузки, ни кнопок, ни навигации: компонент получает готовый отчёт
 * и рисует его. Пишущее действие в файле ровно одно — `ApplyColorwaysAction`, и оно вынесено
 * ОТДЕЛЬНЫМ экспортом, а не спрятано внутрь таблицы: страница импорта показывает отчёт СУХОГО
 * ПРОГОНА, когда карточки ещё не существует, и кнопке там не на что ссылаться.
 *
 * СЛОВАРЬ ПРИЧИН ЗАКРЫТ НА СЕРВЕРЕ И РАСТЁТ БЕЗ НАС. Незнакомый код показывается КАК ЕСТЬ, а не
 * прячется и не заменяется на «unknown»: сервер новее клиента — это норма (контракт называет
 * причины строками, а не enum'ом, именно чтобы новая причина доехала до старого клиента, а не
 * исчезла молча). Спрятать незнакомую причину значило бы отчитаться о потере, не назвав её.
 */
import { useMutation } from '@tanstack/react-query';
import { adminService } from 'api/api';
import {
  TechCardImportCounter,
  TechCardImportReport,
  TechCardImportReportLine,
} from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { SECTION } from 'constants/routes';
import { useSnackBarStore } from 'lib/stores/store';
import { Button } from 'ui/components/button';
import { Pill } from 'ui/components/pill';
import { Stat, StatGrid } from 'ui/components/stat-grid';
import Text from 'ui/components/text';

/**
 * Человеческий перевод кодов причин. Источник — закрытый словарь `internal/techcardarchive/
 * reasons.go` (таблица в FORMAT.md §7). Одна причина — одна строка, без сокращений: строка
 * отчёта существует ровно затем, чтобы человек понял, КУДА ИДТИ.
 */
const REASON_TEXT: Record<string, string> = {
  material_not_found: 'no article in the target catalogue matches the passport',
  material_ambiguous: 'several live articles carry that code — none is picked',
  material_unit_mismatch: 'the code matched but the unit differs — not linked',
  media_missing: 'the archive has no file for a media slot the card references',
  media_object_missing: 'the source bucket would not give up the object — the archive has no bytes',
  media_upload_failed: 'the target bucket refused the bytes — the slot is cleared',
  media_vanished: 'the matching media row was deleted mid-import — the slot is cleared',
  pattern_invalid: 'the pattern file is unreadable or is not a DXF/PDF',
  size_unknown: 'the size name is not in the target size dictionary',
  size_not_in_card_range: 'the imported card does not make this size — rows under it are dropped',
  measurement_unknown: 'the measurement name is not in the target measurement dictionary',
  work_token_unknown: "the operation's work token is not in the target work catalogue",
  category_unknown: 'the category path does not resolve — the card lands without a category',
  assembly_component_not_found: 'the assembly component style number is not in the target base',
  colorways_not_applied: 'colourways travelled as reference and were not created',
  // Три кода ниже есть в `reasons.go`, но в таблице FORMAT.md §7 их НЕТ — таблица отстала от
  // словаря. Взяты из самого словаря, а не из документации.
  colorway_exists:
    "the card already carries that colour — this archive's recipe was not written over it",
  // ЗДЕСЬ БЫЛО «add the colour and import again», и это отправляло человека НЕ ТУДА: повторный
  // импорт колорвеев не создаёт вовсе (их создаёт кнопка ниже), а архив к этому моменту уже
  // зафиксирован. Правильная инструкция у сервера в колонке «what to do»
  // (`reasonGuide[ReasonColorwayNotCreated]` — «добавь цвет и нажми кнопку ещё раз»), поэтому
  // здесь остаётся только СМЫСЛ кода: колонка причины объясняет, колонка действия велит.
  colorway_not_created:
    'the colourway could not be created — the detail names the refusal (usually an unknown colour)',
  colorway_pin_lost:
    "the recipe row's material pin could not be re-resolved — it takes the BOM slot's own article",
  composition_not_derived:
    "the structured fibre breakdown is re-derived here from the card's own fabric lines",
  wastage_claim_degraded: 'a wastage/consumption claim lost its provenance and reads as manual',
  norm_marker_lost: 'the marker stamp could not be re-sewn — the norm stands, the stamp does not',
  style_number_taken: 'the style number already exists in the target base',
  unknown_entry: 'the archive holds a file this server does not know (newer archive)',
  archive_row_invalid: "the archive's own row is not usable — it is dropped, the rest imports",
  card_not_importable: 'the card breaks a rule the write path enforces — an import would refuse it',
};

/**
 * Тон статуса — ТОЛЬКО семантические токены (правило админки). Красный в этой системе означает
 * УБЫТОК, поэтому `skipped` — серый, а не красный: пропущенная строка это не потеря денег, это
 * работа, которую человек доделает руками. `degraded` — синий: система читает «на полпути,
 * нужен человек» именно синим.
 */
function statusTone(status: string): 'ok' | 'attention' | 'mut' {
  if (status === 'imported') return 'ok';
  if (status === 'degraded') return 'attention';
  return 'mut';
}

const TH = 'px-2 py-2 text-left text-[10px] font-bold uppercase tracking-wide text-labelColor';

/** Длинный ref обрезается визуально, но целиком живёт в `title` — иначе строку не опознать. */
const REF_CELL = 'px-2 max-w-[220px] truncate';

export function ImportReportCounters({ counters }: { counters: TechCardImportCounter[] }) {
  if (counters.length === 0) return null;
  return (
    <StatGrid min={130}>
      {counters.map((c, i) => (
        <Stat
          // Индекс в ключе — потому что `entity` НЕ гарантирован: два счётчика с пустым именем
          // дали бы один ключ на двоих. Список не переупорядочивается и не фильтруется, он
          // рисуется один раз из готового отчёта, поэтому индекс здесь ничего не ломает.
          key={`${c.entity ?? ''}-${i}`}
          label={c.entity ?? '—'}
          value={c.imported ?? 0}
          sub={`${c.skipped ?? 0} skipped · ${c.degraded ?? 0} degraded`}
        />
      ))}
    </StatGrid>
  );
}

/**
 * ЧТО СЧИТАЕТСЯ «ЦВЕТОМ, КОТОРОГО НА КАРТОЧКЕ ЕЩЁ НЕТ». Не всякая пропущенная строка колорвея —
 * работа для этой кнопки, и обе лишние формы стоили бы вечно висящего органа:
 *
 *   - строка о ДЕТАЛИ КРОЯ (`ref: piece_line_key=…`): деталь назвала ткань ПОКОЛОРВЕЙНО, а
 *     нажатие на этот вопрос не отвечает. Сервер её сознательно не трогает (`supersedes` в
 *     `techcard_archive_colorways.go`, FORMAT.md §5.3), поэтому она переживает ЛЮБОЕ нажатие —
 *     гейт по ней держал бы кнопку на экране навсегда, в том числе после полностью удачного
 *     применения.
 *   - строка о РЯДЕ РЕЦЕПТА (`color_code=X bom_line_key=…`): цвет-то завёлся, не приехал один
 *     ряд, и повтор его не чинит.
 *
 * Обе отличаются от строки самого цвета ФОРМОЙ ref: `tcacRef` даёт ровно `color_code=<код>`, а
 * `tcacRowRef` дописывает к нему ` bom_line_key=…` / ` piece_line_key=…`. Отсюда две проверки, а
 * не «нет пробела»: код цвета берётся из payload вербатимом, и запрет пробела в нём был бы нашим
 * изобретением, а не контрактом.
 */
const COLOUR_REF = /^color_code=/;
const ROW_REF = / (?:bom|piece)_line_key=/;

function pendingColours(lines: TechCardImportReportLine[]): number {
  const refs = new Set<string>();
  for (const l of lines) {
    if (l.entity !== 'colorway' || l.status !== 'skipped') continue;
    const ref = l.ref ?? '';
    if (!COLOUR_REF.test(ref) || ROW_REF.test(ref)) continue;
    refs.add(ref);
  }
  return refs.size;
}

/**
 * КОЛОРВЕИ ИЗ АРХИВА — ВТОРОЙ, ЯВНЫЙ ШАГ ИМПОРТА.
 *
 * Импорт колорвеев НЕ СОЗДАЁТ: колорвей — это ПРОДУКТ, и решение завести продукт нельзя
 * делегировать файлу. `colorways.json` приезжает справкой, фиксация пишет по строке
 * `colorways_not_applied` на каждый цвет, и только человек, прочитавший отчёт, нажимает эту
 * кнопку. Подпись кнопки ДОСЛОВНО совпадает с той, что сервер называет в колонке «what to do»
 * (`reasonGuide[ReasonColorwaysNotApplied]`: «Press «create colourways from archive»»): текст
 * отчёта отправляет к кнопке ПО ИМЕНИ, и разойтись они не имеют права.
 *
 * ПРАВО — `products:write`, А НЕ `tech_cards:write`. Это не описка и не копия гейта соседей:
 * `internal/rbac/rbac.go` классифицирует `ApplyTechCardImportColorways` как wr(SectionProducts),
 * потому что жест создаёт ПРОДУКТЫ той же внутренней дорогой, что `CreateColorway`. Технолог с
 * правом на тех-карты и без права на продукты кнопки не получает — но получает СТРОКУ, почему её
 * нет: отчёт прямо над ней велит «нажми кнопку», и молча убрать орган значило бы отправить
 * человека искать несуществующее.
 *
 * ОТЧЁТ ЗАМЕЩАЕТСЯ ОТВЕТОМ, А НЕ ДОПИСЫВАЕТСЯ. Сервер возвращает ХРАНИМЫЙ отчёт, переписанный
 * этим применением; дописать его к показанному значило бы оставить на экране обе версии одной
 * новости — ту, что говорит «колорвеи не приехали», рядом с только что заведёнными колорвеями.
 */
export function ApplyColorwaysAction({
  techCardId,
  lines,
  onApplied,
}: {
  techCardId: number;
  lines: TechCardImportReportLine[];
  onApplied: (report: TechCardImportReport) => void;
}) {
  const { canWrite } = usePermissions();
  const { showMessage } = useSnackBarStore();

  const apply = useMutation({
    // ПОВТОР ЗДЕСЬ СОЗДАЁТ ПРОДУКТЫ. Глобальный `mutations.retry: 1` (`src/index.tsx`) шлёт
    // второй запрос на любой отказ — а отказы этого вызова ДЕТЕРМИНИРОВАНЫ: 403 (нет
    // products:write), 404 (у карточки нет отчёта), FailedPrecondition (импорт не зафиксирован).
    // Повтор не меняет ни один из них. Сам жест идемпотентен по цвету, так что второй заход не
    // наплодил бы дублей, — но он прошёл бы ещё раз по всем цветам, по каждому взял бы
    // оптимистичный токен карточки и отодвинул бы момент, когда человек прочтёт отказ.
    retry: false,
    mutationFn: () => adminService.ApplyTechCardImportColorways({ techCardId }),
    onSuccess: (res) => {
      // Отчёт подменяем ДО тоста: тост исчезает, а таблица под ним остаётся, и она обязана
      // говорить то же, что сервер только что записал.
      if (res.report) onApplied(res.report);
      const created = res.createdColorwayIds?.length ?? 0;
      showMessage(
        created > 0
          ? `${created} colourway(s) created from the archive`
          : // ПУСТО — ЭТО НЕ ОТКАЗ. Либо всё, что вёз архив, уже стоит на карточке (повторное
            // нажатие), либо ни один цвет не завёлся и почему — сказано построчно в отчёте,
            // который в этот момент уже обновлён. Врать «создано 0 — успех» нельзя, звать это
            // ошибкой тоже: отправляем читать отчёт.
            'no new colourway was created — the report says what happened to each colour',
        'success',
      );
    },
    onError: (error: unknown) =>
      showMessage(
        error instanceof Error ? error.message : 'could not create the colourways',
        'error',
      ),
  });

  const pending = pendingColours(lines);
  if (pending === 0) return null;

  if (!canWrite(SECTION.products)) {
    return (
      <Text size='micro' variant='label'>
        {pending} colour(s) from the archive are not on this card. Creating them writes to
        products, and this account does not have that — ask somebody who keeps the catalogue to
        press «create colourways from archive» on this report.
      </Text>
    );
  }

  return (
    <div className='flex flex-col gap-1.5 border border-textInactiveColor p-2.5'>
      <div className='flex flex-wrap items-center gap-2.5'>
        <Text size='control'>
          {pending} colour(s) from the archive are not on this card
        </Text>
        <Button
          type='button'
          variant='main'
          size='sm'
          className='ml-auto uppercase'
          loading={apply.isPending}
          // `loading` в этом примитиве — ТОЛЬКО содержимое кнопки: ни `disabled`, ни
          // `pointer-events-none` он не ставит (`ui/components/button.tsx`), и второй клик
          // проходит насквозь. Здесь он стоил бы второго прохода по всем цветам с созданием
          // продуктов, поэтому гасим явно; гонку двух вкладок закрывает сервер.
          disabled={apply.isPending}
          onClick={() => apply.mutate()}
        >
          create colourways from archive
        </Button>
      </div>
      <Text size='micro' variant='label'>
        They land as DRAFT products with the archive&apos;s recipes — no SKU, no prices. A colour
        already on the card is left alone, recipe and all, so pressing twice is safe. A colour this
        base&apos;s dictionary does not carry needs the colour added first; a row the archive
        itself broke is not fixed by pressing again.
      </Text>
    </div>
  );
}

export function ImportReportTable({ lines }: { lines: TechCardImportReportLine[] }) {
  return (
    <div className='w-full overflow-x-auto'>
      <table className='w-full min-w-max border-collapse border border-textInactiveColor'>
        <thead className='bg-bgColor'>
          <tr className='border-b border-textInactiveColor'>
            <th className={TH}>entity</th>
            <th className={TH}>ref</th>
            <th className={TH}>status</th>
            <th className={TH}>reason</th>
            <th className={TH}>what to do</th>
          </tr>
        </thead>
        <tbody>
          {lines.length === 0 ? (
            <tr>
              <td colSpan={5} className='py-8 text-center'>
                {/* Пустой отчёт — это ХОРОШАЯ новость, и сказать её надо словами: пустая
                    таблица без строки читается как «не загрузилось». */}
                <Text variant='uppercase'>nothing needs attention</Text>
              </td>
            </tr>
          ) : (
            lines.map((l, i) => {
              const status = l.status ?? '';
              const reason = l.reason ?? '';
              return (
                <tr
                  key={`${l.entity ?? ''}-${l.ref ?? ''}-${reason}-${i}`}
                  className='border-b border-textInactiveColor align-top last:border-b-0'
                >
                  <td className='px-2 py-1.5 uppercase'>{l.entity || '—'}</td>
                  <td className={`${REF_CELL} py-1.5`} title={l.ref || undefined}>
                    {l.ref || '—'}
                  </td>
                  <td className='px-2 py-1.5'>
                    {status ? <Pill tone={statusTone(status)}>{status}</Pill> : '—'}
                  </td>
                  <td className='px-2 py-1.5'>
                    {reason ? (
                      <>
                        {/* `Object.hasOwn`, а не `REASON_TEXT[reason] ?? reason`: индекс
                            обычного объекта достаёт и ПРОТОТИПНЫЕ ключи, и причина с именем
                            `__proto__` или `constructor` вернула бы не строку, а объект или
                            функцию — React бросил бы на попытке их отрисовать. Словарь причин
                            закрыт и весь в snake_case, так что сегодня это недостижимо; стоит
                            это одного вызова, а держится на том, что никто никогда не назовёт
                            причину так. */}
                        <Text size='control'>
                          {Object.hasOwn(REASON_TEXT, reason) ? REASON_TEXT[reason] : reason}
                        </Text>
                        {/* Код показывается рядом с переводом, а не вместо него: по коду
                            ищут в поддержке и в FORMAT.md. */}
                        <Text size='micro' variant='label' className='font-mono'>
                          {reason}
                        </Text>
                      </>
                    ) : (
                      '—'
                    )}
                    {l.detail ? (
                      <Text size='micro' variant='label'>
                        {l.detail}
                      </Text>
                    ) : null}
                  </td>
                  <td className='px-2 py-1.5'>
                    {l.action ? (
                      <Text size='control'>{l.action}</Text>
                    ) : (
                      <Text size='control' variant='inactive'>
                        —
                      </Text>
                    )}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
