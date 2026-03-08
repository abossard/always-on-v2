// ACTIONS: All external communication with the API.
// These are the only functions that perform side effects.

import type { PlayerResponse } from './types';

const BASE = '/api/players';

export async function getPlayer(playerId: string): Promise<PlayerResponse | null> {
  const res = await fetch(`${BASE}/${playerId}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to get player: ${res.status}`);
  return res.json();
}

export async function postClick(playerId: string): Promise<void> {
  const res = await fetch(`${BASE}/${playerId}/click`, { method: 'POST' });
  if (!res.ok && res.status !== 202) throw new Error(`Click failed: ${res.status}`);
}

export async function addScore(playerId: string, score: number): Promise<PlayerResponse> {
  const res = await fetch(`${BASE}/${playerId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ addScore: score }),
  });
  if (!res.ok) throw new Error(`Add score failed: ${res.status}`);
  return res.json();
}
