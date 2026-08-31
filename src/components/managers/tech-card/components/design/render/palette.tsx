import type { GetDesignBandResponse } from 'api/proto-http/admin';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { cn } from 'lib/utility';
import { useMemo, type JSX } from 'react';
import { Button } from 'ui/components/button';
import { Chip, ChipRow } from 'ui/components/chip';
import { GroupLabel } from 'ui/components/group-label';
import Input from 'ui/components/input';
import { Pill } from 'ui/components/pill';
import Text from 'ui/components/text';

import { ColourPicker } from '../assets/colour-picker';
import {
  ASSET_FABRIC,
  ASSET_PATTERN,
  assetLabel,
  assetThumb,
  fabricUses,
  partsOfAsset,
  shelfAssets,
} from '../assets/model';
import { useColourDraft, type ColourDraft } from './drafts';
import { FieldRow, Hint, Swatch } from './field-row';
import {
  FABRIC_AUTHORITY,
  colourLabel,
  colourSubtitle,
  colourSwatchHex,
  fabricStatement,
  hexIsPaintable,
} from './model';

/**
 * FABRIC — what a render is coloured and clothed with.
 *
 * THREE STATEMENTS THAT COMBINE, WHICH IS THE WHOLE CHANGE ON THIS SCREEN. It used to be a
 * segmented switch: dictionary OR own colour OR fabric photo, one at a time, each move wiping the
 * other two fields. The owner asked for the opposite in as many words — «можно комбинировать» — and
 * the reason is a real garment: the photograph is the only thing that can state a rib knit's
 * texture, the picker is the only thing that can state an exact colour, and the words are the only
 * place «matte, slightly sheer» fits. Forcing a choice between them threw away two thirds of what a
 * person knows about the cloth.
 *
 * SO THE SCREEN'S JOB CHANGED FROM «PICK ONE» TO «SAY WHICH WINS». Three coexisting statements can
 * disagree — a blue swatch under a red picker — and the answer is NOT computed here. It is written
 * into the prompt (`internal/designgen/renderprompt.go`) so that every run resolves the collision
 * identically, and this block only REPEATS it, once, at the top: photo → material, picked colour
 * beats the photo on colour, words add what is left. A person about to spend money is entitled to
 * read the rule before pressing GENERATE, not to discover it in the picture.
 *
 * THREE RULED ROWS, NOT THREE BOXES. Each statement is one line of the ladder (`FieldRow`, the
 * `#e6e6e6` weight), because a block never contains a block and «which of these is filled in» has
 * to be answerable by running an eye down one column of labels.
 *
 * NOTHING HERE IS CARD DATA. A colourway is a fact about the style, signed off by a lab dip; this
 * is a submission to a picture generator, and the two must never be confused — which is why a typed
 * hex still carries its worded warning that it is a visualisation override. The recipe reaches the
 * server once, inside `StartDesignRun.params.colour`, and lives afterwards only as the run's own
 * frozen history.
 *
 * THE LAB-DIP CLAUSE OF THE PROTOTYPE IS STILL NOT HERE, AND STILL DELIBERATELY. The prototype
 * prints «also a colorway of this style — lab dip approved · round 1», and the badge reads the LAB
 * DIP rather than the colourway fact. This admin cannot draw it truthfully: colourways are a
 * separate entity, `GetColorwaysPaged` has no «of this tech card» filter and the band carries none,
 * so the clause would need a paged scan of the whole system to answer — and a wrong answer here is
 * a technologist rendering a colour the dyehouse has already rejected. Absent beats guessed.
 */

