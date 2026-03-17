import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type UserResponse } from '../../api/client';

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
];

export function Hub() {
  const [user, setUser] = useState<UserResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem('darkux-user-id');
    if (stored) {
      api.getUser(stored).then(setUser).catch(() => createNewUser()).finally(() => setLoading(false));
    } else {
      createNewUser().finally(() => setLoading(false));
    }
  }, []);

  async function createNewUser() {
    const u = await api.createUser('Challenger');
    localStorage.setItem('darkux-user-id', u.userId);
    setUser(u);
  }

  if (loading) return <div data-testid="loading">Loading...</div>;

  return (
    <div>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🕵️ Dark Pattern Levels</h1>
        <p style={{ color: '#999' }}>
          Experience each dark pattern firsthand, then learn how Playwright automation defeats them.
        </p>
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
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>{level.icon}</div>
              <h2 style={{ fontSize: '1.1rem', marginBottom: '0.25rem' }}>
                Level {level.id}: {level.name}
              </h2>
              <p style={{ color: '#999', fontSize: '0.85rem', marginBottom: '1rem' }}>{level.description}</p>
              {completion && (
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
                  {completion.solvedByHuman && <span title="Solved by human" data-testid={`badge-human-${level.id}`}>🧑 Human</span>}
                  {completion.solvedByAutomation && <span title="Solved by automation" data-testid={`badge-auto-${level.id}`}>🤖 Auto</span>}
                </div>
              )}
              {level.available ? (
                <Link
                  to={`/levels/${level.id}`}
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
                  {completion ? 'Replay' : 'Start'} →
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
