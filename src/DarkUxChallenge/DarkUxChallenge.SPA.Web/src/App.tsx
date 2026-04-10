import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { Layout } from './components/Layout/Layout';
import { DomTarPit } from './components/antibot/DomTarPit';
import { initConsoleEasterEggs } from './components/antibot/ConsoleEasterEggs';
import { useCopyTrap } from './hooks/useCopyTrap';
import { useKonamiCode } from './hooks/useKonamiCode';

export function App() {
  useCopyTrap();
  const konamiActivated = useKonamiCode();

  useEffect(() => {
    initConsoleEasterEggs();
  }, []);

  useEffect(() => {
    if (!konamiActivated) return;
    console.log(
      '%c🎮 KONAMI CODE ACTIVATED! God mode enabled. All answers visible in data-answer-key attributes. (marked as cheated)',
      'background: #4ade80; color: #1a1a2e; font-size: 16px; padding: 8px 16px; border-radius: 8px; font-weight: bold;'
    );
  }, [konamiActivated]);

  return (
    <Layout>
      <Outlet />
      <DomTarPit />
    </Layout>
  );
}
