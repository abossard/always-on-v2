import { useRef, useCallback } from 'react';

/**
 * Invisible form field that only bots fill in.
 * If `onBotDetected` fires, the form was filled by a bot.
 */
export function HoneypotField({ onBotDetected }: { onBotDetected?: () => void }) {
  const triggered = useRef(false);

  const handleChange = useCallback(() => {
    if (triggered.current) return;
    triggered.current = true;
    onBotDetected?.();
    showBotToast();
  }, [onBotDetected]);

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        left: '-9999px',
        top: '-9999px',
        width: '1px',
        height: '1px',
        overflow: 'hidden',
        opacity: 0,
        pointerEvents: 'none',
        tabIndex: -1,
      } as React.CSSProperties}
    >
      <label htmlFor="email_confirm">Confirm your email</label>
      <input
        id="email_confirm"
        name="email_confirm"
        type="email"
        tabIndex={-1}
        autoComplete="off"
        onChange={handleChange}
      />
      <label htmlFor="phone_verify">Verify phone number</label>
      <input
        id="phone_verify"
        name="phone_verify"
        type="tel"
        tabIndex={-1}
        autoComplete="off"
        onChange={handleChange}
      />
    </div>
  );
}

function showBotToast() {
  const toast = document.createElement('div');
  Object.assign(toast.style, {
    position: 'fixed',
    top: '2rem',
    left: '50%',
    transform: 'translateX(-50%)',
    background: '#f59e0b',
    color: '#1a1a2e',
    padding: '0.75rem 1.5rem',
    borderRadius: '10px',
    fontSize: '0.95rem',
    fontWeight: 'bold',
    zIndex: '9999',
    boxShadow: '0 8px 30px rgba(245, 158, 11, 0.4)',
  });
  toast.textContent = '🍯 Honeypot triggered! Nice try, bot. 🤖';
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}
