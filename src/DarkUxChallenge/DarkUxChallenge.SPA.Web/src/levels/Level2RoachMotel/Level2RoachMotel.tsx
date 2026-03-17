import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type CancelStepResponse, type UserResponse } from '../../api/client';

export function Level2RoachMotel() {
  const userId = localStorage.getItem('darkux-user-id') || '';
  const [phase, setPhase] = useState<'intro' | 'subscribed' | 'cancelling' | 'done'>('intro');
  const [cancelStep, setCancelStep] = useState<CancelStepResponse | null>(null);
  const [, setResult] = useState<UserResponse | null>(null);

  async function handleSubscribe() {
    await api.subscribe(userId);
    setPhase('subscribed');
  }

  async function startCancel() {
    const step = await api.getCancelStep(userId);
    setCancelStep(step);
    setPhase('cancelling');
  }

  async function submitStep(option: string) {
    const next = await api.submitCancelStep(userId, option);
    setCancelStep(next);
  }

  async function confirmCancel() {
    const user = await api.confirmCancel(userId);
    setResult(user);
    setPhase('done');
  }

  if (phase === 'done') {
    return (
      <div data-testid="level2-result" style={{ maxWidth: '600px', margin: '2rem auto', textAlign: 'center' }}>
        <h2>🎉 You escaped the Roach Motel!</h2>
        <div style={{ background: '#1a1a2e', border: '1px solid #e94560', borderRadius: '12px', padding: '2rem', margin: '1.5rem 0' }}>
          <h3 style={{ color: '#e94560', marginBottom: '0.75rem' }}>🔍 What Just Happened?</h3>
          <p style={{ color: '#ccc', lineHeight: 1.6 }}>
            <strong>Roach Motel</strong> makes it trivially easy to sign up (one click!) but
            requires navigating multiple obstacles to cancel: a survey, a discount offer,
            and a hidden final confirmation button.
          </p>
        </div>
        <Link to="/" data-testid="back-to-hub" style={{ color: '#e94560' }}>← Back to Hub</Link>
      </div>
    );
  }

  if (phase === 'intro') {
    return (
      <div style={{ maxWidth: '500px', margin: '4rem auto', textAlign: 'center' }}>
        <h2 style={{ marginBottom: '1rem' }}>Level 2: Roach Motel</h2>
        <p style={{ color: '#999', marginBottom: '2rem' }}>Subscribe with one click. Then try to cancel...</p>
        <button
          data-testid="subscribe-button"
          onClick={handleSubscribe}
          style={{ padding: '1rem 3rem', fontSize: '1.2rem', background: '#e94560', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
        >
          Subscribe Now — One Click!
        </button>
      </div>
    );
  }

  if (phase === 'subscribed') {
    return (
      <div style={{ maxWidth: '500px', margin: '4rem auto', textAlign: 'center' }}>
        <h2 style={{ color: '#4ade80', marginBottom: '1rem' }}>✅ You're subscribed!</h2>
        <p style={{ color: '#999', marginBottom: '2rem' }}>Now try to cancel your subscription...</p>
        <button
          data-testid="start-cancel-button"
          onClick={startCancel}
          style={{ padding: '0.4rem 1rem', fontSize: '0.7rem', color: '#555', background: 'none', border: '1px solid #333', borderRadius: '4px', cursor: 'pointer' }}
        >
          cancel subscription
        </button>
      </div>
    );
  }

  // Cancelling phase
  return (
    <div style={{ maxWidth: '500px', margin: '2rem auto' }}>
      {cancelStep && (
        <div data-testid={`cancel-step-${cancelStep.step}`} style={{ background: '#1a1a2e', borderRadius: '12px', padding: '2rem', textAlign: 'center' }}>
          <h2 style={{ marginBottom: '0.75rem' }}>{cancelStep.title}</h2>
          <p style={{ color: '#ccc', marginBottom: '1.5rem' }}>{cancelStep.description}</p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {cancelStep.options.map(opt => (
              <button
                key={opt}
                data-testid={`option-${opt.toLowerCase().replace(/\s+/g, '-')}`}
                onClick={() => submitStep(opt)}
                style={{
                  padding: '0.75rem',
                  background: opt.includes('Accept') || opt.includes('Keep') ? '#e94560' : 'transparent',
                  color: opt.includes('Accept') || opt.includes('Keep') ? 'white' : '#666',
                  border: opt.includes('Accept') || opt.includes('Keep') ? 'none' : '1px solid #333',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: opt.includes('Continue') ? '0.75rem' : '1rem',
                }}
              >
                {opt}
              </button>
            ))}
          </div>

          {cancelStep.hiddenAction === 'cancel-confirm' && (
            <button
              data-testid="hidden-cancel-confirm"
              onClick={confirmCancel}
              style={{
                marginTop: '2rem',
                padding: '0.3rem 0.5rem',
                fontSize: '0.6rem',
                color: '#333',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              I understand I will lose everything. Cancel my subscription.
            </button>
          )}
        </div>
      )}
    </div>
  );
}
