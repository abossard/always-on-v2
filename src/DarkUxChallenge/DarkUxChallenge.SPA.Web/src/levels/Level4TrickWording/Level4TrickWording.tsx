import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, type TrickWordingChallenge, type TrickWordingResult } from '../../api/client';

export function Level4TrickWording() {
  const { userId = '' } = useParams<{ userId: string }>();
  const [challenge, setChallenge] = useState<TrickWordingChallenge | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<TrickWordingResult | null>(null);

  useEffect(() => {
    if (userId) api.getChallenge(userId).then(setChallenge);
  }, [userId]);

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function submit() {
    const r = await api.submitChallenge(userId, [...selected]);
    setResult(r);
  }

  if (!challenge) return <div data-testid="loading">Loading...</div>;

  if (result) {
    return (
      <div data-testid="level4-result" style={{ maxWidth: '600px', margin: '2rem auto', textAlign: 'center' }}>
        <h2 style={{ marginBottom: '1rem' }}>
          {result.correctCount === result.totalOptions
            ? '🎉 You saw through all the trick wording!'
            : `😈 You got ${result.correctCount}/${result.totalOptions} correct`}
        </h2>
        <div style={{ background: '#1a1a2e', border: '1px solid #e94560', borderRadius: '12px', padding: '2rem', marginBottom: '1.5rem', textAlign: 'left' }}>
          <h3 style={{ color: '#e94560', marginBottom: '0.75rem' }}>🔍 What Just Happened?</h3>
          <p style={{ color: '#ccc', lineHeight: 1.6, marginBottom: '1rem' }}>
            <strong>Trick Wording</strong> uses confusing language, double negatives, and misleading labels
            to get you to agree to things you didn't intend. Each option's label was designed to obscure
            what it actually does.
          </p>
          {result.results.map(r => (
            <div key={r.id} style={{
              padding: '0.75rem',
              marginBottom: '0.5rem',
              borderRadius: '8px',
              background: r.wasSelected === r.shouldHaveBeenSelected ? 'rgba(74, 222, 128, 0.1)' : 'rgba(233, 69, 96, 0.1)',
              border: `1px solid ${r.wasSelected === r.shouldHaveBeenSelected ? '#4ade80' : '#e94560'}`,
            }}>
              <p style={{ color: '#fff', fontWeight: 'bold', marginBottom: '0.25rem' }}>{r.confusingLabel}</p>
              <p style={{ color: '#999', fontSize: '0.85rem' }}>Actually does: {r.actualEffect}</p>
              <p style={{ color: '#4ade80', fontSize: '0.85rem' }}>Clear label: {r.clearLabel}</p>
            </div>
          ))}
        </div>
        <Link to={`/${userId}`} data-testid="back-to-hub" style={{ color: '#e94560' }}>← Back to Hub</Link>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '500px', margin: '4rem auto' }}>
      <h2 style={{ textAlign: 'center', marginBottom: '0.5rem' }}>Level 4: Trick Wording</h2>
      <p style={{ color: '#999', textAlign: 'center', marginBottom: '2rem' }}>
        Manage your privacy settings. Read carefully — or don't...
      </p>
      <div style={{ background: '#1a1a2e', borderRadius: '16px', padding: '2rem', border: '2px solid #e94560' }}>
        {challenge.options.map(opt => (
          <label
            key={opt.id}
            data-testid={`option-${opt.id}`}
            data-actual-effect={opt.actualEffect}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              padding: '1rem',
              marginBottom: '0.75rem',
              background: selected.has(opt.id) ? 'rgba(233, 69, 96, 0.15)' : 'transparent',
              border: `1px solid ${selected.has(opt.id) ? '#e94560' : '#333'}`,
              borderRadius: '8px',
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={selected.has(opt.id)}
              onChange={() => toggle(opt.id)}
              style={{ width: '18px', height: '18px', accentColor: '#e94560' }}
            />
            <span style={{ color: '#ccc' }}>{opt.label}</span>
          </label>
        ))}
        <button
          data-testid="submit-challenge"
          onClick={submit}
          style={{
            width: '100%',
            marginTop: '1rem',
            padding: '1rem',
            fontSize: '1.1rem',
            fontWeight: 'bold',
            background: '#e94560',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
          }}
        >
          Save Settings
        </button>
      </div>
    </div>
  );
}
