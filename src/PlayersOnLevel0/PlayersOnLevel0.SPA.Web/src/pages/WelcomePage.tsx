import { useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout/Layout';
import { vars } from '../theme/theme.css';

export function WelcomePage() {
  const navigate = useNavigate();

  const startNewPlayer = () => {
    const id = crypto.randomUUID();
    navigate(`/${id}`);
  };

  return (
    <Layout>
      <p style={{ textAlign: 'center', marginBottom: '2rem', color: vars.color.textMuted }}>
        Click your way to the top. How fast can you go?
      </p>
      <button
        onClick={startNewPlayer}
        aria-label="Start a new player"
        style={{
          padding: '16px 32px',
          fontSize: '1.1rem',
          fontWeight: 700,
          cursor: 'pointer',
          borderRadius: '8px',
          border: 'none',
          backgroundColor: vars.color.primary,
          color: '#ffffff',
        }}
      >
        Start a New Player
      </button>
    </Layout>
  );
}
