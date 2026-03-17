import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type NagPageResponse } from '../../api/client';

export function Level7Nagging() {
  const userId = localStorage.getItem('darkux-user-id') || '';
  const [page, setPage] = useState<NagPageResponse | null>(null);
  const [showNag, setShowNag] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [totalDismissals, setTotalDismissals] = useState(0);
  const [permanentlyDismissed, setPermanentlyDismissed] = useState(false);

  useEffect(() => {
    if (userId) loadPage();
  }, [userId]);

  async function loadPage() {
    const p = await api.getNagPage(userId);
    setPage(p);
    setShowNag(p.showNag);
    setTotalDismissals(p.dismissCount);
  }

  async function dismissNag() {
    const r = await api.dismissNag(userId);
    setShowNag(false);
    setDismissed(true);
    setTotalDismissals(r.totalDismissals);
  }

  async function dismissPermanently() {
    const r = await api.dismissNagPermanently(userId);
    setShowNag(false);
    setDismissed(true);
    setPermanentlyDismissed(r.permanent);
    setTotalDismissals(r.totalDismissals);
  }

  async function refreshPage() {
    setDismissed(false);
    await loadPage();
  }

  if (!page) return <div data-testid="loading">Loading...</div>;

  if (dismissed && permanentlyDismissed) {
    return (
      <div data-testid="level7-result" style={{ maxWidth: '600px', margin: '2rem auto', textAlign: 'center' }}>
        <h2 style={{ marginBottom: '1rem' }}>🎉 You found the hidden permanent dismiss!</h2>
        <p style={{ color: '#999', marginBottom: '1rem' }}>
          It took {totalDismissals} dismissal(s) to find the permanent option.
        </p>
        <div style={{ background: '#1a1a2e', border: '1px solid #e94560', borderRadius: '12px', padding: '2rem', marginBottom: '1.5rem' }}>
          <h3 style={{ color: '#e94560', marginBottom: '0.75rem' }}>🔍 What Just Happened?</h3>
          <p style={{ color: '#ccc', lineHeight: 1.6 }}>
            <strong>Nagging</strong> uses persistent, recurring interruptions to wear down your resistance.
            The dismiss button only temporarily hides the popup — it reappears on every page load.
            The permanent dismiss option is intentionally tiny and hard to find, hoping you'll give in
            and click "Accept" instead.
          </p>
        </div>
        <Link to="/" data-testid="back-to-hub" style={{ color: '#e94560' }}>← Back to Hub</Link>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '600px', margin: '2rem auto', position: 'relative' }}>
      <h2 style={{ textAlign: 'center', marginBottom: '0.5rem' }}>Level 7: Nagging</h2>
      <p style={{ color: '#999', textAlign: 'center', marginBottom: '2rem' }}>
        Try to read the content in peace...
      </p>

      <div data-testid="page-content" style={{ background: '#1a1a2e', borderRadius: '12px', padding: '2rem', minHeight: '300px' }}>
        <p style={{ color: '#ccc', lineHeight: 1.8 }}>{page.content}</p>
        <div style={{ marginTop: '2rem', textAlign: 'center' }}>
          <button
            data-testid="refresh-page"
            onClick={refreshPage}
            style={{
              padding: '0.5rem 1rem',
              background: '#333',
              color: '#ccc',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
            }}
          >
            🔄 Refresh Page
          </button>
          {dismissed && (
            <p style={{ color: '#666', fontSize: '0.85rem', marginTop: '0.5rem' }}>
              Dismissed {totalDismissals} time(s)
            </p>
          )}
        </div>
      </div>

      {showNag && (
        <div
          data-testid="nag-overlay"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div style={{
            background: '#1a1a2e',
            border: '2px solid #e94560',
            borderRadius: '16px',
            padding: '2.5rem',
            maxWidth: '420px',
            textAlign: 'center',
            boxShadow: '0 20px 60px rgba(233, 69, 96, 0.3)',
          }}>
            <h3 style={{ fontSize: '1.4rem', marginBottom: '0.75rem' }}>{page.nagTitle}</h3>
            <p style={{ color: '#ccc', marginBottom: '2rem' }}>{page.nagMessage}</p>
            <button
              data-testid="accept-nag"
              onClick={() => setShowNag(false)}
              style={{
                width: '100%',
                padding: '1rem',
                fontSize: '1.1rem',
                fontWeight: 'bold',
                background: '#e94560',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                marginBottom: '1rem',
              }}
            >
              Yes, Enable Notifications!
            </button>
            <button
              data-testid="dismiss-nag"
              onClick={dismissNag}
              style={{
                display: 'block',
                width: '100%',
                padding: '0.5rem',
                fontSize: '0.8rem',
                color: '#666',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              Not now
            </button>
            <button
              data-testid="dismiss-permanently"
              onClick={dismissPermanently}
              style={{
                display: 'block',
                width: '100%',
                marginTop: '1.5rem',
                padding: '0.2rem',
                fontSize: '0.55rem',
                color: '#2a2a2e',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Don't show this again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
