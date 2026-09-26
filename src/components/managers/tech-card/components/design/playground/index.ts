/**
 * THE PLAYGROUND — the one aside of the studio (C-01/C-03). What the studio tab needs of it: the
 * screen, the history's matcher and scope for the open workflow (C-05, G-01), the room's own
 * predicate, and the two address writers that are not the screen's (the rail, the legacy rewrite).
 * The registry, the fields and the tiles are this folder's own business, and a re-export without a
 * reader is a promise of stability nobody pays for.
 */
export { useLegacyStepRewrite, useStepAddress } from './address';
export { inPlaygroundRoom } from './registry';
export { PlaygroundStudio, playgroundHistoryMatch, playgroundHistoryScope } from './studio';
