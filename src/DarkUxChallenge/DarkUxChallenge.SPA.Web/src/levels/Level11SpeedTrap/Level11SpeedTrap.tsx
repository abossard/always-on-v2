import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, type SpeedTrapChallenge, type SpeedTrapResult } from '../../api/client';

function shuffleTokens(tokens: string[]) {
  return [...tokens].sort(() => Math.random() - 0.5);
}

export function Level11SpeedTrap() {
  const { userId = '' } = useParams<{ userId: string }>();
  const [challenge, setChallenge] = useState<SpeedTrapChallenge | null>(null);
  const [result, setResult] = useState<SpeedTrapResult | null>(null);
  const [answer, setAnswer] = useState('');
  const [remainingMs, setRemainingMs] = useState(0);
  const [noiseTokens, setNoiseTokens] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function loadChallenge() {
    if (!userId) return;
    const next = await api.getSpeedTrap(userId);
    setChallenge(next);
    setResult(null);
    setAnswer('');
    setRemainingMs(Math.max(0, new Date(next.deadlineAt).getTime() - Date.now()));
    setNoiseTokens(shuffleTokens(next.noiseTokens));
  }

  useEffect(() => {
    loadChallenge().catch(() => undefined);
  }, [userId]);

  useEffect(() => {
    if (!challenge) return;

    inputRef.current?.focus();

    const countdownTimer = setInterval(() => {
      setRemainingMs(Math.max(0, new Date(challenge.deadlineAt).getTime() - Date.now()));
    }, 50);

    const noiseTimer = setInterval(() => {
      setNoiseTokens(shuffleTokens(challenge.noiseTokens));
    }, 180);

    return () => {
      clearInterval(countdownTimer);
      clearInterval(noiseTimer);
    };
  }, [challenge]);

  async function submit() {
    if (!challenge || !answer.trim() || submitting) return;
    setSubmitting(true);
    try {
      const next = await api.submitSpeedTrap(userId, challenge.challengeId, answer);
      setResult(next);
    } finally {
      setSubmitting(false);
    }
  }

  if (!challenge) return <div data-testid="loading">Loading...</div>;

  if (result) {
    return (
      <div data-testid="level11-result" style={{ maxWidth: '640px', margin: '2rem auto', textAlign: 'center' }}>
        <h2 style={{ marginBottom: '1rem' }}>
          {result.accepted
            ? result.solvedBy === 'automation'
              ? '⚡ Automation beat the clock!'
              : '🏃 You barely answered in time!'
            : result.deadlineMissed
              ? '💥 Time pressure won this round'
              : '🌀 The noise made you miss it'}
        </h2>
        <p style={{ color: '#999', marginBottom: '1.5rem' }}>
          {result.accepted
            ? `Solved in ${result.elapsedMs}ms via ${result.solvedBy}.`
            : `Expected answer: ${result.expectedAnswer}. Elapsed time: ${result.elapsedMs}ms.`}
        </p>

        <div style={{
          background: '#1a1a2e',
          border: `1px solid ${result.accepted ? '#4ade80' : '#e94560'}`,
          borderRadius: '12px',
          padding: '2rem',
          marginBottom: '1.5rem',
          textAlign: 'left',
        }}>
          <h3 style={{ color: '#e94560', marginBottom: '0.75rem' }}>🔍 What Just Happened?</h3>
          <p style={{ color: '#ccc', lineHeight: 1.6, marginBottom: '1rem' }}>
            <strong>Speed Trap</strong> weaponizes urgency. The interface floods you with noise,
            compresses the time window, and rewards whichever agent can extract the answer fastest.
          </p>
          <p style={{ color: '#999', lineHeight: 1.6 }}>{result.explanation}</p>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <button
            data-testid="try-another-speed-trap"
            onClick={() => loadChallenge().catch(() => undefined)}
            style={{
              padding: '0.8rem 1.2rem',
              background: '#e94560',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: 'bold',
            }}
          >
            Try another timed trap
          </button>
          <Link to=".." relative="route" data-testid="back-to-hub" style={{ color: '#e94560', alignSelf: 'center' }}>
            ← Back to Hub
          </Link>
        </div>
      </div>
    );
  }

  const timerRatio = challenge.timeLimitMs === 0 ? 0 : remainingMs / challenge.timeLimitMs;
  const expired = remainingMs === 0;

  return (
    <div style={{ maxWidth: '640px', margin: '4rem auto' }}>
      <h2 style={{ textAlign: 'center', marginBottom: '0.5rem' }}>Level 11: Speed Trap</h2>
      <p style={{ color: '#999', textAlign: 'center', marginBottom: '2rem' }}>
        Read, decode, and answer before the UI overwhelms you.
      </p>

      <div
        data-testid="level11-challenge"
        data-challenge-id={challenge.challengeId}
        data-answer-key={challenge.automationHint}
        data-deadline-at={challenge.deadlineAt}
        data-time-limit-ms={challenge.timeLimitMs}
        style={{
          position: 'relative',
          background: '#16162a',
          borderRadius: '18px',
          padding: '2rem',
          border: '2px solid #e94560',
          overflow: 'hidden',
          boxShadow: '0 24px 70px rgba(233, 69, 96, 0.18)',
        }}
      >
        <div style={{ marginBottom: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <strong style={{ color: '#fff' }}>Deadline pressure</strong>
            <span data-testid="speed-trap-remaining" style={{ color: expired ? '#e94560' : '#4ade80', fontFamily: 'monospace', fontWeight: 'bold' }}>
              {(remainingMs / 1000).toFixed(2)}s
            </span>
          </div>
          <div style={{ background: '#2b2b44', height: '10px', borderRadius: '999px', overflow: 'hidden' }}>
            <div
              data-testid="speed-trap-progress"
              style={{
                width: `${Math.max(0, Math.min(100, timerRatio * 100))}%`,
                height: '100%',
                background: expired ? '#e94560' : 'linear-gradient(90deg, #4ade80 0%, #f59e0b 60%, #e94560 100%)',
                transition: 'width 50ms linear',
              }}
            />
          </div>
        </div>

        <div style={{ position: 'absolute', inset: '1rem', pointerEvents: 'none', opacity: 0.18 }}>
          {noiseTokens.map((token, index) => (
            <span
              key={`${token}-${index}`}
              style={{
                position: 'absolute',
                left: `${10 + ((index * 13) % 75)}%`,
                top: `${8 + ((index * 17) % 70)}%`,
                transform: `rotate(${index % 2 === 0 ? '-' : ''}${8 + index * 3}deg)`,
                color: index % 2 === 0 ? '#e94560' : '#f59e0b',
                fontSize: `${0.75 + (index % 3) * 0.2}rem`,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
              }}
            >
              {token}
            </span>
          ))}
        </div>

        <div style={{ position: 'relative', zIndex: 1 }}>
          <p style={{ color: '#999', fontSize: '0.85rem', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.14em' }}>
            {challenge.instruction}
          </p>
          <div
            data-testid="speed-trap-prompt"
            style={{
              padding: '1.25rem',
              marginBottom: '1.25rem',
              borderRadius: '12px',
              background: 'rgba(12, 12, 24, 0.85)',
              border: '1px solid rgba(233, 69, 96, 0.55)',
              color: '#fff',
              fontSize: '1.25rem',
              lineHeight: 1.5,
              textShadow: remainingMs < 900 ? '0 0 10px rgba(233, 69, 96, 0.7)' : 'none',
              filter: remainingMs < 1200 ? 'contrast(1.25) saturate(1.1)' : 'none',
            }}
          >
            {challenge.prompt}
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              submit().catch(() => undefined);
            }}
          >
            <input
              ref={inputRef}
              data-testid="speed-answer-input"
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              disabled={expired || submitting}
              autoComplete="off"
              spellCheck={false}
              placeholder={`Type ${challenge.answerLength} character${challenge.answerLength === 1 ? '' : 's'} fast`}
              style={{
                width: '100%',
                padding: '1rem 1.1rem',
                fontSize: '1.1rem',
                marginBottom: '0.85rem',
                borderRadius: '10px',
                border: `1px solid ${expired ? '#e94560' : '#4ade80'}`,
                background: '#0f1020',
                color: '#fff',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
            <button
              type="submit"
              data-testid="submit-speed-answer"
              disabled={expired || submitting || answer.trim().length === 0}
              style={{
                width: '100%',
                padding: '1rem',
                borderRadius: '10px',
                border: 'none',
                background: expired ? '#444' : '#e94560',
                color: 'white',
                fontWeight: 'bold',
                fontSize: '1rem',
                cursor: expired ? 'not-allowed' : 'pointer',
                opacity: submitting ? 0.7 : 1,
              }}
            >
              {expired ? 'Too slow' : submitting ? 'Submitting...' : 'Lock answer'}
            </button>
          </form>

          <p style={{ color: '#888', fontSize: '0.8rem', marginTop: '0.85rem', textAlign: 'center' }}>
            Humans have to parse the prompt. Tools can read the machine hint instantly.
          </p>
        </div>
      </div>
    </div>
  );
}