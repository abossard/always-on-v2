import { useState, useRef, useCallback } from 'react';

interface DodgingButtonProps {
  children: React.ReactNode;
  onSubmit: () => void;
  disabled?: boolean;
  'data-testid'?: string;
  style?: React.CSSProperties;
}

/**
 * A submit button that physically dodges the cursor.
 * After 5 dodges it gets "tired" and slows down.
 * Bots using `.click()` always miss; keyboard Tab+Enter still works.
 */
export function DodgingButton({ children, onSubmit, disabled, style, ...props }: DodgingButtonProps) {
  const [dodgeCount, setDodgeCount] = useState(0);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [tired, setTired] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const lastDodgeRef = useRef(0);

  const handleMouseEnter = useCallback(() => {
    if (disabled || tired) return;

    const now = Date.now();
    if (now - lastDodgeRef.current < 200) return; // Debounce
    lastDodgeRef.current = now;

    const newCount = dodgeCount + 1;
    setDodgeCount(newCount);

    if (newCount >= 5) {
      setTired(true);
      setOffset({ x: 0, y: 0 });
      return;
    }

    // Dodge in a random direction
    const angle = Math.random() * Math.PI * 2;
    const distance = 80 + Math.random() * 120;
    const newX = Math.cos(angle) * distance;
    const newY = Math.sin(angle) * distance;

    // Keep within viewport
    const clampedX = Math.max(-200, Math.min(200, newX));
    const clampedY = Math.max(-150, Math.min(150, newY));

    setOffset({ x: clampedX, y: clampedY });
  }, [dodgeCount, disabled, tired]);

  const handleClick = useCallback(() => {
    if (!disabled) onSubmit();
  }, [disabled, onSubmit]);

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        ref={buttonRef}
        type="button"
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
        disabled={disabled}
        data-testid={props['data-testid']}
        data-dodge-count={dodgeCount}
        data-tired={tired}
        style={{
          ...style,
          position: 'relative',
          transform: `translate(${offset.x}px, ${offset.y}px)`,
          transition: tired
            ? 'transform 0.8s cubic-bezier(0.2, 0, 0.3, 1)'
            : 'transform 0.15s cubic-bezier(0.4, 0, 0.2, 1)',
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
      >
        {children}
        {dodgeCount > 0 && !tired && (
          <span style={{ display: 'block', fontSize: '0.7rem', opacity: 0.6, marginTop: '0.25rem' }}>
            😈 Dodge #{dodgeCount} — try keyboard Tab+Enter
          </span>
        )}
        {tired && (
          <span style={{ display: 'block', fontSize: '0.7rem', opacity: 0.6, marginTop: '0.25rem' }}>
            😮‍💨 OK fine, I'm tired. Click me.
          </span>
        )}
      </button>
    </div>
  );
}
