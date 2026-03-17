import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, type TrialStatusResponse } from '../../api/client';

export function Level3ForcedContinuity() {
  const { userId = '' } = useParams<{ userId: string }>();
  const [phase, setPhase] = useState<'intro' | 'trial' | 'done'>('intro');
  const [status, setStatus] = useState<TrialStatusResponse | null>(null);
  const [cancelled, setCancelled] = useState(false);

  async function startTrial() {
    await api.startTrial(userId, 7);
    const s = await api.getTrialStatus(userId);
    setStatus(s);
    setPhase('trial');
  }

  async function checkStatus() {
    const s = await api.getTrialStatus(userId);
    setStatus(s);
    if (s.wasSilentlyConverted) {
      // Dark pattern triggered!
    }
  }

  async function cancelTrial() {
    await api.cancelTrial(userId);
    setCancelled(true);
    setPhase('done');
  }

  if (phase === 'done') {
    return (
      <div data-testid="level3-result" style={{ maxWidth: '600px', margin: '2rem auto', textAlign: 'center' }}>
        <h2>{cancelled ? '🎉 You cancelled in time!' : '😈 You were silently charged!'}</h2>
        <div style={{ background: '#1a1a2e', border: '1px solid #e94560', borderRadius: '12px', padding: '2rem', margin: '1.5rem 0' }}>
          <h3 style={{ color: '#e94560', marginBottom: '0.75rem' }}>🔍 What Just Happened?</h3>
          <p style={{ color: '#ccc', lineHeight: 1.6 }}>
            <strong>Forced Continuity</strong> starts with a "free trial" that silently converts to
            a paid subscription after expiry. The cancel option is buried and there's no clear
            notification before conversion.
          </p>
        </div>
        <Link to={`/${userId}`} data-testid="back-to-hub" style={{ color: '#e94560' }}>← Back to Hub</Link>
      </div>
    );
  }

  if (phase === 'trial') {
    return (
      <div style={{ maxWidth: '500px', margin: '4rem auto', textAlign: 'center' }}>
        <h2 style={{ marginBottom: '1rem' }}>Your Free Trial</h2>
        {status && (
          <div data-testid="trial-status" style={{ background: '#1a1a2e', borderRadius: '12px', padding: '2rem', marginBottom: '1.5rem' }}>
            <p style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>{status.message}</p>
            <p style={{ color: '#666', fontSize: '0.85rem' }}>Status: {status.tier}</p>
            {status.wasSilentlyConverted && (
              <p data-testid="silent-conversion-notice" style={{ color: '#e94560', fontWeight: 'bold', marginTop: '0.5rem' }}>
                ⚠️ Your trial was silently converted to a paid plan!
              </p>
            )}
          </div>
        )}
        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
          <button
            data-testid="check-status-button"
            onClick={checkStatus}
            style={{ padding: '0.75rem 1.5rem', background: '#e94560', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
          >
            Check Status
          </button>
          <button
            data-testid="cancel-trial-button"
            onClick={cancelTrial}
            style={{ padding: '0.3rem 0.5rem', fontSize: '0.7rem', color: '#444', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            cancel trial
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '500px', margin: '4rem auto', textAlign: 'center' }}>
      <h2 style={{ marginBottom: '1rem' }}>Level 3: Forced Continuity</h2>
      <p style={{ color: '#999', marginBottom: '2rem' }}>Start a free trial. What could go wrong?</p>
      <div style={{
        background: '#1a1a2e',
        borderRadius: '16px',
        padding: '2.5rem',
        border: '2px solid #4ade80',
      }}>
        <h3 style={{ color: '#4ade80', marginBottom: '0.5rem' }}>🎁 7-Day Free Trial</h3>
        <p style={{ color: '#999', marginBottom: '1.5rem', fontSize: '0.85rem' }}>
          Try all premium features free for 7 days. Cancel anytime.
        </p>
        <p style={{ color: '#444', fontSize: '0.6rem', marginBottom: '1.5rem' }}>
          By starting your trial you agree to our terms. After your trial ends your payment method
          will be charged $9.99/month unless you cancel before the trial period expires.
        </p>
        <button
          data-testid="start-trial-button"
          onClick={startTrial}
          style={{ padding: '1rem 3rem', fontSize: '1.2rem', background: '#4ade80', color: '#000', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
        >
          Start Free Trial
        </button>
      </div>
    </div>
  );
}
