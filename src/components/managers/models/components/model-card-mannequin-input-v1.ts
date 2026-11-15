import type { common_Model } from 'api/proto-http/admin';
import type { ModelOpenReferencePreviewInputV1 } from 'components/managers/model/components/model-open-reference-preview-input-v1';
import { getBodyMeasurementProtocolFieldV1 } from 'lib/cloth/body/measurement-protocol-v1';

export const MODEL_CARD_MANNEQUIN_INPUT_V1 = 'model-card-mannequin-input/v1' as const;

function savedMeasurements(model: common_Model): Readonly<Record<string, number | undefined>> {
  const valuesByName = new Map<string, Set<number>>();

  for (const measurement of model.model?.measurements ?? []) {
    const name = measurement.name;
    const valueMm = measurement.valueMm;
    if (
      !name ||
      !getBodyMeasurementProtocolFieldV1(name) ||
      typeof valueMm !== 'number' ||
      !Number.isFinite(valueMm) ||
      valueMm <= 0
    ) {
      continue;
    }

    const values = valuesByName.get(name) ?? new Set<number>();
    values.add(valueMm);
    valuesByName.set(name, values);
  }

  const measurements: Record<string, number | undefined> = {};
  for (const [name, values] of [...valuesByName.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    // A conflicting duplicate is ambiguous. Omitting it lets the existing resolver fail closed.
    if (values.size === 1) measurements[name] = values.values().next().value;
  }

  return Object.freeze(measurements);
}

/** Maps persisted model values into the existing display-only preview boundary without inference. */
export function modelCardMannequinInputV1(model: common_Model): ModelOpenReferencePreviewInputV1 {
  return Object.freeze({
    gender: model.model?.gender,
    measurements: savedMeasurements(model),
  });
}

/** Stable local invalidation key. It is content-derived and never sent to the backend. */
export function modelCardMannequinRevisionV1(model: common_Model): string {
  const input = modelCardMannequinInputV1(model);
  return JSON.stringify([
    MODEL_CARD_MANNEQUIN_INPUT_V1,
    model.id ?? null,
    input.gender ?? null,
    Object.entries(input.measurements).sort(([left], [right]) => left.localeCompare(right)),
  ]);
}
