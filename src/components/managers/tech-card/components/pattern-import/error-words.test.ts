import { describe, expect, it } from 'vitest';

import { errorWords } from './error-words';

describe('errorWords', () => {
  it('reads the status off an HTML error page', () => {
    const page =
      '<!DOCTYPE html> <html> <head> <style>body{margin:0}p.code{font-size:24px}</style> </head> <body> <p class="code"> Error code: 503 </p> <p class="text"> Well, This is unexpected. </p> </body> </html>';
    expect(errorWords(new Error(page))).toBe('the server answered 503');
  });
  it('says so when the page names no status', () => {
    expect(errorWords('<html><body><p>Oops</p></body></html>')).toBe(
      'the server answered with an error page',
    );
  });
  it('keeps a short message and cuts a long one', () => {
    expect(errorWords(new Error('no such model'))).toBe('no such model');
    expect(errorWords('x'.repeat(500)).length).toBe(201);
  });
});