/** The block a dictionary colour is picked out of. Wrapped so it can scroll on a narrow screen. */
function DictionaryGrid({
  code,
  disabled,
  onPick,
}: {
  code: string;
  disabled?: boolean;
  onPick: (code: string, hex: string) => void;
}): JSX.Element {
  const { dictionary, loading } = useDictionary();
  const colors = (dictionary?.colors ?? []).filter((c) => !c.archived && (c.code ?? '').trim());

  if (loading && !colors.length) {
    return (
      <Text size='micro' variant='inactive' component='span'>
        loading the colour dictionary…
      </Text>
    );
  }
  if (!colors.length) {
    return (
      <Text size='micro' variant='inactive' component='span' className='normal-case'>
        The colour dictionary is empty on this server. Type a hex beside it, or leave the colour to
        the fabric photo.
      </Text>
    );
  }

  const current = (code ?? '').trim().toUpperCase();
  return (
    <div className='flex flex-wrap gap-1.5'>
      {colors.map((colour) => {
        const value = (colour.code ?? '').trim().toUpperCase();
        const hex = (colour.hex ?? '').trim();
        const selected = value === current;
        return (
          <button
            key={value}
            type='button'
            disabled={disabled}
            aria-pressed={selected}
            title={`${value}${colour.name ? ` · ${colour.name}` : ''}${hex ? ` · ${hex}` : ''}`}
            onClick={() => onPick(value, hex)}
            className={cn(
              'flex w-[34px] shrink-0 flex-col items-center gap-0.5 p-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor',
              selected ? 'bg-textColor' : 'hover:bg-bgZebra',
              disabled && 'cursor-not-allowed opacity-50',
            )}
          >
            <Swatch hex={hex} size={22} />
            <Text
              size='nano'
              variant='uppercase'
              component='span'
              className={selected ? '!text-bgColor' : 'text-labelColor'}
            >
              {value}
            </Text>
          </button>
        );
      })}
    </div>
  );
}

/* ─── СТАРЫЙ КВАДРАТ НАД НАТИВНЫМ `<input type='color'>` СНЯТ ЦЕЛИКОМ (V-5) ────────────────────
   Он делал ровно одно: прятал хром операционной системы под нашей рамкой, — и всё, что человек
   про цвет выбирал, происходило в чужом окне. Замена живёт в `../assets/colour-picker` и заменяет
   не оформление, а орган: выбор, ввод, пипетка и уже использованные рецепты стоят в одном месте.
   Двух пикеров в полосе быть не должно, поэтому здесь не остаётся и обёртки. */

/**
 * ═══ КОЛОНКА PHOTO ЗАМЕНЕНА НА ПОЛКУ ТКАНЕЙ (V-4, V-8) ════════════════════════════════════════
 *
 * Владелец, V-4 дословно: «сделать апплоуд текстуры материала и что бы он всегда был как
 * плейсхолдер но не обязательный и что мы мы там могли замаркать его как материал ВМЕСТО КОЛОНКИ
 * PHOTO в GENERATION — FABRIC RENDER». То есть PHOTO перестаёт быть самостоятельным органом: на
 * его месте — ссылка на ассет-ткань, живущий на карточке.
 *
 * ПОЧЕМУ ЭТО ПРАВИЛЬНО, А НЕ ПРОСТО ВЫПОЛНЕНО. Файловый пикер, стоявший здесь, привязывал ткань к
 * ОДНОМУ ПРОГОНУ: следующий рендер начинался с пустой рамки, и лоскут, выбранный вчера, приходилось
 * искать в медиатеке заново. Ткань — свойство ИЗДЕЛИЯ, а не подачи; на полке она переживает прогон,
 * несёт имя, цвет, слова и раппорт и размечается на флэтах.
 *
 * НЕСКОЛЬКО ТКАНЕЙ — ЭТО ТО ЖЕ САМОЕ ПОЛЕ (V-8: «если у нас в изделии используется больше чем одна
 * ткань что бы была возможность добавить несколько тканей»). Одна ткань это список из одного члена;
 * отдельного написания «одна ткань» нет и быть не должно, иначе два написания разошлись бы, как
 * только у любого из них появилось бы своё свойство.
 *
 * ЧТО УЕЗЖАЕТ НА ПРОВОД. `colour.fabrics` — замороженные копии (имя, медиа, цвет, слова, части,
 * раппорт), чтобы история прогона читалась после переименования или удаления ассета. И ПЕРВАЯ ткань
 * ДОПОЛНИТЕЛЬНО повторяется в скалярах `fabric_media_id`/`code`/`hex`/`words` — так велит контракт:
 * абзац старшинства в промпте называет главную фотографию по её номеру и читает его оттуда, а
 * прогон об одной ткани обязан композироваться теми же словами, что и все замороженные до него.
 * Эхо в цвет и слова ставится ТОЛЬКО в пустые поля: набранный руками hex это осознанное отклонение,
 * и затирать его выбором ткани значило бы отменять ранг 2 порядка старшинства.
 *
 * ЧАСТИ ИЗДЕЛИЯ НЕ НАБИРАЮТСЯ ЗДЕСЬ. Они выводятся из МЕТОК на флэтах (секция ASSETS), потому что
 * второе место для тех же слов разошлось бы с разметкой молча: человек видел бы на чертеже одно,
 * а модель читала другое.
 */
