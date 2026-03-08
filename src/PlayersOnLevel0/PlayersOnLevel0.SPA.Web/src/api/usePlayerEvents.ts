// ACTION: SSE subscription hook.
// Connects to the player events stream and dispatches typed events.
// The API sends PascalCase JSON with PlayerId as {Value: "guid"}.

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

    function handleClickRecorded(e: MessageEvent) {
      const d = JSON.parse(e.data);
      onEventRef.current({
        type: 'clickRecorded',
        playerId: d.PlayerId?.Value ?? d.playerId,
        totalClicks: d.TotalClicks ?? d.totalClicks,
        occurredAt: d.OccurredAt ?? d.occurredAt,
      });
    }

    function handleClickAchievement(e: MessageEvent) {
      const d = JSON.parse(e.data);
      onEventRef.current({
        type: 'clickAchievementEarned',
        playerId: d.PlayerId?.Value ?? d.playerId,
        achievementId: d.AchievementId ?? d.achievementId,
        tier: d.Tier ?? d.tier,
        occurredAt: d.OccurredAt ?? d.occurredAt,
      });
    }

    function handleScoreUpdated(e: MessageEvent) {
      const d = JSON.parse(e.data);
      onEventRef.current({
        type: 'scoreUpdated',
        playerId: d.PlayerId?.Value ?? d.playerId,
        newScore: d.NewScore ?? d.newScore,
        newLevel: d.NewLevel ?? d.newLevel,
        occurredAt: d.OccurredAt ?? d.occurredAt,
      });
    }

    function handleAchievementUnlocked(e: MessageEvent) {
      const d = JSON.parse(e.data);
      onEventRef.current({
        type: 'achievementUnlocked',
        playerId: d.PlayerId?.Value ?? d.playerId,
        achievementId: d.AchievementId ?? d.achievementId,
        name: d.Name ?? d.name,
        occurredAt: d.OccurredAt ?? d.occurredAt,
      });
    }

    source.addEventListener('clickRecorded', handleClickRecorded);
    source.addEventListener('clickAchievementEarned', handleClickAchievement);
    source.addEventListener('scoreUpdated', handleScoreUpdated);
    source.addEventListener('achievementUnlocked', handleAchievementUnlocked);

    return () => source.close();
  }, [playerId]);
}
