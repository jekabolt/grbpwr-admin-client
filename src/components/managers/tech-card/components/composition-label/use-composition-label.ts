// ДАННЫЕ БЛОКА СОСТАВНИКА — та же сборка, что у страницы печати (`adaptCareLabels`), поверх
// СОХРАНЁННОЙ карточки, но с переопределениями и уходом из ФОРМЫ: что оператор только что поправил,
// то превью и показывает, не дожидаясь автосейва. Раскладка — те же `planAll` / `typeset*`, что
// у ZIP: что в блоке, то и в архиве.
import type { common_TechCard, GetColorwayByIDResponse } from 'api/proto-http/admin';
import { useMaterials } from 'components/managers/materials/components/useMaterials';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import {
  adaptCareLabels,
  useColorwayFull,
  useLogoSvg,
  type CareLabelData,
} from '../../care-labels/adapter';
import { compositionsOf, planAll, type FullPlan } from '../../care-labels/print-job';
import { collectReadiness, type Readiness } from '../../care-labels/readiness';
import { createShaper, type Shaper } from '../../care-labels/text-outline';
import { careLabelOut, type FormCareLabel } from '../labels-schema';
import { wireInt } from '../wire-int';
import type { CountryPicks } from './made-in';

// Шрифты ленты — один раз на вкладку браузера: блок монтируется вместе с карточкой, а шрифты — три
// файла по сотне килобайт.
let shaperOnce: Promise<Shaper> | null = null;
export function useShaper(): { shaper: Shaper | null; failed: boolean } {
  const [shaper, setShaper] = useState<Shaper | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    shaperOnce ??= createShaper();
    shaperOnce.then(
      (sh) => live && setShaper(sh),
      () => {
        shaperOnce = null;
        if (live) setFailed(true);
      },
    );
    return () => {
      live = false;
    };
  }, []);
  return { shaper, failed };
}

/** Ответ колорвея с выбранной, но ещё не записанной страной: превью показывает то, что уйдёт. */
function withCountry(r: GetColorwayByIDResponse, code: string): GetColorwayByIDResponse {
  const cw = r.colorway?.colorway;
  const display = cw?.display;
  return {
    ...r,
    colorway: {
      ...r.colorway!,
      colorway: {
        ...cw!,
        display: {
          ...display!,
          merchandising: { ...display?.merchandising!, countryCode: code },
        },
      },
    },
  };
}

export type CompositionLabelModel = {
  data: CareLabelData | null;
  plan: FullPlan | null;
  readiness: Readiness | null;
  shaperFailed: boolean;
  /** Колорвеи, чьи полные данные ещё едут (страна неизвестна). */
  loadingColorways: boolean;
  logoUrl: string;
};

export function useCompositionLabel({
  techCard,
  countryPicks,
  logoUrlHint,
}: {
  techCard: common_TechCard | undefined;
  countryPicks: CountryPicks;
  logoUrlHint?: string;
}): CompositionLabelModel {
  const { control } = useFormContext();
  const careLabel = useWatch({ control, name: 'careLabel' }) as FormCareLabel | undefined;
  const careInstructions = useWatch({ control, name: 'careInstructions' }) as string | undefined;
  const sizeIds = useWatch({ control, name: 'sizeIds' }) as number[] | undefined;
  const styleNumber = useWatch({ control, name: 'styleNumber' }) as string | undefined;

  const { dictionary } = useDictionary();
  const materials = useMaterials('', true);
  const colorwayIds = useMemo(
    () => (techCard?.colorways ?? []).map((c) => wireInt(c.colorwayId)).filter((id) => id > 0),
    [techCard?.colorways],
  );
  const full = useColorwayFull(colorwayIds);
  const logoMediaId = wireInt(careLabel?.logoMediaId);
  const logo = useLogoSvg(logoMediaId, logoUrlHint);

  const colorwayFull = useMemo(() => {
    if (!countryPicks.size) return full.byId;
    const m = new Map(full.byId);
    for (const [id, code] of countryPicks) {
      const r = m.get(id);
      if (r) m.set(id, withCountry(r, code));
    }
    return m;
  }, [full.byId, countryPicks]);

  const materialsOk = materials.isSuccess;
  const data = useMemo(() => {
    const insert = techCard?.techCard;
    const merged: common_TechCard = {
      ...(techCard ?? ({} as common_TechCard)),
      careInstructions: careInstructions ?? techCard?.careInstructions,
      techCard: {
        ...(insert ?? ({} as NonNullable<common_TechCard['techCard']>)),
        styleNumber: insert?.styleNumber || styleNumber || '',
        sizeIds: sizeIds ?? insert?.sizeIds ?? [],
        careLabel: careLabelOut(careLabel),
      },
    };
    return adaptCareLabels({
      techCard: merged,
      colorwayFull,
      materials: materialsOk ? materials.data?.materials ?? [] : null,
      dictionary: dictionary ?? undefined,
      runs: [],
      logoSvg: logo.svg,
    });
  }, [
    techCard,
    careInstructions,
    styleNumber,
    sizeIds,
    careLabel,
    colorwayFull,
    materialsOk,
    materials.data,
    dictionary,
    logo.svg,
  ]);

  const { shaper, failed } = useShaper();
  // Вёрстка всех колорвеев × размеров — за отложенным значением: правка строки не ждёт раскладки.
  const deferred = useDeferredValue(data);
  const plan = useMemo(() => {
    if (!shaper || !deferred) return null;
    return planAll(shaper, deferred, compositionsOf(deferred), 'duplex', deferred.label.qr);
  }, [shaper, deferred]);
  const readiness = useMemo(
    () =>
      deferred
        ? collectReadiness({
            data: deferred,
            excluded: [],
            prefs: deferred.label.qr,
            layoutHoles: plan?.layoutHoles,
            fontsFailed: failed,
          })
        : null,
    [deferred, plan, failed],
  );

  return {
    data,
    plan,
    readiness,
    shaperFailed: failed,
    loadingColorways: full.loading,
    logoUrl: logo.url,
  };
}
