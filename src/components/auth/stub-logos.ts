// DEV ONLY: the sample logos of the mockup (ink, straight lines, sharp corners) as data URLs, for the
// dev stub's teams and the join sheet's logo. A production build never reaches them.

const mark = (d: string) =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2" stroke-linejoin="miter" stroke-linecap="square">${d}</svg>`,
  )}`;

export const STUB_LOGOS: Record<string, string> = {
  ostra: mark('<path d="M12 3 21 12 12 21 3 12Z"/><path d="M12 8 16 12 12 16 8 12Z"/>'),
  'atelier-nord': mark('<path d="M5 20V4l14 16V4"/>'),
  linea: mark('<path d="M3 6h18M3 12h12M3 18h6"/>'),
};

/** The stub's `GET /api/auth/team-logo/{slug}`: '' = 404. `stub.inviteLogo=0` hides them all. */
export function stubTeamLogo(slug: string): string {
  try {
    if (localStorage.getItem('stub.inviteLogo') === '0') return '';
  } catch {
    /* none */
  }
  return STUB_LOGOS[slug] ?? '';
}
