import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getPlayer, postClick } from '../api/client';
import { usePlayerEvents } from '../api/usePlayerEvents';
import type { PlayerResponse, PlayerEvent } from '../api/types';
import { Layout } from '../components/Layout/Layout';
import { ClickButton } from '../components/ClickButton/ClickButton';
import { PlayerStats } from '../components/PlayerStats/PlayerStats';
import { AchievementList } from '../components/AchievementList/AchievementList';
import { vars } from '../theme/theme.css';

const TOTAL_CLICK_MILESTONES = [100, 1_000, 10_000, 100_000, 1_000_000];

function nextMilestone(totalClicks: number): { label: string; target: number; progress: number } | null {
  const target = TOTAL_CLICK_MILESTONES.find((m) => totalClicks < m);
  if (!target) return null;
  const prev = TOTAL_CLICK_MILESTONES[TOTAL_CLICK_MILESTONES.indexOf(target) - 1] ?? 0;
  const progress = Math.min(1, (totalClicks - prev) / (target - prev));
  return { label: target >= 1_000_000 ? '1M' : target >= 1_000 ? `${target / 1_000}K` : String(target), target, progress };
}

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
  const [sseEvents, setSseEvents] = useState<PlayerEvent[]>([]);
  const [sseTotal, setSseTotal] = useState(0);
  const [clickCount, setClickCount] = useState(0);
  const [lastError, setLastError] = useState<string | null>(null);
  const renderCount = useRef(0);
  renderCount.current++;

  useEffect(() => {
    if (!playerId) return;
    getPlayer(playerId)
      .then((player) => dispatch({ type: 'loaded', player: player ?? emptyPlayer(playerId) }))
      .catch((e) => setLastError(`Load failed: ${e.message}`));
  }, [playerId]);

  const onEvent = useCallback(
    (event: PlayerEvent) => {
      dispatch({ type: 'event', event });
      setSseTotal((t) => t + 1);
      setSseEvents((prev) => [...prev.slice(-19), event]);
    },
    [],
  );
  usePlayerEvents(playerId, onEvent);

  const handleClick = useCallback(() => {
    if (playerId) {
      setClickCount((c) => c + 1);
      postClick(playerId).catch((e) => setLastError(`Click failed: ${e.message}`));
    }
  }, [playerId]);

  const bookmarkUrl = typeof window !== 'undefined' ? window.location.href : '';

  if (state.status === 'loading') return <Layout><p>Loading...</p></Layout>;

  const { player } = state;

  const diagStyle: React.CSSProperties = {
    width: '100%',
    marginTop: '2rem',
    padding: '1rem',
    backgroundColor: vars.color.surface,
    borderRadius: '8px',
    fontFamily: vars.font.mono,
    fontSize: '0.75rem',
    color: vars.color.textMuted,
    lineHeight: 1.8,
    overflowX: 'auto',
  };

  return (
    <Layout>
      <div style={{ width: '100%', display: 'flex', justifyContent: 'flex-end', marginBottom: '0.5rem' }}>
        <a
          href={bookmarkUrl}
          onClick={(e) => {
            e.preventDefault();
            navigator.clipboard.writeText(bookmarkUrl);
            alert('Player URL copied to clipboard!\n\nBookmark this page to return to your player.');
          }}
          aria-label="Bookmark this player"
          style={{
            padding: '6px 14px',
            fontSize: '0.8rem',
            borderRadius: '6px',
            border: `1px solid ${vars.color.textMuted}`,
            color: vars.color.textMuted,
            textDecoration: 'none',
            cursor: 'pointer',
          }}
        >
          🔗 Bookmark Player
        </a>
      </div>

      <PlayerStats level={player.level} score={player.score} />
      <ClickButton totalClicks={player.totalClicks} onClick={handleClick} />

      {/* Next milestone progress */}
      {(() => {
        const next = nextMilestone(player.totalClicks);
        if (!next) return (
          <p style={{ color: vars.color.accent, fontSize: '0.85rem', textAlign: 'center', margin: '0.5rem 0 1.5rem' }}>
            🎉 All click milestones reached!
          </p>
        );
        return (
          <div style={{ width: '100%', marginBottom: '1.5rem' }} aria-label="Progress to next milestone">
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: vars.color.textMuted, marginBottom: '4px' }}>
              <span>Next: {next.label} clicks</span>
              <span>{player.totalClicks.toLocaleString()} / {next.target.toLocaleString()}</span>
            </div>
            <div style={{ width: '100%', height: '4px', backgroundColor: vars.color.surface, borderRadius: vars.radius.full }}>
              <div
                role="progressbar"
                aria-label={`Progress to ${next.label} clicks`}
                aria-valuenow={Math.round(next.progress * 100)}
                aria-valuemin={0}
                aria-valuemax={100}
                style={{
                  width: `${next.progress * 100}%`,
                  height: '100%',
                  backgroundColor: vars.color.primary,
                  borderRadius: vars.radius.full,
                  transition: 'width 0.3s ease',
                }}
              />
            </div>
          </div>
        );
      })()}

      <AchievementList
        achievements={player.achievements}
        clickAchievements={player.clickAchievements}
      />

      {/* Diagnostics panel */}
      <details style={{ width: '100%', marginTop: '2rem' }}>
        <summary style={{ cursor: 'pointer', color: vars.color.textMuted, fontSize: '0.8rem' }}>
          🔍 Diagnostics
        </summary>
        <div style={diagStyle}>
          <div><strong>Player ID:</strong> {player.playerId}</div>
          <div><strong>URL:</strong> {bookmarkUrl}</div>
          <div><strong>Created:</strong> {player.createdAt}</div>
          <div><strong>Updated:</strong> {player.updatedAt}</div>
          <div><strong>Renders:</strong> {renderCount.current}</div>
          <div><strong>Clicks sent:</strong> {clickCount}</div>
          <div><strong>SSE events received:</strong> {sseTotal}</div>
          {lastError && <div style={{ color: '#ff6b6b' }}><strong>Last error:</strong> {lastError}</div>}

          <div style={{ marginTop: '0.75rem' }}>
            <strong>SSE Event Log</strong> (last 20):
          </div>
          {sseEvents.length === 0 && <div>No events yet — click the button!</div>}
          {sseEvents.map((evt, i) => (
            <div key={i} style={{ borderTop: '1px solid #222', paddingTop: '4px', marginTop: '4px' }}>
              <span style={{ color: vars.color.accent }}>{evt.type}</span>{' '}
              <span style={{ opacity: 0.6 }}>{JSON.stringify(evt, null, 0)}</span>
            </div>
          ))}

          <div style={{ marginTop: '0.75rem' }}>
            <strong>Raw Player State:</strong>
          </div>
          <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            {JSON.stringify(player, null, 2)}
          </pre>
        </div>
      </details>
    </Layout>
  );
}