function ClothRow({
  band,
  state,
  disabled,
}: {
  band: GetDesignBandResponse;
  state: ColourDraft;
  disabled?: boolean;
}): JSX.Element {
  // ПАТТЕРН СТОИТ В ЭТОМ ЖЕ РЯДУ, И ЭТО НЕ НЕБРЕЖНОСТЬ. Для модели «из чего сшито» и «чем это
  // покрыто» — один вопрос; отдельного словаря у неё нет, а раппорт едет числом внутри той же
  // записи. Разводить их по двум рядам значило бы заставить человека решать, куда класть
  // набивную ткань.
  const shelf = useMemo(
    () => [...shelfAssets(band, ASSET_FABRIC), ...shelfAssets(band, ASSET_PATTERN)],
    [band],
  );
  const chosen = (state.recipe.fabrics ?? [])
    .map((f) => f.assetId ?? 0)
    .filter((id) => id > 0);

  function choose(assetId: number) {
    const next = chosen.includes(assetId)
      ? chosen.filter((id) => id !== assetId)
      : [...chosen, assetId];
    const fabrics = fabricUses(band, next);
    const first = fabrics[0];
    state.patch({
      fabrics,
      // ЭХО ПЕРВОЙ ТКАНИ В СКАЛЯРЫ — требование контракта, а не удобство; см. шапку.
      fabricMediaId: first?.mediaId ?? 0,
      // ...и только в ПУСТЫЕ поля: набранное руками это ранг 2, он старше фотографии по цвету.
      code: (state.recipe.code ?? '').trim() || first?.colourCode || '',
      hex: (state.recipe.hex ?? '').trim() || first?.colourHex || '',
      words: (state.recipe.words ?? '').trim() || first?.words || '',
    });
  }

  return (
    <FieldRow label='cloths'>
      {shelf.length === 0 ? (
        <Text size='micro' variant='label' component='span' className='normal-case'>
          No cloth on this card's shelves yet. Put one on the ASSETS block above — a texture there is
          what the render reads weave, sheen and drape from, and it stays on the card afterwards.
        </Text>
      ) : (
        <ChipRow>
          {shelf.map((a) => {
            const id = a.id ?? 0;
            const on = chosen.includes(id);
            const parts = partsOfAsset(band, id);
            const url = assetThumb(a);
            return (
              <Chip
                key={id}
                nonForm
                selected={on}
                pressed={on}
                disabled={disabled}
                data-cloth={id}
                title={
                  parts
                    ? `${assetLabel(a)} — marked on: ${parts}`
                    : `${assetLabel(a)} — not marked on any flat, so it is the whole garment`
                }
                onClick={() => choose(id)}
              >
                <span className='flex items-center gap-1'>
                  {url ? (
                    <img src={url} alt='' aria-hidden='true' className='size-[12px] object-cover' />
                  ) : null}
                  {assetLabel(a)}
                  {a.repeatMm ? ` · ${a.repeatMm} mm` : ''}
                </span>
              </Chip>
            );
          })}
        </ChipRow>
      )}

      {/* ЧТО ИМЕННО УЕДЕТ — СКАЗАНО ЗДЕСЬ, А НЕ ОБНАРУЖИТСЯ В КАРТИНКЕ. Ткань без меток покрывает
          изделие целиком; это законный ответ, а не пробел, и молчать о нём нельзя: человек,
          отметивший одну ткань из двух, обязан видеть, что вторая объявлена остатком. */}
      <div className='w-full pl-[100px]'>
        {chosen.length > 0 && (
          <Text size='micro' variant='label' component='p' className='normal-case'>
            {(state.recipe.fabrics ?? [])
              .map(
                (f) =>
                  `${f.name || 'cloth'} → ${
                    (f.parts ?? '').trim() || 'the whole garment, unless another cloth is marked'
                  }`,
              )
              .join(' · ')}
          </Text>
        )}
        <Hint>
          {chosen.length === 0
            ? 'optional — a cloth states the material a colour cannot. mark it on the flats to say which part it covers.'
            : chosen.length === 1
              ? 'one cloth: it is the whole garment. its texture governs the material, the picked colour below still beats it on colour.'
              : `${chosen.length} cloths: the marks drawn on the flats say which part is which, and the prompt repeats them.`}
        </Hint>
      </div>
    </FieldRow>
  );
}

