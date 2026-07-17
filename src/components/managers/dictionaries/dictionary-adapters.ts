import { adminService } from 'api/api';
import {
  common_Collection,
  common_Color,
  common_Country,
  common_Tag,
} from 'api/proto-http/admin';

// R9 dictionary mutations — adapter seam.
//
// The intermediate contract already ships the dictionary *read models* (Dictionary.colors /
// collections / tags / countries, each versioned with archived/active flags), but the CRUD RPCs
// (ListColors/CreateColor/UpdateColor/ArchiveColor, …Collection, …Tag, ListCountries/SetCountryActive)
// arrive with the final bump. These functions are the single place the screens call, so wiring the
// real RPCs later is a one-file change.
//
// TODO(final-bump): replace each PENDING throw with the real adminService call, e.g.
//   adminService.ArchiveColor({ code, expectedVersion })
//   adminService.CreateColor({ code, name, hex })
//   adminService.SetCountryActive({ code, active, expectedVersion })
// and return the response's dictionary_revision so callers can reconcile the cache.

export class DictionaryMutationPending extends Error {
  constructor(op: string) {
    super(`${op} lands with the final contract bump — the RPC isn't published in this build yet.`);
    this.name = 'DictionaryMutationPending';
  }
}

// Reference the generated read types so this seam tracks the contract and the imports aren't dead.
export type ColorRow = common_Color;
export type CollectionRow = common_Collection;
export type TagRow = common_Tag;
export type CountryRow = common_Country;

// Touch adminService so the wiring point is explicit for the final bump (no-op today).
export const dictionaryClient = adminService;

export async function archiveColor(_code: string): Promise<void> {
  throw new DictionaryMutationPending('Archiving a color');
}
export async function createColor(_input: { code: string; name: string; hex: string }): Promise<void> {
  throw new DictionaryMutationPending('Creating a color');
}
export async function archiveCollection(_code: string): Promise<void> {
  throw new DictionaryMutationPending('Archiving a collection');
}
export async function createCollection(_input: { name: string }): Promise<void> {
  throw new DictionaryMutationPending('Creating a collection');
}
export async function archiveTag(_code: string): Promise<void> {
  throw new DictionaryMutationPending('Archiving a tag');
}
export async function createTag(_input: { code: string; name: string }): Promise<void> {
  throw new DictionaryMutationPending('Creating a tag');
}
export async function setCountryActive(_code: string, _active: boolean): Promise<void> {
  throw new DictionaryMutationPending('Toggling a country');
}
