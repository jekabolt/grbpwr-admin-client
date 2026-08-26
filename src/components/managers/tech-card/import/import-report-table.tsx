/**
 * ОТЧЁТ ИМПОРТА — ОДНА таблица на два экрана: страницу импорта (сухой прогон и результат
 * фиксации) и модалку на карточке, которая показывает тот же отчёт спустя дни. Поэтому здесь
 * НЕТ ни загрузки, ни кнопок, ни навигации: компонент получает готовый отчёт и рисует его.
 *
 * СЛОВАРЬ ПРИЧИН ЗАКРЫТ НА СЕРВЕРЕ И РАСТЁТ БЕЗ НАС. Незнакомый код показывается КАК ЕСТЬ, а не
 * прячется и не заменяется на «unknown»: сервер новее клиента — это норма (контракт называет
 * причины строками, а не enum'ом, именно чтобы новая причина доехала до старого клиента, а не
 * исчезла молча). Спрятать незнакомую причину значило бы отчитаться о потере, не назвав её.
 */
import { TechCardImportCounter, TechCardImportReportLine } from 'api/proto-http/admin';
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
  colorway_not_created:
    "the colour code is not in this base's colour dictionary — add the colour and import again",
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
