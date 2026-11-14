import fs from 'fs';
import path from 'path';
import { getOwnerSession } from './_lib/auth.js';
import { getJson } from './_lib/redis.js';

function readSampleScore() {
  try {
    const samplePath = path.join(process.cwd(), 'scores', 'sample.abc');
    return fs.readFileSync(samplePath, 'utf8');
  } catch {
    return 'X:1\nT:Sample\nM:4/4\nL:1/4\nK:C\nC D E F | G A B c |]\n';
  }
}

export default async function handler(req, res) {
  if (req.query?.blocked === '1') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sampleContent = readSampleScore();
  const session = getOwnerSession(req);

  if (!session) {
    return res.status(200).json({
      authenticated: false,
      files: [{ name: 'sample.abc', content: sampleContent }]
    });
  }

  try {
    const [syncedScores, pendingEdits] = await Promise.all([
      getJson('piano:scores', {}),
      getJson('piano:pending', {})
    ]);

    const merged = { ...syncedScores };
    merged['sample.abc'] = sampleContent;

    const pendingNames = Object.keys(pendingEdits);
    for (const name of pendingNames) {
      if (pendingEdits[name]?.content !== undefined) {
        merged[name] = pendingEdits[name].content;
      }
    }

    const files = Object.keys(merged)
      .sort((a, b) => a.localeCompare(b))
      .map((name) => ({ name, content: merged[name] }));

    return res.status(200).json({
      authenticated: true,
      files,
      pendingNames
    });
  } catch (err) {
    // Fallback to sample.abc if Redis isn't configured yet
    return res.status(200).json({
      authenticated: true,
      files: [{ name: 'sample.abc', content: sampleContent }],
      pendingNames: [],
      warning: err.message
    });
  }
}
