// ACTION: SSE subscription hook.
// Connects to the player events stream and dispatches typed events.

import { useEffect, useRef } from 'react';
import type { PlayerEvent } from './types';

export function usePlayerEvents(
  playerId: string | undefined,
  onEvent: (event: PlayerEvent) => void,
) {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!playerId) return;

    const url = `/api/players/${playerId}/events`;
    const source = new EventSource(url);

    const handle = (type: PlayerEvent['type']) => (e: MessageEvent) => {
      const data = JSON.parse(e.data);
      onEventRef.current({ ...data, type });
    };

    source.addEventListener('clickRecorded', handle('clickRecorded'));
    source.addEventListener('clickAchievementEarned', handle('clickAchievementEarned'));
    source.addEventListener('scoreUpdated', handle('scoreUpdated'));
    source.addEventListener('achievementUnlocked', handle('achievementUnlocked'));
    source.addEventListener('leaderboardUpdated', handle('leaderboardUpdated'));

    return () => source.close();
  }, [playerId]);
}
