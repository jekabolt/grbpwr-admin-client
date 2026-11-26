// What an error says, fit for the wizard's warning line. A gateway that is down answers with a
// whole HTML page, and the API layer hands that page on as the error's message: shown as is, the
// warning was a screen of markup ("AI names unavailable (<!DOCTYPE html> … )", 26 Nov 2026).

const MAX = 200;

/** The error in a few words: an HTML error page becomes its status, a long text is cut. */
export function errorWords(e: unknown): string {
  const raw = (e instanceof Error ? e.message : String(e)).trim();
  if (/<(!doctype|html|head|body)\b/i.test(raw)) {
    const text = raw
      .replace(/<(style|script)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ');
    const code = /error code:\s*(\d{3})/i.exec(text)?.[1] ?? /\b([45]\d\d)\b/.exec(text)?.[1];
    return code ? `the server answered ${code}` : 'the server answered with an error page';
  }
  return raw.length > MAX ? `${raw.slice(0, MAX)}…` : raw;
}
