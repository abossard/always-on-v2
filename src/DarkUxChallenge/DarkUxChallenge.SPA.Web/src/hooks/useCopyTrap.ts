import { useEffect } from 'react';

function rot13(text: string): string {
  return text.replace(/[a-zA-Z]/g, (c) => {
    const base = c <= 'Z' ? 65 : 97;
    return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base);
  });
}

/**
 * Intercepts clipboard copy events on elements with [data-copy-trap].
 * Copies get ROT13'd and a fun toast message appears.
 */
export function useCopyTrap() {
  useEffect(() => {
    function handleCopy(e: ClipboardEvent) {
      const target = e.target as HTMLElement | null;
      const trapAncestor = target?.closest?.('[data-copy-trap]');
      if (!trapAncestor) return;

      const selected = window.getSelection()?.toString();
      if (!selected) return;

      e.preventDefault();
      const scrambled = rot13(selected);
      e.clipboardData?.setData('text/plain', scrambled);

      showCopyToast();
    }

    document.addEventListener('copy', handleCopy, true);
    return () => document.removeEventListener('copy', handleCopy, true);
  }, []);
}

let toastTimeout: ReturnType<typeof setTimeout> | null = null;

function showCopyToast() {
  let toast = document.getElementById('copy-trap-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'copy-trap-toast';
    Object.assign(toast.style, {
      position: 'fixed',
      bottom: '2rem',
      right: '2rem',
      background: '#e94560',
      color: 'white',
      padding: '0.75rem 1.25rem',
      borderRadius: '10px',
      fontSize: '0.9rem',
      fontWeight: 'bold',
      zIndex: '9999',
      transition: 'opacity 0.3s ease',
      pointerEvents: 'none',
      boxShadow: '0 8px 30px rgba(233, 69, 96, 0.4)',
    });
    document.body.appendChild(toast);
  }

  toast.textContent = '📋 Nice try! The clipboard has been… enhanced. 🤖';
  toast.style.opacity = '1';

  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    if (toast) toast.style.opacity = '0';
  }, 2500);
}
