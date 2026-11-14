import {
  clearSessionCookie,
  createSessionToken,
  getOwnerSession,
  setSessionCookie,
  verifyPassphrase
} from './_lib/auth.js';
import { incrWithExpiry } from './_lib/redis.js';

const MAX_ATTEMPTS = 10;
const WINDOW_SECONDS = 15 * 60;

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const session = getOwnerSession(req);
    return res.status(200).json({ authenticated: Boolean(session) });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const action = req.query?.action;
  if (action === 'logout') {
    clearSessionCookie(res);
    return res.status(200).json({ ok: true, authenticated: false });
  }

  // Rate limiting by IP (best-effort; skips if Redis isn't configured yet)
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  try {
    if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
      const attempts = await incrWithExpiry(`piano:ratelimit:${ip}`, WINDOW_SECONDS);
      if (attempts > MAX_ATTEMPTS) {
        return res.status(429).json({ error: 'Too many attempts. Try again later.' });
      }
    }
  } catch {
    // Don't block auth if rate-limit check fails
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const { passphrase } = body;

  if (!verifyPassphrase(passphrase)) {
    return res.status(401).json({ error: 'Invalid passphrase' });
  }

  const token = createSessionToken();
  setSessionCookie(res, token);
  return res.status(200).json({ ok: true, authenticated: true });
}