export function Palette({
  disabled,
  /** Supplied by `RenderStudio`, so the palette and the studio's gate read one draft. */
  draft,
  band,
}: {
  band: GetDesignBandResponse;
  /** Accepted for one signature across the band's organs; the palette itself writes nothing — the
   *  recipe travels inside the run the studio starts. */
  techCardId: number;
  disabled?: boolean;
  draft?: ColourDraft;
}): JSX.Element {
  // Own draft when mounted alone, the studio's when composed. The hook is called unconditionally —
  // rules of hooks — and its result is simply not used when a draft was handed in.
  const own = useColourDraft(band);
  const state = draft ?? own;
  const recipe = state.recipe;
  const stated = fabricStatement(recipe);

  const { dictionary } = useDictionary();
  const colors = dictionary?.colors;

  /**
   * ЦВЕТА, КОТОРЫМИ ЭТА КАРТОЧКА УЖЕ РЕНДЕРИЛАСЬ. Это и есть «совместимость с сохранёнными
   * рецептами» из V-5: рецепт возвращается одним кликом внутри пикера, а не пересобирается по
   * памяти. Полоса привозит их уже дедуплицированными и свежими первыми.
   */
  const recentColours = useMemo(
    () =>
      (band.colourRecipes ?? [])
        .map((r) => ({ hex: (r.hex ?? '').trim(), code: (r.code ?? '').trim() }))
        .filter((r) => hexIsPaintable(r.hex)),
    [band.colourRecipes],
  );

  return (
    <div>
      <GroupLabel
        action={
          <Text size='micro' variant='label' component='span' className='normal-case'>
            {FABRIC_AUTHORITY}
          </Text>
        }
      >
        fabric
      </GroupLabel>

      {/* WHAT IS STATED, STATED BEFORE IT IS EDITED. The swatch, the name and the full list of
          sources stand above the controls, so the answer to «what will this render be made of»
          never depends on scanning three rows for whichever one is filled. */}
      <div className='flex flex-wrap items-start gap-3 border-b border-hairline pb-2'>
        <Swatch hex={colourSwatchHex(recipe, colors)} size={44} />
        <div className='min-w-0 flex-1'>
          <Text
            size='control'
            variant='uppercase'
            tracking='label'
            component='p'
            className='font-bold'
          >
            {colourLabel(recipe, colors)}
          </Text>
          <Text size='micro' variant='label' component='p' className='normal-case'>
            {colourSubtitle(recipe, colors)}
          </Text>
        </div>
      </div>

      {/* ── 1. THE CLOTHS — the shelf, not a file picker. */}
      <ClothRow band={band} disabled={disabled} state={state} />

      {/* ── 2. THE PICKED COLOUR — dictionary code and hex are ONE statement, on one line. */}
      <FieldRow label='colour'>
        {/* V-5, дословно: «сделать нормальный колор пикер … а то сейчас он не очень». Здесь стоял
            нативный `<input type='color'>`, открывавший пикер ОПЕРАЦИОННОЙ СИСТЕМЫ — чужое окно,
            в котором нет ни словаря колорвеев, ни цветов, которыми эта карточка уже печаталась.
            Теперь это `ColourPicker`: квадрат и полоса тона, поле HEX, пипетка там, где браузер её
            даёт, и рецепты ЭТОЙ карточки одним кликом. Довод целиком — в шапке того файла. */}
        <ColourPicker
          hex={recipe.hex ?? ''}
          disabled={disabled}
          recent={recentColours}
          onPick={(hex) => state.patch({ hex })}
        />
        <div className='w-[100px]'>
          <Input
            name='design-colour-hex'
            value={recipe.hex ?? ''}
            disabled={disabled}
            placeholder='#4a5a3c'
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              state.patch({ hex: e.target.value })
            }
          />
        </div>
        {!disabled && stated.colour && (
          <Button variant='secondary' size='xs' onClick={() => state.clear('colour')}>
            clear
          </Button>
        )}
        {hexIsPaintable(recipe.hex) && !(recipe.code ?? '').trim() && (
          <Pill tone='attention'>visualisation override — cannot become canonical</Pill>
        )}
        {/* THE DICTIONARY IS THE SAME STATEMENT AND THEREFORE THE SAME ROW. It wraps onto its own
            line under the picker (the row is `flex-wrap`, this child is full-width) instead of
            opening a second ruled line with an empty label column: three statements, three rules,
            so «which of these did I fill in» is answerable by running an eye down one column.
            ⚠ THE INDENT IS THE LABEL COLUMN, MEASURED AND NOT GUESSED — `FieldRow`'s label is 92px
            wide with an 8px gap after it. Without it the wrapped line starts at the block's left
            edge, under the word COLOUR rather than under the control it belongs to, and the swatch
            grid reads as a separate section that lost its heading. */}
        <div className='w-full space-y-1 pl-[100px]'>
          <DictionaryGrid
            code={recipe.code ?? ''}
            disabled={disabled}
            // A dictionary colour states BOTH halves: the code the prompt names and the hex the
            // screen paints. Picking one leaves the photo and the words exactly where they are.
            onPick={(code, hex) => state.patch({ code, hex })}
          />
          <Hint>
            The colour goes to the model as a name and a hex together, and it overrides the colour
            of the photo above. Picking one states nothing about the style — a colourway is signed
            off by a lab dip, not by a render.
          </Hint>
        </div>
      </FieldRow>

      {/* ── 3. THE WORDS — the lowest rank, and a legal statement entirely on its own. */}
      <FieldRow label='in words'>
        <div className='w-full max-w-[420px]'>
          <Input
            name='design-fabric-words'
            value={recipe.words ?? ''}
            disabled={disabled}
            placeholder='fine rib jersey, matte, slightly sheer…'
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              state.patch({ words: e.target.value })
            }
          />
        </div>
        {!disabled && stated.words && (
          <Button variant='secondary' size='xs' onClick={() => state.clear('words')}>
            clear
          </Button>
        )}
        <Hint>adds what the photo and the colour do not state; it never overrides either</Hint>
      </FieldRow>
    </div>
  );
}
