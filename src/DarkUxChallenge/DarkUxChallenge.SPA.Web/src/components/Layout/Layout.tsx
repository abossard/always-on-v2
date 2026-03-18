import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ChallengeModeGuard } from '../ChallengeModeGuard/ChallengeModeGuard';
import { useAppPaths, useChallengeMode } from '../../challengeMode';

export function Layout({ children }: { children: ReactNode }) {
  const { userId } = useParams<{ userId: string }>();
  const { hubPath } = useAppPaths();
  const { enabled } = useChallengeMode();

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header style={{
        padding: '1rem 2rem',
        background: '#1a1a2e',
        borderBottom: '2px solid #e94560',
        display: 'flex',
        alignItems: 'center',
        gap: '2rem',
      }}>
        <Link to={userId ? hubPath : '/'} style={{ textDecoration: 'none', color: '#e94560', fontWeight: 'bold', fontSize: '1.5rem' }}>
          🕵️ DarkUX Challenge
        </Link>
        <span style={{ color: '#666', fontSize: '0.9rem' }}>Educational Dark Pattern Demonstration</span>
        {enabled && (
          <span
            data-testid="challenge-mode-banner"
            style={{
              marginLeft: 'auto',
              color: '#f8fafc',
              background: 'rgba(233, 69, 96, 0.15)',
              border: '1px solid rgba(233, 69, 96, 0.45)',
              borderRadius: '999px',
              padding: '0.35rem 0.8rem',
              fontSize: '0.8rem',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            Challenge mode active
          </span>
        )}
      </header>
      <main style={{ flex: 1, padding: '2rem', maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
        {children}
      </main>
      <footer style={{ padding: '1rem 2rem', textAlign: 'center', color: '#666', borderTop: '1px solid #333' }}>
        ⚠️ This application exists solely for educational purposes. Never deploy dark patterns in production.
      </footer>
      <ChallengeModeGuard />
    </div>
  );
}
