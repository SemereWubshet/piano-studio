/**
 * Minimal Upstash Redis REST client (zero external dependencies).
 * Requires UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN env vars.
 */
async function redisCommand(commandArgs) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    throw new Error('Upstash Redis environment variables are not configured');
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(commandArgs)
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Redis error (${res.status}): ${text}`);
  }

  const data = await res.json();
  return data.result;
}

export async function getJson(key, fallback = {}) {
  const raw = await redisCommand(['GET', key]);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export async function setJson(key, value) {
  return redisCommand(['SET', key, JSON.stringify(value)]);
}

export async function incrWithExpiry(key, ttlSeconds) {
  const count = await redisCommand(['INCR', key]);
  if (count === 1) {
    await redisCommand(['EXPIRE', key, ttlSeconds]);
  }
  return count;
}
