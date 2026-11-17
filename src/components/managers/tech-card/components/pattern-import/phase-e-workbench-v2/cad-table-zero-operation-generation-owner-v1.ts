export const PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_ZERO_OPERATION_GENERATION_TICKET_V1 =
  'pattern-import-dxf-phase-e-cad-table-zero-operation-generation-ticket/1' as const;

export const PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_ZERO_OPERATION_GENERATION_OWNER_CLAIMS_V1 =
  Object.freeze({
    monotonicPreparationGeneration: true,
    freshImportGenerationPreserved: true,
    savedImportGenerationUsesPreparationGeneration: true,
    supersededTicketRejected: true,
    disposedTicketRejected: true,
    callerSuppliedGenerationAccepted: false,
    defaultGenerationInvented: false,
  } as const);

declare const ticketBrand: unique symbol;
export type PatternImportDxfPhaseECadTableZeroOperationGenerationTicketV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_ZERO_OPERATION_GENERATION_TICKET_V1;
  source: 'fresh-card-session' | 'saved-row-preparation';
  preparationGeneration: number;
  importGeneration: number;
  key: string;
  readonly [ticketBrand]: never;
}>;

type OwnerState = {
  nextGeneration: number;
  current: PatternImportDxfPhaseECadTableZeroOperationGenerationTicketV1 | null;
  disposed: boolean;
};

const ticketStates = new WeakMap<object, OwnerState>();

function validKey(value: string): boolean {
  return value.trim().length > 0 && value.length <= 4_096;
}

export type PatternImportDxfPhaseECadTableZeroOperationGenerationOwnerV1 = Readonly<{
  beginSaved: (key: string) => PatternImportDxfPhaseECadTableZeroOperationGenerationTicketV1;
  beginFresh: (
    key: string,
    importGeneration: number,
  ) => PatternImportDxfPhaseECadTableZeroOperationGenerationTicketV1;
  invalidate: (ticket: PatternImportDxfPhaseECadTableZeroOperationGenerationTicketV1) => void;
  dispose: () => void;
}>;

/** Owns one current zero-operation preparation generation without inventing an import epoch. */
export function createPatternImportDxfPhaseECadTableZeroOperationGenerationOwnerV1(): PatternImportDxfPhaseECadTableZeroOperationGenerationOwnerV1 {
  const state: OwnerState = { nextGeneration: 0, current: null, disposed: false };

  const begin = (
    source: PatternImportDxfPhaseECadTableZeroOperationGenerationTicketV1['source'],
    key: string,
    freshImportGeneration: number | null,
  ) => {
    if (state.disposed) throw new TypeError('The zero-operation generation owner is disposed.');
    if (!validKey(key)) throw new TypeError('A stable zero-operation preparation key is required.');
    const preparationGeneration = state.nextGeneration + 1;
    if (!Number.isSafeInteger(preparationGeneration) || preparationGeneration <= 0)
      throw new TypeError('The zero-operation preparation generation overflowed.');
    const importGeneration =
      source === 'fresh-card-session' ? freshImportGeneration : preparationGeneration;
    if (!Number.isSafeInteger(importGeneration) || (importGeneration as number) <= 0)
      throw new TypeError('A genuine positive import generation is required.');
    state.nextGeneration = preparationGeneration;
    const ticket = Object.freeze({
      schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_ZERO_OPERATION_GENERATION_TICKET_V1,
      source,
      preparationGeneration,
      importGeneration: importGeneration as number,
      key,
    }) as PatternImportDxfPhaseECadTableZeroOperationGenerationTicketV1;
    state.current = ticket;
    ticketStates.set(ticket, state);
    return ticket;
  };

  return Object.freeze({
    beginSaved: (key: string) => begin('saved-row-preparation', key, null),
    beginFresh: (key: string, importGeneration: number) =>
      begin('fresh-card-session', key, importGeneration),
    invalidate(ticket: PatternImportDxfPhaseECadTableZeroOperationGenerationTicketV1) {
      if (state.current === ticket) state.current = null;
    },
    dispose() {
      state.disposed = true;
      state.current = null;
    },
  });
}

export function isPatternImportDxfPhaseECadTableZeroOperationGenerationTicketCurrentV1(
  ticket: PatternImportDxfPhaseECadTableZeroOperationGenerationTicketV1,
): boolean {
  const state = ticket && ticketStates.get(ticket);
  return Boolean(
    state &&
      !state.disposed &&
      state.current === ticket &&
      ticket.schemaVersion ===
        PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_ZERO_OPERATION_GENERATION_TICKET_V1 &&
      Number.isSafeInteger(ticket.preparationGeneration) &&
      ticket.preparationGeneration > 0 &&
      Number.isSafeInteger(ticket.importGeneration) &&
      ticket.importGeneration > 0 &&
      validKey(ticket.key),
  );
}
