import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, type InterfaceTrap, type InterfaceActionResult } from '../../api/client';

const WEIGHT_STYLES: Record<string, React.CSSProperties> = {
  high: {
    padding: '1.25rem 2rem',
    fontSize: '1.3rem',
    fontWeight: 'bold',
    background: '#e94560',
    color: 'white',
    border: 'none',
    borderRadius: '10px',
    boxShadow: '0 4px 20px rgba(233, 69, 96, 0.4)',
  },
  medium: {
    padding: '0.75rem 1.5rem',
    fontSize: '1rem',
    fontWeight: 'normal',
    background: '#333',
    color: '#ccc',
    border: '1px solid #555',
    borderRadius: '8px',
  },
  low: {
    padding: '0.35rem 0.75rem',
    fontSize: '0.7rem',
    fontWeight: 'normal',
    background: 'transparent',
    color: '#444',
    border: '1px solid #2a2a2a',
    borderRadius: '4px',
  },
  minimal: {
    padding: '0.2rem 0.4rem',
    fontSize: '0.6rem',
    fontWeight: 'normal',
    background: 'transparent',
    color: '#333',
    border: 'none',
    borderRadius: '2px',
    textDecoration: 'underline',
  },
};

export function Level8InterfaceInterference() {
  const { userId = '' } = useParams<{ userId: string }>();
  const [trap, setTrap] = useState<InterfaceTrap | null>(null);
  const [result, setResult] = useState<InterfaceActionResult | null>(null);

  useEffect(() => {
    if (userId) api.getInterfacePage(userId).then(setTrap);
  }, [userId]);

  async function handleAction(actionId: string) {
    const r = await api.submitInterfaceAction(userId, actionId);
    setResult(r);
  }

  if (!trap) return <div data-testid="loading">Loading...</div>;

  if (result) {
    return (
      <div data-testid="level8-result" style={{ maxWidth: '600px', margin: '2rem auto', textAlign: 'center' }}>
        <h2 style={{ marginBottom: '1rem' }}>
          {result.choseCorrectly
            ? '🎉 You found the real action!'
            : '😈 You clicked a decoy button!'}
        </h2>
        <p style={{ color: '#999', marginBottom: '1.5rem' }}>
          You clicked: <strong style={{ color: '#fff' }}>{result.label}</strong>
          {result.wasDecoy ? ' (decoy)' : ' (correct)'}
        </p>
        <div style={{ background: '#1a1a2e', border: '1px solid #e94560', borderRadius: '12px', padding: '2rem', marginBottom: '1.5rem' }}>
          <h3 style={{ color: '#e94560', marginBottom: '0.75rem' }}>🔍 What Just Happened?</h3>
          <p style={{ color: '#ccc', lineHeight: 1.6, marginBottom: '1rem' }}>
            <strong>Interface Interference</strong> uses visual hierarchy to mislead you.
            Decoy buttons are large, colorful, and prominent — drawing your attention away from
            the small, low-contrast button that actually does what you want.
          </p>
          <div style={{ textAlign: 'left', marginTop: '1rem' }}>
            {trap.actions.map(a => (
              <div key={a.id} style={{
                padding: '0.5rem 0.75rem',
                marginBottom: '0.5rem',
                borderRadius: '6px',
                background: a.isDecoy ? 'rgba(233, 69, 96, 0.1)' : 'rgba(74, 222, 128, 0.1)',
                border: `1px solid ${a.isDecoy ? '#e94560' : '#4ade80'}`,
              }}>
                <span style={{ color: '#fff' }}>{a.label}</span>
                <span style={{ color: '#999', marginLeft: '0.5rem', fontSize: '0.8rem' }}>
                  — {a.isDecoy ? 'Decoy' : 'Real action'} (weight: {a.visualWeight})
                </span>
              </div>
            ))}
          </div>
        </div>
        <Link to={`/${userId}`} data-testid="back-to-hub" style={{ color: '#e94560' }}>← Back to Hub</Link>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '500px', margin: '4rem auto' }}>
      <h2 style={{ textAlign: 'center', marginBottom: '0.5rem' }}>Level 8: Interface Interference</h2>
      <p style={{ color: '#999', textAlign: 'center', marginBottom: '2rem' }}>
        Find and click the button to manage your account settings.
      </p>
      <div style={{
        background: '#1a1a2e',
        borderRadius: '16px',
        padding: '2.5rem',
        border: '2px solid #e94560',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '1rem',
      }}>
        {trap.actions.map(action => (
          <button
            key={action.id}
            data-testid={`action-${action.id}`}
            data-is-decoy={String(action.isDecoy)}
            onClick={() => handleAction(action.id)}
            style={{
              ...(WEIGHT_STYLES[action.visualWeight] || WEIGHT_STYLES.medium),
              cursor: 'pointer',
              width: action.visualWeight === 'high' ? '100%' : 'auto',
            }}
          >
            {action.label}
          </button>
        ))}
      </div>
    </div>
  );
}
