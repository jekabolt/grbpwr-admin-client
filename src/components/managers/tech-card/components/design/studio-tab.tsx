import type { common_TechCard } from 'api/proto-http/admin';
import { useState } from 'react';
import type { EditHistory } from 'ui/components/annotation/history';
import Text from 'ui/components/text';
import { Section, SectionStack } from 'ui/components/section';
import { ArtifactsPanel, type SheetCallout } from './artifacts-panel';
import { Bench } from './bench';
import { ConceptSection } from './concept-section';
import { GenerationStudio, FixContextProvider, FixContext } from './generation';
import { KindsStrip, type DesignKind } from './kinds-strip';
import { RenderStudio, ThreedStudio } from './render';
import { GenerationHistory } from './generation';
import { DesignCapabilityProvider } from './capability';
import { MoodBoard } from './mood-board';
import { PickModeProvider, usePickMode } from './pick-mode';
import { PickTray } from './band-feed';
import { ReferencesSection } from './references-section';
import { useDesignBand } from './use-design-band';

/**
 * THE STUDIO — the composed DESIGN band, and the only place that knows the order of its organs.
 *
 * The organs themselves are written independently against frozen signatures; this file is where
 * they meet. It holds no state of its own beyond the two providers, on purpose: anything it stored
 * would become a fifth place to look for the truth about a card.
 *
 * ONE READ FEEDS ALL OF THEM. `useDesignBand` is called here, once, and the band object is passed
 * down. Organs that called it separately would each get their own cache entry and the bench could
 * disagree with the feed about which instant of the card is on screen.
 */

/**
 * The pick banner. It belongs to neither the bench (which asks) nor the feed (which answers), so it
 * lives with the composer that owns both. It promises Esc in words, and `PickModeProvider` makes
 * that true with a document-level listener — the promise and its keeper are deliberately close.
 */
function PickBanner() {
  const { target, cancel } = usePickMode();
  if (!target) return null;
  return (
    <div className='sticky top-0 z-40 flex items-center justify-between gap-4 bg-textColor px-4 py-2'>
      <Text variant='selected' size='control'>
        choosing for {target.label} — click a picture in the band below
      </Text>
      <button type='button' className='uppercase underline' onClick={cancel}>
        esc to cancel
      </button>
    </div>
  );
}

