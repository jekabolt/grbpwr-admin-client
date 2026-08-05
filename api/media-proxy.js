export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  const url = req.query.url;
  if (!url || !String(url).startsWith('http')) {
    return res.status(400).send('Invalid url');
  }
  try {
    // Not image/* — this proxy also carries pattern files (DXF) for the quick view.
    const resp = await fetch(String(url), { headers: { Accept: '*/*' } });
    if (!resp.ok) throw new Error(`Upstream ${resp.status}`);
    resp.headers.forEach((v, k) => {
      // fetch() hands us the DECOMPRESSED body — forwarding the upstream encoding/length
      // headers with it makes the browser try to re-decode and fail.
      const key = k.toLowerCase();
      if (key === 'content-encoding' || key === 'content-length') return;
      res.setHeader(k, v);
    });
    const buf = await resp.arrayBuffer();
    res.end(Buffer.from(buf));
  } catch (e) {
    res.status(502).send('Proxy fetch failed');
  }
}
