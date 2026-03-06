export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  const url = req.query.url;
  if (!url || !String(url).startsWith('http')) {
    return res.status(400).send('Invalid url');
  }
  try {
    const resp = await fetch(String(url), { headers: { Accept: 'image/*' } });
    if (!resp.ok) throw new Error(`Upstream ${resp.status}`);
    resp.headers.forEach((v, k) => res.setHeader(k, v));
    const buf = await resp.arrayBuffer();
    res.end(Buffer.from(buf));
  } catch (e) {
    res.status(502).send('Proxy fetch failed');
  }
}
