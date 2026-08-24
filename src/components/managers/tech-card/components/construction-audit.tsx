import { TechCardAnalysisFinding } from 'api/proto-http/admin';
import { useTechCardConstructionAudit } from 'components/managers/tech-cards/components/useTechCardQuery';
import { useSnackBarStore } from 'lib/stores/store';
import { useFormContext } from 'react-hook-form';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { Chip, ChipRow } from 'ui/components/chip';
import { Placeholder } from 'ui/components/placeholder';
import { Section } from 'ui/components/section';
import Text from 'ui/components/text';
import { DEFAULT_ISSUE_SEVERITY, DEFAULT_ISSUE_STATUS, TechCardFormData } from './schema';

// CONSTRUCTION AUDIT — the machine layer's report on the SAVED card, sitting above everything it is
// a report ABOUT. Advisory throughout: nothing here disables a control or refuses a save.
//
// EVERY TAXONOMY ON THIS SCREEN IS RENDERED AS TEXT, NEVER MATCHED AGAINST A CLOSED LIST. `severity`
// and `category` travel as strings precisely because the taxonomy grows without a client
// regeneration, so a finding that arrives with a category this bundle has never heard of must reach
// the screen — the only thing a known value buys here is a tone and a plural, and both fall back.
//
// THE `notChecked` LIST IS NOT A DISCLOSURE. It is the point of the feature: a clean report with a
// hidden «and here is what I never looked at» reads as «checked and clean», which is the one lie an
// audit must not tell. It renders always, expanded, under the findings — including when there are no
// findings at all, where it is the ONLY honest content on the panel.

// Severities in the order they are shown, and the only ones this bundle knows a tone for. An
// unknown severity is counted and drawn like the rest, just at the default tone and after these.
const SEVERITY_ORDER = ['blocker', 'error', 'warning'];
const SEVERITY_IS_LOUD = new Set(['blocker', 'error']);

// A ref is an anchor string the server mints: "op:460" | "unit:base" | "piece:SL_INS_L" |
// "bom:подкладка" | "card". WHERE each one is fixed is this admin's navigation and can never come
// from the API, so the mapping stays here — the same split lifecycle-strip makes for its checklist.
//
// `piece:` lands on PATTERNS and `bom:` on BOM by their real TabId, not by the name in the anchor:
// cut pieces moved off their own tab (?tab=pieces is a folded alias now), so «the pieces tab» is
// `patterns`. Neither carries a query param — nothing on either tab consumes one, and a param no
// reader clears would just sit in the address bar forever.
//
// `card` and any anchor kind this bundle does not know resolve to null and render as plain text: a
// link that navigates nowhere is worse than a label, and an unknown anchor is still evidence.
type RefTarget = { tab: string; extra?: Record<string, string> };

function refTarget(ref: string): RefTarget | null {
  const at = ref.indexOf(':');
  const kind = at < 0 ? ref : ref.slice(0, at);
  const value = at < 0 ? '' : ref.slice(at + 1).trim();
  if (!value) return null;
  switch (kind) {
    case 'op':
      return { tab: 'construction', extra: { op: value } };
    case 'unit':
      return { tab: 'construction', extra: { unit: value } };
    case 'piece':
      return { tab: 'patterns' };
    case 'bom':
      return { tab: 'bom' };
    default:
      return null;
  }
}

