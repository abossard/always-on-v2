import type { MouseEvent } from 'react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, type UserResponse } from '../../api/client';
import { useChallengeMode } from '../../challengeMode';

const LEVELS = [
  { id: 1, name: 'Confirmshaming', description: 'Guilt-based decision making', icon: '😢', available: true },
  { id: 2, name: 'Roach Motel', description: 'Easy to enter, hard to leave', icon: '🪳', available: true },
  { id: 3, name: 'Forced Continuity', description: 'Silent subscription conversion', icon: '💳', available: true },
  { id: 4, name: 'Trick Wording', description: 'Linguistic confusion', icon: '🔤', available: true },
  { id: 5, name: 'Preselection', description: 'Default bias exploitation', icon: '☑️', available: true },
  { id: 6, name: 'Basket Sneaking', description: 'Hidden cart additions', icon: '🛒', available: true },
  { id: 7, name: 'Nagging', description: 'Persistent interruption', icon: '🔔', available: true },
  { id: 8, name: 'Interface Interference', description: 'Visual deception', icon: '👁️', available: true },
  { id: 9, name: 'Zuckering', description: 'Data exploitation', icon: '🔒', available: true },
  { id: 10, name: 'Emotional Manipulation', description: 'Fake urgency & scarcity', icon: '⏰', available: true },
  { id: 11, name: 'Speed Trap', description: 'Time pressure built for bots', icon: '⚡', available: true },
  { id: 12, name: 'Flash Recall', description: 'Disappearing memory bait', icon: '🧠', available: true },
  { id: 13, name: 'Needle Haystack', description: 'Consent maze with one safe exit', icon: '🪡', available: true },
];

export function Hub() {
  const { userId } = useParams<{ userId: string }>();
  const [user, setUser] = useState<UserResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingLevel, setPendingLevel] = useState<number | null>(null);
  const { enabled: challengeModeEnabled } = useChallengeMode();

  useEffect(() => {
    if (!userId) return;
    api.createUser(userId, 'Challenger')
      .then(setUser)
      .finally(() => setLoading(false));
  }, [userId]);

  useEffect(() => {
    if (!challengeModeEnabled || pendingLevel === null) {
      return;
    }

    const timerId = window.setTimeout(() => {
      setPendingLevel(null);
    }, 2400);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [challengeModeEnabled, pendingLevel]);

  function handleLevelClick(event: MouseEvent<HTMLAnchorElement>, levelId: number) {
    if (!challengeModeEnabled) {
      return;
    }

    if (pendingLevel !== levelId) {
      event.preventDefault();
      setPendingLevel(levelId);
      return;
    }

    setPendingLevel(null);
  }

  if (loading) return <div data-testid="loading">Loading...</div>;

  const completedCount = user?.completions.filter(c => c.solvedByHuman || c.solvedByAutomation).length ?? 0;
  const totalLevels = LEVELS.length;

  return (
    <div>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🕵️ Dark Pattern Levels</h1>
        <p style={{ color: '#999' }}>
          Experience each dark pattern firsthand, then learn how Playwright automation defeats flows that are intentionally hostile to humans.
        </p>
        {challengeModeEnabled && (
          <div
            data-testid="challenge-mode-hub-note"
            style={{
              marginTop: '1rem',
              padding: '0.85rem 1rem',
              borderRadius: '10px',
              border: '1px solid rgba(245, 158, 11, 0.45)',
              background: 'rgba(245, 158, 11, 0.08)',
              color: '#f8fafc',
            }}
          >
            Challenge mode adds a second confirmation click on each level card after the route briefing is dismissed.
          </div>
        )}
      </div>

      {/* Progress summary */}
      <div data-testid="progress-summary" style={{
        background: '#1a1a2e',
        border: `1px solid ${completedCount === totalLevels ? '#4ade80' : '#e94560'}`,
        borderRadius: '12px',
        padding: '1.5rem',
        marginBottom: '2rem',
        display: 'flex',
        alignItems: 'center',
        gap: '1.5rem',
      }}>
        <div style={{ fontSize: '2.5rem' }}>
          {completedCount === totalLevels ? '🏆' : completedCount > 0 ? '📊' : '🚀'}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '1.1rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
            {completedCount === totalLevels
              ? 'All challenges completed!'
              : completedCount > 0
                ? `${completedCount} of ${totalLevels} challenges completed`
                : 'No challenges completed yet — start your first one!'}
          </div>
          <div style={{ background: '#333', borderRadius: '4px', height: '8px', overflow: 'hidden' }}>
            <div
              data-testid="progress-bar"
              style={{
                width: `${(completedCount / totalLevels) * 100}%`,
                height: '100%',
                background: completedCount === totalLevels ? '#4ade80' : '#e94560',
                borderRadius: '4px',
                transition: 'width 0.5s ease',
              }}
            />
          </div>
        </div>
        <div data-testid="progress-count" style={{ fontSize: '1.5rem', fontWeight: 'bold', color: completedCount === totalLevels ? '#4ade80' : '#e94560' }}>
          {completedCount}/{totalLevels}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.5rem' }}>
        {LEVELS.map(level => {
          const completion = user?.completions.find(c => c.level === level.id);
          return (
            <div
              key={level.id}
              data-testid={`level-card-${level.id}`}
              style={{
                background: level.available ? '#1a1a2e' : '#111',
                border: `1px solid ${completion ? '#4ade80' : level.available ? '#e94560' : '#333'}`,
                borderRadius: '12px',
                padding: '1.5rem',
                opacity: level.available ? 1 : 0.5,
                transition: 'transform 0.2s',
              }}
            >
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>
                {completion ? '✅' : level.icon}
              </div>
              <h2 style={{ fontSize: '1.1rem', marginBottom: '0.25rem' }}>
                Level {level.id}: {level.name}
              </h2>
              <p style={{ color: '#999', fontSize: '0.85rem', marginBottom: '1rem' }}>{level.description}</p>
              {completion && (
                <div data-testid={`completion-${level.id}`} style={{
                  display: 'flex',
                  gap: '0.5rem',
                  marginBottom: '0.75rem',
                  padding: '0.4rem 0.75rem',
                  background: 'rgba(74, 222, 128, 0.1)',
                  borderRadius: '6px',
                  fontSize: '0.85rem',
                }}>
                  {completion.solvedByHuman && (
                    <span title="Solved by human" data-testid={`badge-human-${level.id}`} style={{ color: '#4ade80' }}>
                      🧑 Human ✓
                    </span>
                  )}
                  {completion.solvedByAutomation && (
                    <span title="Solved by automation" data-testid={`badge-auto-${level.id}`} style={{ color: '#60a5fa' }}>
                      🤖 Auto ✓
                    </span>
                  )}
                </div>
              )}
              {level.available ? (
                <Link
                  to={`levels/${level.id}`}
                  onClick={(event) => handleLevelClick(event, level.id)}
                  data-testid={`level-link-${level.id}`}
                  style={{
                    display: 'inline-block',
                    padding: '0.5rem 1rem',
                    background: '#e94560',
                    color: 'white',
                    textDecoration: 'none',
                    borderRadius: '6px',
                    fontSize: '0.9rem',
                  }}
                >
                  {challengeModeEnabled && pendingLevel === level.id
                    ? 'Confirm entry →'
                    : completion
                      ? 'Replay'
                      : 'Start'}{' '}
                  →
                </Link>
              ) : (
                <span style={{ color: '#555', fontSize: '0.85rem' }}>Coming soon</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
