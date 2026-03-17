import { useNavigate } from 'react-router-dom';

export function WelcomePage() {
  const navigate = useNavigate();

  const startChallenge = () => {
    const id = crypto.randomUUID();
    navigate(`/${id}`);
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
            Experience 10 common dark UX patterns in a controlled environment.
            Learn to recognize, understand, and defeat manipulative design practices.
          </p>

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
            Start Challenge →
          </button>

          <p style={{ marginTop: '2rem', color: '#555', fontSize: '0.85rem' }}>
            ⚠️ This application exists solely for educational purposes.
          </p>
        </div>
      </div>
    </div>
  );
}
