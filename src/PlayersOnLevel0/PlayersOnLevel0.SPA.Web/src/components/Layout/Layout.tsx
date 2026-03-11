import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import * as styles from './Layout.css';

export function Layout({ children }: { children: ReactNode }) {
  return (
    <main className={styles.container}>
      <header className={styles.header}>
        <Link to="/" style={{ textDecoration: 'none' }}>
          <h1 className={styles.title}>Players on Level 0</h1>
        </Link>
        <nav aria-label="Site navigation" className={styles.nav}>
          <Link to="/docs" className={styles.navLink}>
            API Docs
          </Link>
        </nav>
      </header>
      {children}
    </main>
  );
}
