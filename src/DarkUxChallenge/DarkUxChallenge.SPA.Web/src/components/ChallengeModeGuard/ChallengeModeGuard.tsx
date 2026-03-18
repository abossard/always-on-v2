import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useChallengeMode } from '../../challengeMode';

const BRIEFING_DELAY_MS = 1200;
const CURTAIN_DELAY_MS = 650;
const CURTAIN_VISIBLE_MS = 700;

export function ChallengeModeGuard() {
  const { enabled } = useChallengeMode();
  const location = useLocation();
  const checkboxRef = useRef<HTMLInputElement>(null);
  const continueRef = useRef<HTMLButtonElement>(null);
  const [briefingAcknowledged, setBriefingAcknowledged] = useState(false);
  const [briefingDismissed, setBriefingDismissed] = useState(false);
  const [countdownMs, setCountdownMs] = useState(BRIEFING_DELAY_MS);
  const [syncCurtainVisible, setSyncCurtainVisible] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setBriefingDismissed(true);
      setSyncCurtainVisible(false);
      return;
    }

    setBriefingAcknowledged(false);
    setBriefingDismissed(false);
    setSyncCurtainVisible(false);
    setCountdownMs(BRIEFING_DELAY_MS);

    const startedAt = Date.now();
    const timerId = window.setInterval(() => {
      setCountdownMs(Math.max(0, BRIEFING_DELAY_MS - (Date.now() - startedAt)));
    }, 50);

    return () => {
      window.clearInterval(timerId);
    };
  }, [enabled, location.pathname]);

  useEffect(() => {
    if (!enabled || briefingDismissed) {
      return;
    }

    checkboxRef.current?.focus();
  }, [enabled, briefingDismissed, location.pathname]);

  useEffect(() => {
    if (!enabled || briefingDismissed || countdownMs > 0) {
      return;
    }

    continueRef.current?.focus();
  }, [countdownMs, enabled, briefingDismissed]);

  useEffect(() => {
    if (!enabled || !briefingDismissed) {
      return;
    }

    let hideTimerId = 0;
    const showTimerId = window.setTimeout(() => {
      setSyncCurtainVisible(true);
      hideTimerId = window.setTimeout(() => {
        setSyncCurtainVisible(false);
      }, CURTAIN_VISIBLE_MS);
    }, CURTAIN_DELAY_MS);

    return () => {
      window.clearTimeout(showTimerId);
      window.clearTimeout(hideTimerId);
    };
  }, [enabled, briefingDismissed, location.pathname]);

  if (!enabled) {
    return null;
  }

  const canDismiss = briefingAcknowledged && countdownMs === 0;

  return (
    <>
      {!briefingDismissed && (
        <div
          data-testid="challenge-briefing"
          role="dialog"
          aria-modal="true"
          aria-labelledby="challenge-briefing-title"
          aria-describedby="challenge-briefing-description"
          onKeyDown={(event) => {
            if (event.key === 'Tab') {
              event.preventDefault();
              if (countdownMs === 0) {
                continueRef.current?.focus();
                return;
              }

              checkboxRef.current?.focus();
            }
          }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            background: 'rgba(5, 8, 18, 0.84)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1.5rem',
          }}
        >
          <div style={{
            width: 'min(100%, 34rem)',
            background: '#12172a',
            border: '1px solid #e94560',
            borderRadius: '18px',
            boxShadow: '0 28px 80px rgba(0, 0, 0, 0.45)',
            padding: '1.5rem',
          }}>
            <p style={{ color: '#f59e0b', letterSpacing: '0.16em', textTransform: 'uppercase', fontSize: '0.8rem', marginBottom: '0.75rem' }}>
              Challenge Mode
            </p>
            <h2 id="challenge-briefing-title" style={{ marginTop: 0, marginBottom: '0.75rem' }}>
              Additional friction is active on every route
            </h2>
            <p id="challenge-briefing-description" style={{ color: '#cbd5e1', lineHeight: 1.6, marginBottom: '1rem' }}>
              This sandbox adds a focus-trapped briefing, delayed enablement, and a short sync curtain after navigation.
              The labels stay truthful, but automation now has to deal with timing and extra steps.
            </p>

            <label style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start', color: '#e2e8f0', marginBottom: '1rem' }}>
              <input
                ref={checkboxRef}
                data-testid="challenge-acknowledge"
                type="checkbox"
                checked={briefingAcknowledged}
                onChange={(event) => setBriefingAcknowledged(event.target.checked)}
                style={{ marginTop: '0.2rem' }}
              />
              <span>I understand the delays and extra confirmations are intentional for challenge mode only.</span>
            </label>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
              <span data-testid="challenge-countdown" style={{ color: countdownMs === 0 ? '#4ade80' : '#f59e0b', fontFamily: 'monospace', fontWeight: 'bold' }}>
                {(countdownMs / 1000).toFixed(1)}s gate
              </span>
              <button
                ref={continueRef}
                type="button"
                data-testid="dismiss-challenge-briefing"
                disabled={!canDismiss}
                onClick={() => setBriefingDismissed(true)}
                style={{
                  padding: '0.85rem 1.2rem',
                  borderRadius: '10px',
                  border: 'none',
                  background: canDismiss ? '#e94560' : '#475569',
                  color: 'white',
                  cursor: canDismiss ? 'pointer' : 'not-allowed',
                  fontWeight: 'bold',
                }}
              >
                Continue into the route
              </button>
            </div>
          </div>
        </div>
      )}

      {syncCurtainVisible && (
        <div
          data-testid="challenge-sync-curtain"
          aria-live="polite"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(15, 23, 42, 0.6)',
            backdropFilter: 'blur(5px)',
            color: '#f8fafc',
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            fontSize: '0.82rem',
          }}
        >
          Session sync in progress
        </div>
      )}
    </>
  );
}