export function StudioTab({
  techCardId,
  disabled,
  constructionAspects,
}: {
  techCardId?: number;
  disabled?: boolean;
  /**
   * The aspects editor, handed in from the page rather than imported here.
   *
   * It needs the whole loaded card, which this composer does not have and should not fetch a second
   * time. It travels as a node because the alternative was worse: `concept & construction
   * description` used to be one block on HEADER, and leaving the aspects behind there would have
   * split one printed section across two tabs — concept and notes in the studio, the aspects a rail
   * entry away, printing between them.
   */
  constructionAspects?: React.ReactNode;
}) {
  // ВИД — состояние студии, как `state.kind` в прототипе. Живёт здесь, у композитора: полоса
  // представлений его показывает, а экраны читают, и третьего владельца у него быть не должно.
  //
  // СТОИТ ВЫШЕ ЛЮБОГО РАННЕГО ВОЗВРАТА, и это не стиль. Ниже них он простоял ровно один прогон, и
  // этого хватило: пока полоса грузится, компонент выходит раньше и хук не исполняется, а после
  // загрузки исполняется — хуков становится БОЛЬШЕ, чем в прошлый раз. React отвечает ошибкой 310
  // и сносит ВСЁ дерево: вкладка уходит в белое целиком, потому что границы ошибок над ней нет.
  const [kind, setKind] = useState<DesignKind>('flat');
  const { band, isLoading, serverSpeaks, error } = useDesignBand(techCardId);

  // A card that has not been created yet has no band and cannot have one: every write below is
  // keyed by tech_card_id. Saying so is more useful than rendering seven empty organs.
  if (!techCardId) {
    return (
      <SectionStack>
        <Section title='studio' question='— what this style looks like, before it is frozen'>
          <Text variant='inactive' size='control'>
            Save this tech card first. The studio hangs off the card, so there is nothing to hang it
            on yet.
          </Text>
        </Section>
      </SectionStack>
    );
  }

  if (isLoading) {
    return (
      <SectionStack>
        <Section title='studio'>
          <Text variant='inactive' size='control'>
            loading…
          </Text>
        </Section>
      </SectionStack>
    );
  }

  const readOnly = !!disabled;

  // WHAT SURVIVES A SERVER THAT DOES NOT SPEAK THE BAND.
  //
  // The moodboard, the kinds strip and the description are fields of the tech card form: they save
  // through the ordinary UpdateTechCard and touch not one design RPC. Hiding them behind the band
  // read — which is what an early return here would do — would mean that on a contour whose binary
  // predates the band, the studio is empty AND the old moodboard tab is folded away, i.e. the human
  // loses a screen that works. The band's own organs degrade; these three do not.
  const bandless = !serverSpeaks;

  return (
    <DesignCapabilityProvider value={!bandless}>
      <PickModeProvider>
        {/* Починка живёт РЯДОМ с режимом выбора, а не внутри генерации: полосу починки зажигает
            дверь на слоте верстака, а гасит запуск прогона — два разных органа, одно состояние. */}
        <FixContextProvider>
        <PickBanner />
        <SectionStack>
          {/* ПОРЯДОК — ПРОТОТИПА, И СВЕРЕН СО СБОРЩИКОМ (`proto.html:3875-3893`), А НЕ С ПАМЯТЬЮ:
                topRow → moodboard → kinds → references → ГЕНЕРАЦИЯ → SLOTS → concept.
              Шапка карточки (`topRowHtml`) стоит выше, в `index.tsx`: она первый ряд СТУДИИ.
              Генерация — это форма запуска, история прогонов и пустое состояние, и собирает их
              `GenerationStudio` по правилу самого прототипа (`briefContent`).
              Полоса листа и предупреждение о смеси — части блока слотов (`slotsHtml` зовёт
              `sheetbarHtml` и `mixwarnHtml` в своей шапке), поэтому стоят вплотную над верстаком.
              Верстак ПОСЛЕДНИЙ: сначала материал, потом сборка. Описание — после всего, оно
              пишется по тому, что выше.
              КОЛОНКИ UPLOADS ЗДЕСЬ БОЛЬШЕ НЕТ — снесена решением владельца (R-18). Прототип её
              ещё несёт; расхождение сознательное и записано в описи `qa-parity.mjs`. Принесённое
              руками входит через слот «+ reference» блока INPUT и через «+ add …» пустых слотов
              верстака; кадры сплита приезжают во вход уже с ролью вида (R-17), поэтому полки им
              не нужно. Единственная роль полки, которую больше некому играть, — отвечать режиму
              выбора за пачечные картинки — живёт в `PickTray` над верстаком. */}
          <MoodBoard techCardId={techCardId} disabled={readOnly} />
          <KindsStrip band={band} kind={kind} onKindChange={setKind} />
          {bandless ? (
            <Section title='bench' question='— the flats this style is drawn from'>
              <Text variant='inactive' size='control'>
                {error
                  ? `The bench could not be read: ${error.message}`
                  : 'This server does not serve the design band yet, so the bench and the ' +
                    'reference roles are not available here. The moodboard and the description ' +
                    'above save normally.'}
              </Text>
            </Section>
          ) : (
            <>
              {/* ВХОДНАЯ СЕКЦИЯ ПЕРЕКЛЮЧАЕТСЯ ВМЕСТЕ С ВИДОМ — это правило самого прототипа
                  (`proto.html:3891`, «референсы рисуются только у FLAT; в render и 3D они в одном
                  клике, не на экране»): у рендера вход — слоты верстака, у 3D — рендеры. */}
              {kind === 'flat' && (
                <>
                  {/* ЯКОРЬ #design-input — снаружи, а не внутри блока: файл референсов чужой
                      (дорожка E2), а на якорь смотрят двери «+ add files» пустой студии и свёрнутой
                      формы генерации, которые до сноса полки вели на #design-uploads. Обёртка —
                      законный ребёнок SectionStack: это flex с gap, и div наследует ритм 24px. */}
                  <div id='design-input'>
                    <ReferencesSection techCardId={techCardId} band={band} disabled={readOnly} />
                  </div>
                  {/* ОДИН ЧИП НА ЭКРАН, и он здесь — НАД формой, как в прототипе. Заявка на
                      правку, сделанная нажатием `fix ▸` в слоте, обязана быть видна и тогда,
                      когда форма свёрнута и до неё ещё не долистали. Второй такой же чип стоял
                      внутри самой формы; пока она развёрнута, оба рисовали одну заявку, и это
                      читалось как две разные. Снят там, оставлен здесь. */}
                  <FixContext band={band} techCardId={techCardId} disabled={readOnly} />
                  <GenerationStudio band={band} techCardId={techCardId} disabled={readOnly} />
                </>
              )}
              {/* У РЕНДЕРА И 3D СВОЙ ЭКРАН И ТА ЖЕ ИСТОРИЯ ПРОГОНОВ: прототип собирает их как
                  `studioRenderHtml() + generationHistoryHtml() + slotsHtml()`. Полки загрузок в
                  этих видах нет — принесённый руками файл кладут во флэт. */}
              {kind === 'render' && (
                <>
                  <RenderStudio band={band} techCardId={techCardId} disabled={readOnly} />
                  <GenerationHistory band={band} techCardId={techCardId} disabled={readOnly} />
                </>
              )}
              {kind === 'threed' && (
                <>
                  <ThreedStudio
                    band={band}
                    techCardId={techCardId}
                    disabled={readOnly}
                    onGoToKind={setKind}
                  />
                  <GenerationHistory band={band} techCardId={techCardId} disabled={readOnly} />
                </>
              )}
              {/* ПОЛОСА ЛИСТА И ПРЕДУПРЕЖДЕНИЕ О СМЕСИ БОЛЬШЕ НЕ СТОЯТ ЗДЕСЬ. Это строки ШАПКИ
                  блока слотов (`slotsHtml` зовёт `sheetbarHtml` и `mixwarnHtml` внутри себя), и
                  тремя отдельными блоками они читались как три равновесных заявления, хотя два из
                  них — про третье. Монтирует их теперь `Bench`. */}
              {/* ЛОТОК ВЫБОРА — ВПЛОТНУЮ НАД ВЕРСТАКОМ, потому что жест начинается на его пустом
                  слоте («or mark a picture from the band») и заканчивается плиткой лотка: между
                  дверью и ответом не должно стоять пол-экрана. Вне взведённого выбора лоток — null,
                  постоянной колонки владелец не хочет (R-18). */}
              <PickTray band={band} />
              <Bench techCardId={techCardId} band={band} disabled={readOnly} />
            </>
          )}
          <ConceptSection disabled={readOnly} />
          {constructionAspects}
        </SectionStack>
        </FixContextProvider>
      </PickModeProvider>
    </DesignCapabilityProvider>
  );
}

