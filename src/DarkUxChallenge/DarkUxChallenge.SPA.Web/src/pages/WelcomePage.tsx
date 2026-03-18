import { useNavigate } from 'react-router-dom';
import { buildStartPath } from '../challengeMode';

export function WelcomePage() {
  const navigate = useNavigate();

  const startChallenge = () => {
    const id = crypto.randomUUID();
    navigate(buildStartPath(id, false));
  };

  const startChallengeMode = () => {
    const id = crypto.randomUUID();
    navigate(buildStartPath(id, true));
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#0f0f0f', color: '#e0e0e0' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
        <div style={{ textAlign: 'center', maxWidth: '600px' }}>
          <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🕵️</div>
          <h1 style={{ fontSize: '3rem', fontWeight: 'bold', marginBottom: '0.5rem', color: '#e94560' }}>
            DarkUX Challenge
          </h1>
          <p style={{ fontSize: '1.2rem', color: '#999', marginBottom: '2rem', lineHeight: 1.6 }}>
            Experience 13 common dark UX patterns in a controlled environment.
            Learn to recognize, understand, and defeat manipulative design practices.
          </p>

          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              data-testid="start-challenge"
              onClick={startChallenge}
              style={{
                padding: '1rem 3rem',
                fontSize: '1.3rem',
                fontWeight: 'bold',
                background: '#e94560',
                color: 'white',
                border: 'none',
                borderRadius: '12px',
                cursor: 'pointer',
                transition: 'transform 0.2s',
              }}
            >
              Start Baseline Mode →
            </button>

            <button
              data-testid="start-challenge-mode"
              onClick={startChallengeMode}
              style={{
                padding: '1rem 2rem',
                fontSize: '1.05rem',
                fontWeight: 'bold',
                background: 'transparent',
                color: '#f8fafc',
                border: '1px solid #475569',
                borderRadius: '12px',
                cursor: 'pointer',
              }}
            >
              Start Challenge Mode
            </button>
          </div>

          <p style={{ marginTop: '1rem', color: '#64748b', fontSize: '0.9rem', lineHeight: 1.5 }}>
            Challenge mode adds honest but irritating timing gates and route overlays for automation practice.
          </p>

          <p style={{ marginTop: '2rem', color: '#555', fontSize: '0.85rem' }}>
            ⚠️ This application exists solely for educational purposes.
          </p>
        </div>
      </div>
    </div>
  );
}
