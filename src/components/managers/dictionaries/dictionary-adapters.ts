import { adminService } from 'api/api';
import {
  common_Collection,
  common_Color,
  common_Country,
  common_DictionaryRevision,
  common_Fiber,
  common_Tag,
} from 'api/proto-http/admin';

// R9 dictionary mutations — the single seam every dictionary screen calls. The contract ships the CRUD
// RPCs (Create/Update/Archive{Color,Collection,Tag}, Create/ArchiveFiber, ListCountries/
// SetCountryActive), so these thin wrappers just adapt the screen's arguments to the real requests and
// return the new namespace revision for cache reconciliation.
//
// expected_version guards each mutation with optimistic concurrency on the namespace's
// dictionary_revision; the contract defines 0 as "unconditional" (skip the version check). The
// dictionary read model exposes revisions per namespace but no per-row version, so we send 0 and let
// the operator retry on the rare concurrent-edit conflict rather than block the UI on a version we
// can't cheaply thread through here.
const UNCONDITIONAL = 0;

// Reference the generated read types so this seam tracks the contract and the imports aren't dead.
export type ColorRow = common_Color;
export type CollectionRow = common_Collection;
export type TagRow = common_Tag;
export type CountryRow = common_Country;
export type FiberRow = common_Fiber;

// Colors are keyed by their canonical code (FK Dictionary.colors); create/archive/update act on the
// code. code itself is not editable from the UI (it's the FK identity referenced by product.color_code
// and feeds the SKU per common_Color's doc comment) — UpdateColor only ever changes name/hex.
export async function archiveColor(code: string): Promise<common_DictionaryRevision | undefined> {
  const res = await adminService.ArchiveColor({ code, expectedVersion: UNCONDITIONAL });
  return res.revision;
}
export async function createColor(input: {
  code: string;
  name: string;
  hex: string;
}): Promise<common_DictionaryRevision | undefined> {
  const res = await adminService.CreateColor({ ...input, expectedVersion: UNCONDITIONAL });
  return res.revision;
}
export async function updateColor(input: {
  code: string;
  name: string;
  hex: string;
}): Promise<common_DictionaryRevision | undefined> {
  const res = await adminService.UpdateColor({ ...input, expectedVersion: UNCONDITIONAL });
  return res.revision;
}

// Collections and tags are surrogate-keyed (id); archive/update act on the id, create on the name.
export async function archiveCollection(
  id: number,
): Promise<common_DictionaryRevision | undefined> {
  const res = await adminService.ArchiveCollection({ id, expectedVersion: UNCONDITIONAL });
  return res.revision;
}
export async function createCollection(input: {
  name: string;
}): Promise<common_DictionaryRevision | undefined> {
  const res = await adminService.CreateCollection({
    name: input.name,
    expectedVersion: UNCONDITIONAL,
  });
  return res.revision;
}
export async function updateCollection(input: {
  id: number;
  name: string;
}): Promise<common_DictionaryRevision | undefined> {
  const res = await adminService.UpdateCollection({ ...input, expectedVersion: UNCONDITIONAL });
  return res.revision;
}
export async function archiveTag(id: number): Promise<common_DictionaryRevision | undefined> {
  const res = await adminService.ArchiveTag({ id, expectedVersion: UNCONDITIONAL });
  return res.revision;
}
export async function createTag(input: {
  name: string;
}): Promise<common_DictionaryRevision | undefined> {
  const res = await adminService.CreateTag({ name: input.name, expectedVersion: UNCONDITIONAL });
  return res.revision;
}
export async function updateTag(input: {
  id: number;
  name: string;
}): Promise<common_DictionaryRevision | undefined> {
  const res = await adminService.UpdateTag({ ...input, expectedVersion: UNCONDITIONAL });
  return res.revision;
}

// Fibers are keyed by their canonical code (FK Dictionary.fibers), same shape as colors minus hex.
// There is no UpdateFiber RPC in the contract yet (Create/Archive only) — see the report for that gap.
export async function archiveFiber(code: string): Promise<common_DictionaryRevision | undefined> {
  const res = await adminService.ArchiveFiber({ code, expectedVersion: UNCONDITIONAL });
  return res.revision;
}
export async function createFiber(input: {
  code: string;
  name: string;
}): Promise<common_DictionaryRevision | undefined> {
  const res = await adminService.CreateFiber({ ...input, expectedVersion: UNCONDITIONAL });
  return res.revision;
}

// Countries are toggled active/inactive (never created here — the ISO set is seeded); keyed by code.
export async function setCountryActive(
  code: string,
  active: boolean,
): Promise<common_DictionaryRevision | undefined> {
  const res = await adminService.SetCountryActive({
    code,
    active,
    expectedVersion: UNCONDITIONAL,
  });
  return res.revision;
}