// The first operation an anchor names, for the issue this finding files. 0 = «no operation», which
// is a legal issue exactly as it is anywhere else in the card — an issue about the card as a whole.
function firstOpNumber(refs: string[]): number {
  for (const r of refs) {
    if (!r.startsWith('op:')) continue;
    const n = parseInt(r.slice(3).trim(), 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

// One anchor. `Chip nonForm` and not a `<Button>`, and that is load-bearing rather than styling:
// the construction tab lives inside `<fieldset disabled={frozen}>`, which kills every native
// control under it on a RELEASED card — the exact case where somebody reads the audit and cannot
// change a thing, so the read-only jump has to survive. The «file as issue» control below is a real
// button for the mirror-image reason: it writes, so the fieldset is right to stop it.
function RefChip({ refString, onGo }: { refString: string; onGo?: (r: string) => void }) {
  const target = refTarget(refString);
  if (!target || !onGo) {
    return (
      <Text size='micro' variant='label' component='span' tracking='label' className='uppercase'>
        {refString}
      </Text>
    );
  }
  return (
    <Chip nonForm dashed onClick={() => onGo(refString)} title={`go to ${refString}`}>
      → {refString}
    </Chip>
  );
}

function Finding({
  finding,
  onGo,
  onFile,
}: {
  finding: TechCardAnalysisFinding;
  onGo?: (r: string) => void;
  onFile: (f: TechCardAnalysisFinding) => void;
}) {
  const severity = (finding.severity ?? '').trim();
  const category = (finding.category ?? '').trim();
  const confidence = (finding.confidence ?? '').trim();
  const title = (finding.title ?? '').trim();
  const detail = (finding.detail ?? '').trim();
  const suggestion = (finding.suggestion ?? '').trim();
  const evidence = (finding.evidence ?? []).filter((e) => !!e?.trim());
  const refs = (finding.refs ?? []).filter((r) => !!r?.trim());
  // `insert_after` is meaningful on ONE category and reads as noise anywhere else, so it is gated on
  // that category rather than on being non-empty.
  const insertAfter = category === 'missing_step' ? (finding.insertAfter ?? '').trim() : '';

  return (
    <div className='border-b border-hairline py-2 last:border-b-0'>
      <ChipRow>
        {severity && <Chip tone={SEVERITY_IS_LOUD.has(severity) ? 'error' : 'default'}>{severity}</Chip>}
        {category && <Chip>{category.replace(/_/g, ' ')}</Chip>}
        {/* Any non-empty confidence is badged, not just the one value this bundle knows a sentence
            for: the machine says "" or "heuristic" today, the model layer says three other things,
            and a confidence silently dropped is a guess presented as a fact. */}
        {confidence && (
          <Chip dashed>{confidence === 'heuristic' ? 'heuristic — may be wrong' : confidence}</Chip>
        )}
      </ChipRow>

      {title && <Text className='mt-1'>{title}</Text>}
      {detail && (
        <Text size='micro' variant='label' className='mt-0.5'>
          {detail}
        </Text>
      )}
      {suggestion && (
        <Text size='micro' className='mt-0.5'>
          → {suggestion}
        </Text>
      )}

      {evidence.length > 0 && (
        <div className='mt-1 space-y-px'>
          {evidence.map((e, i) => (
            <Text key={i} size='micro' variant='label'>
              · {e}
            </Text>
          ))}
        </div>
      )}

      {insertAfter && (
        <div className='mt-1 flex flex-wrap items-center gap-1'>
          <Text size='micro' variant='label' component='span'>
            {insertAfter === 'start' ? 'insert at the start of the sequence' : 'insert after'}
          </Text>
          {insertAfter !== 'start' && <RefChip refString={insertAfter} onGo={onGo} />}
        </div>
      )}

      <div className='mt-1.5 flex flex-wrap items-center gap-1'>
        {refs.map((r) => (
          <RefChip key={r} refString={r} onGo={onGo} />
        ))}
        <Button
          type='button'
          variant='underline'
          size='xs'
          className='ml-auto shrink-0'
          onClick={() => onFile(finding)}
        >
          file as issue
        </Button>
      </div>
    </div>
  );
}

export function ConstructionAudit({
  techCardId,
  active,
  onGoTab,
}: {
  techCardId?: number;
  /**
   * Вкладка сборки открыта ПРЯМО СЕЙЧАС. Не украшение: страница монтирует все вкладки разом, и без
   * этого разбор уходил бы на сервер при открытии ЛЮБОЙ тех-карты — включая те, где на сборку никто
   * не заглянет. Тот же гейт, что у `usePieceShapes(active)` в этом же файле.
   */
  active: boolean;
  /**
   * Навигация внутри карточки — ПРОПОМ, как `onGoTab` у ленты жизненного цикла. Об идентичности
   * вкладок (`TabId`, свёрнутые псевдонимы, что из них вообще есть на этой карточке) знает только
   * `index.tsx`; здесь живёт лишь правило «какой якорь куда ведёт», которое из API прийти не может.
   */
  onGoTab?: (tab: string, extra?: Record<string, string>) => void;
}) {
  const { getValues, setValue } = useFormContext<TechCardFormData>();
  const showMessage = useSnackBarStore((st) => st.showMessage);
  const { data, isPending, isError } = useTechCardConstructionAudit(techCardId, active);

  const findings = data?.findings ?? [];
  const notChecked = (data?.notChecked ?? []).filter((n) => !!n?.trim());

  // Counted in a declared order first, then whatever else arrived, in the order it arrived — an
  // unfamiliar severity has to appear in the headline too, or the headline disagrees with the list.
  const counts = new Map<string, number>();
  for (const f of findings) {
    const s = (f.severity ?? '').trim() || 'finding';
    counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  const ordered = [
    ...SEVERITY_ORDER.filter((s) => counts.has(s)),
    ...[...counts.keys()].filter((s) => !SEVERITY_ORDER.includes(s)),
  ];
  const summary = ordered.map((s) => plural(counts.get(s) ?? 0, s)).join(' · ');

  const goRef = (r: string) => {
    const target = refTarget(r);
    if (!target || !onGoTab) return;
    onGoTab(target.tab, target.extra);
  };

  const fileAsIssue = (f: TechCardAnalysisFinding) => {
    const description =
      [f.title, f.detail, f.suggestion]
        .map((s) => (s ?? '').trim())
        .filter(Boolean)
        .join('\n\n') || 'construction audit finding';
    const issue = {
      operationNumber: firstOpNumber((f.refs ?? []).filter((r) => !!r?.trim())),
      calloutNumber: 0,
      // Пусто намеренно: заявитель — человек, а не отчёт, и подставленное сюда «audit» сделало бы
      // машинную находку неотличимой от снятой кем-то претензии.
      raisedBy: '',
      severity: DEFAULT_ISSUE_SEVERITY,
      status: DEFAULT_ISSUE_STATUS,
      description,
      resolutionNote: '',
    };
    // `setValue`, НЕ `append` ИЗ ВТОРОГО `useFieldArray`. Два field array на одно имя не вещают
    // мутации друг другу: добавленная отсюда строка была бы невидима собственному массиву вкладки
    // issues до перемонтирования, то есть претензия «подана» и не видна там, где её ищут.
    // Запись через состояние формы видят оба.
    setValue('issues', [...(getValues('issues') ?? []), issue], { shouldDirty: true });
    // Никакой навигации: человек читает отчёт сверху вниз, и уводить его со списка на середине —
    // ровно тот способ подать одну претензию вместо пяти.
    showMessage('filed on the issues tab — save the card to keep it', 'success');
  };

  return (
    <Section
      title='construction audit'
      question='— what the machine checked on the saved card, and what it did not'
    >
      {/* НЕСОХРАНЁННАЯ КАРТОЧКА — ОТДЕЛЬНАЯ ВЕТКА, А НЕ ЗАГРУЗКА. Вкладка сборки открыта и на
          `/add-tech-card` (`isTabVisible` не гейтит её на `isEditMode`), а отключённый запрос
          React Query отдаёт `isPending: true` вечно — то есть плашка «идёт разбор» висела бы над
          пустой новой карточкой до конца сеанса, обещая отчёт, который никто не заказывал.
          Аудит читает СОХРАНЁННЫЕ факты, и сказать об этом прямо дешевле, чем изображать работу. */}
      {!techCardId ? (
        <Text size='micro' variant='label'>
          the audit reads the saved card — save this one first, and it will run on every save after
          that.
        </Text>
      ) : /* Ошибка и пустота ОБЯЗАНЫ выглядеть по-разному. Пустой список находок на упавшем запросе
             читается как «всё чисто» — та самая тишина, от которой защищает `not checked`. */
      isError ? (
        <CalloutBox tone='error'>
          <Text size='micro'>
            the construction audit could not be run — this is not a clean card, it is a report that
            did not arrive.
          </Text>
        </CalloutBox>
      ) : isPending ? (
        <Placeholder label='auditing the saved assembly' className='h-8' />
      ) : (
        <div className='flex flex-col gap-2'>
          <Text size='micro' variant='label' tracking='label' className='uppercase'>
            {findings.length === 0
              ? 'no findings — every check this run ran came back clean'
              : summary}
          </Text>

          {/* Порядок сервера — как пришёл. Он ранжирован там, и пересортировка на клиенте развела
              бы два отчёта об одном прогоне. */}
          {findings.length > 0 && (
            <div className='border-t border-hairline'>
              {findings.map((f, i) => (
                <Finding key={i} finding={f} onGo={goRef} onFile={fileAsIssue} />
              ))}
            </div>
          )}

          {notChecked.length > 0 && (
            <div className='space-y-px'>
              <Text size='micro' variant='label' tracking='label' className='uppercase'>
                not checked this run
              </Text>
              {notChecked.map((n, i) => (
                <Text key={i} size='micro' variant='label'>
                  · {n}
                </Text>
              ))}
            </div>
          )}
        </div>
      )}
    </Section>
  );
}
