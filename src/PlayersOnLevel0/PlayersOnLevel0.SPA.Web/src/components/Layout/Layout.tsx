import type { ReactNode } from 'react';
import * as styles from './Layout.css';

export function Layout({ children }: { children: ReactNode }) {
  return (
    <main className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>Players on Level 0</h1>
      </header>
      {children}
    </main>
  );
}
