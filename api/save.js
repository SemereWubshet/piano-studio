import { getOwnerSession, verifyPassphrase } from './_lib/auth.js';
import { getJson, setJson } from './_lib/redis.js';

function isAuthorized(req) {
  if (getOwnerSession(req)) return true;
  const headerPass = req.headers['x-owner-passphrase'];
  return Boolean(headerPass && verifyPassphrase(headerPass));
}

function isValidFilename(name) {
  return (
    typeof name === 'string' &&
    name.endsWith('.abc') &&
    !name.includes('/') &&
    !name.includes('\\') &&
    !name.includes('..') &&
    name.length > 4 &&
    name.length <= 120
  );
}

export default async function handler(req, res) {
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const action = req.query?.action;

  if (req.method === 'GET' && action === 'pending') {
    const pending = await getJson('piano:pending', {});
    return res.status(200).json({ pending });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});

  if (action === 'clear-pending') {
    const filenames = Array.isArray(body.filenames) ? body.filenames : [];
    const pending = await getJson('piano:pending', {});
    for (const name of filenames) {
      delete pending[name];
    }
    await setJson('piano:pending', pending);
    return res.status(200).json({ ok: true, remaining: Object.keys(pending) });
  }

  if (action === 'push-scores') {
    const scores = body.scores && typeof body.scores === 'object' ? body.scores : {};
    const sanitized = {};
    for (const [name, content] of Object.entries(scores)) {
      if (isValidFilename(name) && typeof content === 'string') {
        sanitized[name] = content;
      }
    }
    await setJson('piano:scores', sanitized);
    return res.status(200).json({ ok: true, count: Object.keys(sanitized).length });
  }

  if (action === 'delete') {
    const { filename } = body;
    if (!isValidFilename(filename) || filename === 'sample.abc') {
      return res.status(400).json({ error: 'Invalid filename' });
    }
    const [scores, pending] = await Promise.all([
      getJson('piano:scores', {}),
      getJson('piano:pending', {})
    ]);
    delete scores[filename];
    delete pending[filename];
    await Promise.all([
      setJson('piano:scores', scores),
      setJson('piano:pending', pending)
    ]);
    return res.status(200).json({ ok: true, deleted: filename });
  }

  // Default: save a single phone/online edit to pending
  const { filename, content } = body;
  if (!isValidFilename(filename) || typeof content !== 'string') {
    return res.status(400).json({ error: 'Invalid filename or content' });
  }

  const pending = await getJson('piano:pending', {});
  pending[filename] = {
    content,
    updatedAt: new Date().toISOString()
  };
  await setJson('piano:pending', pending);

  return res.status(200).json({ ok: true, filename, pending: true });
}
