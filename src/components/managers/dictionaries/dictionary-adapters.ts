import { adminService } from 'api/api';
import {
  common_Collection,
  common_Color,
  common_Country,
  common_DictionaryRevision,
  common_Tag,
} from 'api/proto-http/admin';

// R9 dictionary mutations — the single seam every dictionary screen calls. The final contract ships
// the CRUD RPCs (Create/Update/Archive{Color,Collection,Tag}, ListCountries/SetCountryActive), so
// these thin wrappers just adapt the screen's arguments to the real requests and return the new
// namespace revision for cache reconciliation.
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

// Colors are keyed by their canonical code (FK Dictionary.colors); create/archive act on the code.
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
