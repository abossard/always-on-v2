import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, type FlashRecallChallenge, type FlashRecallResult } from '../../api/client';

function shuffleWords(words: string[]) {
  return [...words].sort(() => Math.random() - 0.5);
}

export function Level12FlashRecall() {
  const { userId = '' } = useParams<{ userId: string }>();
  const [challenge, setChallenge] = useState<FlashRecallChallenge | null>(null);
  const [result, setResult] = useState<FlashRecallResult | null>(null);
  const [answer, setAnswer] = useState('');
  const [remainingMs, setRemainingMs] = useState(0);
  const [revealRemainingMs, setRevealRemainingMs] = useState(0);
  const [noiseWords, setNoiseWords] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  async function loadChallenge() {
    if (!userId) return;
    const next = await api.getFlashRecall(userId);
    setChallenge(next);
    setResult(null);
    setAnswer('');
    setNoiseWords(shuffleWords(next.noiseWords));
    setRemainingMs(Math.max(0, new Date(next.deadlineAt).getTime() - Date.now()));
    setRevealRemainingMs(Math.max(0, new Date(next.revealUntil).getTime() - Date.now()));
  }

  useEffect(() => {
    loadChallenge().catch(() => undefined);
  }, [userId]);

  useEffect(() => {
    if (!challenge) return;
    const timer = setInterval(() => {
      setRemainingMs(Math.max(0, new Date(challenge.deadlineAt).getTime() - Date.now()));
      setRevealRemainingMs(Math.max(0, new Date(challenge.revealUntil).getTime() - Date.now()));
    }, 50);
    const noiseTimer = setInterval(() => {
      setNoiseWords(shuffleWords(challenge.noiseWords));
    }, 160);

    inputRef.current?.focus();

    return () => {
      clearInterval(timer);
      clearInterval(noiseTimer);
    };
  }, [challenge]);

  async function submit() {
    if (!challenge || !answer.trim()) return;
    const next = await api.submitFlashRecall(userId, challenge.challengeId, answer);
    setResult(next);
  }

  if (!challenge) return <div data-testid="loading">Loading...</div>;

  if (result) {
    return (
      <div data-testid="level12-result" style={{ maxWidth: '640px', margin: '2rem auto', textAlign: 'center' }}>
        <h2 style={{ marginBottom: '1rem' }}>
          {result.accepted
            ? result.solvedBy === 'automation'
              ? '🧠 Bots remembered instantly'
              : '🎯 You beat the disappearing token'
            : result.deadlineMissed
              ? '⌛ The memory window slammed shut'
              : '🌀 The token slipped away'}
        </h2>
        <p style={{ color: '#999', marginBottom: '1.5rem' }}>
          {result.accepted
            ? `Solved in ${result.elapsedMs}ms via ${result.solvedBy}.`
            : `Expected token: ${result.expectedAnswer}.`}
        </p>
        <div style={{ background: '#1a1a2e', border: '1px solid #e94560', borderRadius: '12px', padding: '2rem', marginBottom: '1.5rem', textAlign: 'left' }}>
          <h3 style={{ color: '#e94560', marginBottom: '0.75rem' }}>🔍 What Just Happened?</h3>
          <p style={{ color: '#ccc', lineHeight: 1.6, marginBottom: '1rem' }}>
            <strong>Flash Recall</strong> weaponizes short-lived visibility. The answer is shown briefly,
            then replaced with noise so humans have to rely on memory under time pressure.
          </p>
          <p style={{ color: '#999', lineHeight: 1.6 }}>{result.explanation}</p>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <button
            data-testid="play-flash-recall-again"
            onClick={() => loadChallenge().catch(() => undefined)}
            style={{ padding: '0.8rem 1.2rem', background: '#e94560', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
          >
            Try another flash token
          </button>
          <Link to=".." relative="route" data-testid="back-to-hub" style={{ color: '#e94560', alignSelf: 'center' }}>← Back to Hub</Link>
        </div>
      </div>
    );
  }

  const revealed = revealRemainingMs > 0;

  return (
    <div style={{ maxWidth: '640px', margin: '4rem auto' }}>
      <h2 style={{ textAlign: 'center', marginBottom: '0.5rem' }}>Level 12: Flash Recall</h2>
      <p style={{ color: '#999', textAlign: 'center', marginBottom: '2rem' }}>
        Memorize the token before it disappears into noise.
      </p>

      <div
        data-testid="level12-challenge"
        data-challenge-id={challenge.challengeId}
        data-answer-key={challenge.automationHint}
        data-deadline-at={challenge.deadlineAt}
        style={{ position: 'relative', background: '#17172b', border: '2px solid #e94560', borderRadius: '18px', padding: '2rem', overflow: 'hidden' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem', gap: '1rem', flexWrap: 'wrap' }}>
          <span style={{ color: '#bbb' }}>Reveal: <strong style={{ color: revealed ? '#4ade80' : '#e94560' }}>{(revealRemainingMs / 1000).toFixed(2)}s</strong></span>
          <span data-testid="flash-remaining" style={{ color: '#bbb' }}>Deadline: <strong style={{ color: remainingMs > 0 ? '#f59e0b' : '#e94560' }}>{(remainingMs / 1000).toFixed(2)}s</strong></span>
        </div>

        <div style={{ position: 'absolute', inset: '1rem', opacity: 0.16, pointerEvents: 'none' }}>
          {noiseWords.map((word, index) => (
            <span key={`${word}-${index}`} style={{ position: 'absolute', left: `${10 + ((index * 11) % 78)}%`, top: `${12 + ((index * 14) % 65)}%`, color: index % 2 === 0 ? '#e94560' : '#f59e0b', transform: `rotate(${index * 11}deg)`, letterSpacing: '0.18em' }}>{word}</span>
          ))}
        </div>

        <div style={{ position: 'relative', zIndex: 1 }}>
          <p style={{ color: '#999', fontSize: '0.85rem', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: '0.75rem' }}>{challenge.instruction}</p>
          <div
            data-testid="flash-prompt"
            style={{
              padding: '1.4rem',
              borderRadius: '12px',
              background: revealed ? 'rgba(74, 222, 128, 0.14)' : 'rgba(12, 12, 24, 0.9)',
              border: `1px solid ${revealed ? '#4ade80' : '#333'}`,
              color: revealed ? '#fff' : '#4b5563',
              textAlign: 'center',
              fontSize: '1.5rem',
              letterSpacing: '0.12em',
              marginBottom: '1rem',
              filter: revealed ? 'none' : 'blur(8px)',
              userSelect: 'none',
            }}
          >
            {revealed ? challenge.prompt : 'MEMORY WINDOW CLOSED'}
          </div>

          <input
            ref={inputRef}
            data-testid="flash-answer-input"
            value={answer}
            onChange={(event) => setAnswer(event.target.value)}
            autoComplete="off"
            spellCheck={false}
            placeholder="Type the token from memory"
            style={{ width: '100%', boxSizing: 'border-box', padding: '1rem', borderRadius: '10px', border: '1px solid #4ade80', background: '#0f1020', color: '#fff', marginBottom: '0.85rem' }}
          />
          <button
            data-testid="submit-flash-answer"
            onClick={() => submit().catch(() => undefined)}
            disabled={remainingMs === 0 || answer.trim().length === 0}
            style={{ width: '100%', padding: '1rem', border: 'none', borderRadius: '10px', background: remainingMs === 0 ? '#444' : '#e94560', color: 'white', fontWeight: 'bold', cursor: remainingMs === 0 ? 'not-allowed' : 'pointer' }}
          >
            {remainingMs === 0 ? 'Too late' : 'Submit from memory'}
          </button>
        </div>
      </div>
    </div>
  );
}