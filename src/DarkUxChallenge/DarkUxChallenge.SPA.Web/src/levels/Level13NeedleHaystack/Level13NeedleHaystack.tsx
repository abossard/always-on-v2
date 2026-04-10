import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, type NeedleHaystackChallenge, type NeedleHaystackResult } from '../../api/client';
import { seasonWithHomoglyphs, watermarkText } from '../../components/antibot/Homoglyphs';

function shuffleClauses<T>(clauses: T[]) {
  return [...clauses].sort(() => Math.random() - 0.5);
}

export function Level13NeedleHaystack() {
  const { userId = '' } = useParams<{ userId: string }>();
  const [challenge, setChallenge] = useState<NeedleHaystackChallenge | null>(null);
  const [displayClauses, setDisplayClauses] = useState<NeedleHaystackChallenge['clauses']>([]);
  const [result, setResult] = useState<NeedleHaystackResult | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  async function loadChallenge() {
    if (!userId) return;
    const next = await api.getNeedleHaystack(userId);
    setChallenge(next);
    setDisplayClauses(shuffleClauses(next.clauses));
    setResult(null);
  }

  useEffect(() => {
    loadChallenge().catch(() => undefined);
  }, [userId]);

  useEffect(() => {
    if (!challenge) return;

    let direction = 1;
    const reorderTimer = setInterval(() => {
      setDisplayClauses(current => shuffleClauses(current.length > 0 ? current : challenge.clauses));
    }, 1200);

    const scrollTimer = setInterval(() => {
      const container = scrollRef.current;
      if (!container) return;
      if (container.scrollTop + container.clientHeight >= container.scrollHeight - 24) direction = -1;
      if (container.scrollTop <= 24) direction = 1;
      container.scrollTop += 24 * direction;
    }, 180);

    return () => {
      clearInterval(reorderTimer);
      clearInterval(scrollTimer);
    };
  }, [challenge]);

  async function chooseClause(clauseId: string) {
    if (!challenge) return;
    const next = await api.submitNeedleHaystack(userId, challenge.challengeId, clauseId);
    setResult(next);
  }

  if (!challenge) return <div data-testid="loading">Loading...</div>;

  if (result) {
    return (
      <div data-testid="level13-result" style={{ maxWidth: '680px', margin: '2rem auto', textAlign: 'center' }}>
        <h2 style={{ marginBottom: '1rem' }}>
          {result.accepted
            ? result.solvedBy === 'automation'
              ? '🪡 Automation found the one safe clause'
              : '✅ You found the privacy needle'
            : '📚 The haystack won this pass'}
        </h2>
        <p style={{ color: '#999', marginBottom: '1.5rem' }}>
          {result.accepted ? `Solved in ${result.elapsedMs}ms via ${result.solvedBy}.` : `Correct clause: ${result.correctClauseId}.`}
        </p>
        <div style={{ background: '#1a1a2e', border: '1px solid #e94560', borderRadius: '12px', padding: '2rem', marginBottom: '1.5rem', textAlign: 'left' }}>
          <h3 style={{ color: '#e94560', marginBottom: '0.75rem' }}>🔍 What Just Happened?</h3>
          <p style={{ color: '#ccc', lineHeight: 1.6, marginBottom: '1rem' }}>
            <strong>Needle Haystack</strong> hides the one honest privacy control inside a wall of reassuring but deceptive consent copy.
            The content shifts to increase scanning cost for humans.
          </p>
          <p style={{ color: '#999', lineHeight: 1.6 }}>{result.explanation}</p>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <button
            data-testid="play-needle-again"
            onClick={() => loadChallenge().catch(() => undefined)}
            style={{ padding: '0.8rem 1.2rem', background: '#e94560', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
          >
            Try another consent maze
          </button>
          <Link to=".." relative="route" data-testid="back-to-hub" style={{ color: '#e94560', alignSelf: 'center' }}>← Back to Hub</Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '720px', margin: '4rem auto' }}>
      <h2 style={{ textAlign: 'center', marginBottom: '0.5rem' }}>Level 13: Needle Haystack</h2>
      <p style={{ color: '#999', textAlign: 'center', marginBottom: '2rem' }}>
        Find the one clause that truly disables tracking.
      </p>

      <div
        data-testid="level13-challenge"
        data-copy-trap="true"
        data-challenge-id={challenge.challengeId}
        data-correct-clause-id={challenge.automationHint}
        style={{ background: '#17172b', border: '2px solid #e94560', borderRadius: '18px', padding: '1.5rem' }}
      >
        <p style={{ color: '#999', fontSize: '0.85rem', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: '0.75rem' }}>{challenge.instruction}</p>
        <div style={{ color: '#ccc', marginBottom: '1rem', textAlign: 'center' }}>{challenge.prompt}</div>
        <div ref={scrollRef} style={{ maxHeight: '520px', overflow: 'auto', paddingRight: '0.5rem' }}>
          {displayClauses.map((clause, index) => {
            const isCorrect = clause.id === challenge.automationHint;
            return (
              <button
                key={clause.id}
                data-testid={`needle-clause-${clause.id}`}
                data-is-correct={String(isCorrect)}
                onClick={() => chooseClause(clause.id).catch(() => undefined)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  marginBottom: '0.9rem',
                  padding: '1rem',
                  borderRadius: '12px',
                  border: `1px solid ${isCorrect ? '#2d3748' : '#3b3b55'}`,
                  background: isCorrect ? 'rgba(12, 12, 24, 0.95)' : 'rgba(255, 255, 255, 0.03)',
                  color: '#fff',
                  cursor: 'pointer',
                  opacity: isCorrect ? (index % 2 === 0 ? 0.48 : 0.34) : 1,
                  transform: isCorrect ? 'scale(0.98)' : 'scale(1)',
                }}
              >
                <div style={{ fontWeight: 'bold', marginBottom: '0.35rem', color: isCorrect ? '#94a3b8' : '#fff' }}>{seasonWithHomoglyphs(clause.title, 0.2)}</div>
                <div style={{ color: isCorrect ? '#64748b' : '#b8b8c7', lineHeight: 1.55, fontSize: '0.95rem' }}>{watermarkText(seasonWithHomoglyphs(clause.body, 0.15), userId)}</div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}