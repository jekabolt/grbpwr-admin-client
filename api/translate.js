import { translateFields } from './_openrouter.js';

/**
 * POST /api/translate
 * Body: { source: { langName, fields }, targets: [{ code, langName }], constraints }
 * Returns: { translations: { [code]: { [field]: string } } }
 *
 * The OpenRouter key lives server-side only and is never shipped in the browser bundle.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'OPENROUTER_API_KEY is not configured' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const { source, targets, constraints } = body;

    const translations = await translateFields({
      source,
      targets,
      constraints,
      apiKey,
      model: process.env.OPENROUTER_MODEL || undefined,
    });

    return res.status(200).json({ translations });
  } catch (e) {
    return res.status(502).json({ error: e?.message || 'Translation failed' });
  }
}
