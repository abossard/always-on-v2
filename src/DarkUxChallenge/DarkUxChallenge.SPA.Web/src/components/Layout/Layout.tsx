import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

export function Layout({ children }: { children: ReactNode }) {
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
        <Link to="/" style={{ textDecoration: 'none', color: '#e94560', fontWeight: 'bold', fontSize: '1.5rem' }}>
          🕵️ DarkUX Challenge
        </Link>
        <span style={{ color: '#666', fontSize: '0.9rem' }}>Educational Dark Pattern Demonstration</span>
      </header>
      <main style={{ flex: 1, padding: '2rem', maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
        {children}
      </main>
      <footer style={{ padding: '1rem 2rem', textAlign: 'center', color: '#666', borderTop: '1px solid #333' }}>
        ⚠️ This application exists solely for educational purposes. Never deploy dark patterns in production.
      </footer>
    </div>
  );
}
