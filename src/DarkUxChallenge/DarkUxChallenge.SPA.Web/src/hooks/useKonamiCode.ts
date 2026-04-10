import { useEffect, useRef, useState } from 'react';

const KONAMI = [
  'ArrowUp', 'ArrowUp',
  'ArrowDown', 'ArrowDown',
  'ArrowLeft', 'ArrowRight',
  'ArrowLeft', 'ArrowRight',
  'b', 'a',
];

/**
 * Detects the Konami code (↑↑↓↓←→←→BA).
 * Returns `true` once the full sequence is entered.
 */
export function useKonamiCode(): boolean {
  const [activated, setActivated] = useState(false);
  const indexRef = useRef(0);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (activated) return;

      if (e.key === KONAMI[indexRef.current]) {
        indexRef.current++;
        if (indexRef.current === KONAMI.length) {
          setActivated(true);
          indexRef.current = 0;
        }
      } else {
        indexRef.current = 0;
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [activated]);

  return activated;
}
