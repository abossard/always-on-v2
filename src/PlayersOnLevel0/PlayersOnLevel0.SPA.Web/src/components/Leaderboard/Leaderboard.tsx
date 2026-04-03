import { useState } from 'react';
import type { LeaderboardEntryResponse, LeaderboardSnapshot } from '../../api/types';
import * as styles from './Leaderboard.css';

type Window = 'all-time' | 'daily' | 'weekly';

const WINDOWS: { key: Window; label: string }[] = [
  { key: 'all-time', label: 'All Time' },
  { key: 'daily', label: 'Today' },
  { key: 'weekly', label: 'This Week' },
];

const MEDAL: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' };

interface Props {
  currentPlayerId?: string;
  snapshot: LeaderboardSnapshot | null;
}

function entriesForWindow(snapshot: LeaderboardSnapshot | null, window: Window): LeaderboardEntryResponse[] {
  if (!snapshot) return [];
  switch (window) {
    case 'all-time': return snapshot.allTime;
    case 'daily': return snapshot.daily;
    case 'weekly': return snapshot.weekly;
  }
}

export function Leaderboard({ currentPlayerId, snapshot }: Props) {
  const [window, setWindow] = useState<Window>('all-time');
  const entries = entriesForWindow(snapshot, window);
  const currentShort = currentPlayerId?.slice(0, 8);

  return (
    <section className={styles.container} aria-label="Leaderboard">
      <h2 className={styles.heading}>Leaderboard</h2>

      <div className={styles.tabs} role="tablist" aria-label="Leaderboard time windows">
        {WINDOWS.map((w) => (
          <button
            key={w.key}
            role="tab"
            aria-selected={window === w.key}
            className={`${styles.tab} ${window === w.key ? styles.tabActive : ''}`}
            onClick={() => setWindow(w.key)}
          >
            {w.label}
          </button>
        ))}
      </div>

      {!snapshot ? (
        <p className={styles.empty}>Waiting for data…</p>
      ) : entries.length === 0 ? (
        <p className={styles.empty}>No players yet. Start clicking!</p>
      ) : (
        <div className={styles.list} role="list" aria-label="Top players">
          {entries.map((entry) => {
            const isCurrentPlayer = currentShort && entry.playerId === currentShort;
            return (
              <div
                key={`${entry.rank}-${entry.playerId}`}
                className={`${styles.row} ${isCurrentPlayer ? styles.rowHighlight : ''}`}
                role="listitem"
                aria-label={`Rank ${entry.rank}: ${entry.playerId}`}
              >
                <span className={styles.rank}>
                  {MEDAL[entry.rank] ?? `#${entry.rank}`}
                </span>
                <span className={styles.playerId}>
                  {entry.playerId}…{isCurrentPlayer ? ' (you)' : ''}
                </span>
                <span className={styles.score}>
                  {entry.score.toLocaleString()}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
