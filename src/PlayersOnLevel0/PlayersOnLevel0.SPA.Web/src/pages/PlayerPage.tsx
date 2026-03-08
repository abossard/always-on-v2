import { useCallback, useEffect, useReducer } from 'react';
import { useParams } from 'react-router-dom';
import { getPlayer, postClick } from '../api/client';
import { usePlayerEvents } from '../api/usePlayerEvents';
import type { PlayerResponse, PlayerEvent } from '../api/types';
import { Layout } from '../components/Layout/Layout';
import { ClickButton } from '../components/ClickButton/ClickButton';
import { PlayerStats } from '../components/PlayerStats/PlayerStats';
import { AchievementList } from '../components/AchievementList/AchievementList';

// State managed by reducer — single source of truth for this page
type State =
  | { status: 'loading' }
  | { status: 'ready'; player: PlayerResponse };

type Action =
  | { type: 'loaded'; player: PlayerResponse | null }
  | { type: 'event'; event: PlayerEvent };

const emptyPlayer = (id: string): PlayerResponse => ({
  playerId: id,
  level: 1,
  score: 0,
  totalClicks: 0,
  achievements: [],
  clickAchievements: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'loaded':
      return { status: 'ready', player: action.player ?? emptyPlayer('') };

    case 'event': {
      if (state.status !== 'ready') return state;
      const p = state.player;
      const evt = action.event;

      switch (evt.type) {
        case 'clickRecorded':
          return { status: 'ready', player: { ...p, totalClicks: evt.totalClicks } };
        case 'scoreUpdated':
          return { status: 'ready', player: { ...p, score: evt.newScore, level: evt.newLevel } };
        case 'clickAchievementEarned':
          return {
            status: 'ready',
            player: {
              ...p,
              clickAchievements: [
                ...p.clickAchievements,
                { achievementId: evt.achievementId, tier: evt.tier, earnedAt: evt.occurredAt },
              ],
            },
          };
        case 'achievementUnlocked':
          return {
            status: 'ready',
            player: {
              ...p,
              achievements: [
                ...p.achievements,
                { id: evt.achievementId, name: evt.name, unlockedAt: evt.occurredAt },
              ],
            },
          };
        default:
          return state;
      }
    }
  }
}

export function PlayerPage() {
  const { playerId } = useParams<{ playerId: string }>();
  const [state, dispatch] = useReducer(reducer, { status: 'loading' });

  useEffect(() => {
    if (!playerId) return;
    getPlayer(playerId).then((player) =>
      dispatch({ type: 'loaded', player: player ?? emptyPlayer(playerId) }),
    );
  }, [playerId]);

  const onEvent = useCallback(
    (event: PlayerEvent) => dispatch({ type: 'event', event }),
    [],
  );
  usePlayerEvents(playerId, onEvent);

  const handleClick = useCallback(() => {
    if (playerId) postClick(playerId);
  }, [playerId]);

  if (state.status === 'loading') return <Layout><p>Loading...</p></Layout>;

  const { player } = state;

  return (
    <Layout>
      <PlayerStats level={player.level} score={player.score} totalClicks={player.totalClicks} />
      <ClickButton totalClicks={player.totalClicks} onClick={handleClick} />
      <AchievementList
        achievements={player.achievements}
        clickAchievements={player.clickAchievements}
      />
    </Layout>
  );
}