/**
 * ARTIFACTS is a second root over the SAME band read, not a second band. It is kept in this file so
 * that the two tabs cannot drift into calling different reads — the failure that would produce is a
 * sheet that disagrees with the bench it was minted from, under one signature.
 *
 * IT ALSO CARRIES THE DRAWING EDITOR, and the two props below are the whole of what that needs. The
 * editor is mounted over ARTIFACTS rather than in the studio because `mood-callouts.tsx` holds the
 * studio's single `useFieldArray` over `callouts` and the editor holds one of its own — and in
 * react-hook-form 7.62 two instances over one name do not synchronise. This tab holds none.
 */
export function ArtifactsTab({
  techCardId,
  disabled,
  techCard,
  calloutHistory,
}: {
  techCardId?: number;
  disabled?: boolean;
  /** The loaded card: the editor resolves a `media_id` to a picture through it. */
  techCard?: common_TechCard;
  /**
   * The form's ONE undo history over `callouts`. It belongs to the page because the page is what
   * resets it when the form is re-seeded from the server; a history minted down here would outlive
   * that reset and hand back callouts the card no longer holds.
   */
  calloutHistory?: EditHistory<SheetCallout>;
}) {
  const { band, isLoading, serverSpeaks, error } = useDesignBand(techCardId);

  if (!techCardId) {
    return (
      <SectionStack>
        <Section title='artifacts' question='— the sheet the factory prints, and every version of it'>
          <Text variant='inactive' size='control'>
            Save this tech card first — a sheet is minted from a card that exists.
          </Text>
        </Section>
      </SectionStack>
    );
  }

  if (isLoading) {
    return (
      <SectionStack>
        <Section title='artifacts'>
          <Text variant='inactive' size='control'>
            loading…
          </Text>
        </Section>
      </SectionStack>
    );
  }

  // Same rule as the studio: the LIVE DOCUMENT — the card's plates and their callouts — is form
  // data and needs no design RPC at all. Only the version strip, the journal and the mint do. So the
  // panel is mounted either way and is told, once, whether the band answered; refusing to mount it
  // would take the callout editor away from every card on a contour without the band.
  return (
    <DesignCapabilityProvider value={serverSpeaks}>
      <ArtifactsPanel
        techCardId={techCardId}
        band={band}
        disabled={!!disabled}
        techCard={techCard}
        calloutHistory={calloutHistory}
      />
    </DesignCapabilityProvider>
  );
}
