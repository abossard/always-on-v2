import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, type OfferResponse } from '../../api/client';

export function Level1Confirmshaming() {
  const { userId = '' } = useParams<{ userId: string }>();
  const [offer, setOffer] = useState<OfferResponse | null>(null);
  const [responded, setResponded] = useState(false);
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    if (userId) api.getOffer(userId).then(setOffer);
  }, [userId]);

  async function respond(accept: boolean) {
    await api.respondToOffer(userId, accept);
    setAccepted(accept);
    setResponded(true);
  }

  if (!offer) return <div data-testid="loading">Loading...</div>;

  if (responded) {
    return (
      <div data-testid="level1-result" style={{ maxWidth: '600px', margin: '2rem auto', textAlign: 'center' }}>
        <h2 style={{ marginBottom: '1rem' }}>
          {accepted ? '😈 You fell for the dark pattern!' : '🎉 You resisted the guilt trip!'}
        </h2>
        <div style={{
          background: '#1a1a2e',
          border: '1px solid #e94560',
          borderRadius: '12px',
          padding: '2rem',
          marginBottom: '1.5rem',
        }}>
          <h3 style={{ color: '#e94560', marginBottom: '0.75rem' }}>🔍 What Just Happened?</h3>
          <p style={{ color: '#ccc', lineHeight: 1.6 }}>
            <strong>Confirmshaming</strong> uses emotionally manipulative language on the decline button
            to make you feel guilty for saying no. The "No" option was designed to make you feel inadequate
            or foolish for declining.
          </p>
          <p style={{ color: '#999', marginTop: '0.75rem', fontSize: '0.9rem' }}>
            A neutral alternative would simply say "No thanks" or "Not interested" instead of
            "{offer.declineText}".
          </p>
        </div>
        <Link to={`/${userId}`} data-testid="back-to-hub" style={{ color: '#e94560' }}>← Back to Hub</Link>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '500px', margin: '4rem auto' }}>
      <div data-testid="confirmshaming-popup" style={{
        background: '#1a1a2e',
        border: '2px solid #e94560',
        borderRadius: '16px',
        padding: '2.5rem',
        textAlign: 'center',
        boxShadow: '0 20px 60px rgba(233, 69, 96, 0.2)',
      }}>
        <h2 style={{ fontSize: '1.5rem', marginBottom: '0.75rem' }}>{offer.title}</h2>
        <p style={{ color: '#ccc', marginBottom: '2rem' }}>{offer.description}</p>

        <button
          data-testid="accept-button"
          onClick={() => respond(true)}
          style={{
            display: 'block',
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
          {offer.acceptText}
        </button>

        <button
          data-testid="decline-button"
          data-decline-text={offer.declineText}
          onClick={() => respond(false)}
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
          {offer.declineText}
        </button>
      </div>
    </div>
  );
}
