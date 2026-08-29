import { createContext, useContext } from 'react';

/**
 * Does the server this bundle is talking to speak the DESIGN contract?
 *
 * STUB: the context and the reader are here, the probe that answers the question is not — that
 * comes with the band provider, and it will most likely be «GetDesignBand did not answer
 * Unimplemented», since a rolled-back binary is the only case that matters and it is precisely the
 * case that cannot be detected from a version string the old binary does not carry.
 *
 * DEFAULT `false`, AND THE DEFAULT IS THE POINT. A component rendered outside the provider, a test
 * harness, a print page mounted on its own — all of them answer «no», so the payload gate strips
 * the new fields. The failure mode of the default is a mood note that does not save; the failure
 * mode of defaulting the other way is that no tech card saves at all (see ./payload-gate).
 *
 * Two consumers, and they are different questions with one answer:
 *  - the payload gate, which decides what may travel inside an EXISTING UpdateTechCard;
 *  - the band's organs, which decide whether to call the NEW RPCs at all.
 */
const DesignCapabilityContext = createContext<boolean>(false);

export function DesignCapabilityProvider({
  value,
  children,
}: {
  value: boolean;
  children: React.ReactNode;
}) {
  return (
    <DesignCapabilityContext.Provider value={value}>{children}</DesignCapabilityContext.Provider>
  );
}

/**
 * A hook, named for the question it answers rather than for its plumbing — the call sites read
 * `if (serverSpeaksDesign())`, and that sentence is the whole contract. Rules of hooks apply: call
 * it at the top of a component, never inside a branch.
 */
export function serverSpeaksDesign(): boolean {
  return useContext(DesignCapabilityContext);
}
