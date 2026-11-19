// First entry (P0 §4): the pure part — the @username rule, the words for a refusal, the starter
// specialties and the order of the calls `continue` makes. No React here.

/** A new team's offer when its vocabulary is still empty (mockup `first entry`, new team). */
export const STARTER_SPECIALTIES = [
  'pattern maker',
  'designer',
  'technologist',
  'sourcing',
  'cutter',
  'sewing',
  'production',
  'quality',
  'photographer',
];

const USERNAME = /^[a-z0-9][a-z0-9._-]{1,29}$/;

/** What the box holds → what the server gets: lowercased, a leading `@` and spaces dropped. */
export function normalUsername(typed: string): string {
  return typed.trim().replace(/^@+/, '').toLowerCase();
}

export function goodUsername(typed: string): boolean {
  return USERNAME.test(normalUsername(typed));
}

export type Field = 'name' | 'username' | 'photo' | '';

/** A refusal as one short word for the header and the field it points at. */
export function refusalOf(message: string): { note: string; field: Field } {
  const m = message.toLowerCase();
  if (m.includes('username_taken')) return { note: 'username taken', field: 'username' };
  if (m.includes('bad_username')) return { note: 'bad username', field: 'username' };
  if (m.includes('name_too_long')) return { note: 'name too long', field: 'name' };
  if (m.includes('bad_avatar')) return { note: 'bad photo', field: 'photo' };
  return { note: 'try again', field: '' };
}

/** The vocabulary offered: the team's words, else the starter words, with the person's own at the end. */
export function offeredSpecialties(vocabulary: string[], mine: string[]): string[] {
  const all = vocabulary.length ? [...vocabulary] : [...STARTER_SPECIALTIES];
  for (const s of mine) if (!all.some((x) => x.toLowerCase() === s.toLowerCase())) all.push(s);
  return all;
}

export type Photo = { kind: 'keep' } | { kind: 'none' } | { kind: 'new'; base64: string };

export interface EntryDraft {
  firstName: string;
  lastName: string;
  username: string;
  photo: Photo;
  /** Was there a photo when the screen opened (so `none` means remove). */
  hadPhoto: boolean;
  specialties: string[];
}

export interface EntryCalls {
  updateProfile: (r: {
    firstName: string;
    lastName: string;
    publicUsername: string;
  }) => Promise<unknown>;
  setAvatar: (r: { avatar: string }) => Promise<unknown>;
  setSpecialties: (r: { specialties: string[] }) => Promise<unknown>;
  finish: () => Promise<unknown>;
}

/**
 * `continue`, in the design's order: profile → photo (only when it changed) → specialties
 * (not on a paused team) → finish. The first refusal stops the run; repeating it is harmless.
 */
export async function runContinue(d: EntryDraft, paused: boolean, api: EntryCalls): Promise<void> {
  await api.updateProfile({
    firstName: d.firstName.trim(),
    lastName: d.lastName.trim(),
    publicUsername: normalUsername(d.username),
  });
  if (d.photo.kind === 'new') await api.setAvatar({ avatar: d.photo.base64 });
  else if (d.photo.kind === 'none' && d.hadPhoto) await api.setAvatar({ avatar: '' });
  if (!paused) await api.setSpecialties({ specialties: d.specialties });
  await api.finish();
}
