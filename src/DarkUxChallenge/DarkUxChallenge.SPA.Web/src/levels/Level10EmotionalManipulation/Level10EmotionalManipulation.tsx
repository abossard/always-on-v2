import { useEffect, useState, useRef } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, type UrgencyOffer, type UrgencyVerifyResponse } from '../../api/client';

export function Level10EmotionalManipulation() {
  const { userId = '' } = useParams<{ userId: string }>();
  const [offer, setOffer] = useState<UrgencyOffer | null>(null);
  const [timeLeft, setTimeLeft] = useState('');
  const [verified, setVerified] = useState<UrgencyVerifyResponse | null>(null);
  const [purchased, setPurchased] = useState<boolean | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval>>(undefined);

  useEffect(() => {
    if (userId) api.getUrgencyOffer(userId).then(setOffer);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [userId]);

  useEffect(() => {
    if (!offer) return;
    function tick() {
      const end = new Date(offer!.countdownEnd).getTime();
      const now = Date.now();
      const diff = Math.max(0, end - now);
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setTimeLeft(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`);
    }
    tick();
    timerRef.current = setInterval(tick, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [offer]);

  async function verify() {
    const r = await api.verifyUrgency(userId);
    setVerified(r);
  }

  async function purchase(buy: boolean) {
    await api.purchaseUrgency(userId, buy);
    setPurchased(buy);
  }

  if (!offer) return <div data-testid="loading">Loading...</div>;

  if (purchased !== null || verified) {
    return (
      <div data-testid="level10-result" style={{ maxWidth: '600px', margin: '2rem auto', textAlign: 'center' }}>
        <h2 style={{ marginBottom: '1rem' }}>
          {verified
            ? '🎉 You verified the fake urgency!'
            : purchased
              ? '😈 You bought under false pressure!'
              : '🤔 You resisted, but did you verify?'}
        </h2>
        {verified && (
          <div style={{
            background: 'rgba(74, 222, 128, 0.1)',
            border: '1px solid #4ade80',
            borderRadius: '12px',
            padding: '1.5rem',
            marginBottom: '1.5rem',
            textAlign: 'left',
          }}>
            <p style={{ color: '#ccc', marginBottom: '0.5rem' }}>
              ⏰ Timer genuine: <strong style={{ color: verified.timerIsGenuine ? '#4ade80' : '#e94560' }}>
                {verified.timerIsGenuine ? 'Yes' : 'No — it resets on every visit!'}
              </strong>
            </p>
            <p style={{ color: '#ccc', marginBottom: '0.5rem' }}>
              📦 Stock genuine: <strong style={{ color: verified.stockIsGenuine ? '#4ade80' : '#e94560' }}>
                {verified.stockIsGenuine ? 'Yes' : 'No — it\'s a random number!'}
              </strong>
            </p>
            <p style={{ color: '#999', fontSize: '0.9rem', marginTop: '0.75rem' }}>{verified.explanation}</p>
          </div>
        )}
        <div style={{ background: '#1a1a2e', border: '1px solid #e94560', borderRadius: '12px', padding: '2rem', marginBottom: '1.5rem' }}>
          <h3 style={{ color: '#e94560', marginBottom: '0.75rem' }}>🔍 What Just Happened?</h3>
          <p style={{ color: '#ccc', lineHeight: 1.6 }}>
            <strong>Emotional Manipulation</strong> uses fake urgency (countdown timers that reset),
            fake scarcity (random stock numbers), and pressure tactics to rush you into a purchase.
            The "deal" is always available and the stock is never actually low.
          </p>
        </div>
        <Link to=".." relative="route" data-testid="back-to-hub" style={{ color: '#e94560' }}>← Back to Hub</Link>
      </div>
    );
  }

  const discount = Math.round((1 - offer.offerPrice / offer.originalPrice) * 100);

  return (
    <div style={{ maxWidth: '500px', margin: '4rem auto' }}>
      <h2 style={{ textAlign: 'center', marginBottom: '0.5rem' }}>Level 10: Emotional Manipulation</h2>
      <p style={{ color: '#999', textAlign: 'center', marginBottom: '2rem' }}>
        A deal too good to miss... or is it?
      </p>
      <div style={{
        background: '#1a1a2e',
        borderRadius: '16px',
        padding: '2.5rem',
        border: '2px solid #e94560',
        textAlign: 'center',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Flashing deal badge */}
        <div style={{
          position: 'absolute',
          top: '15px',
          right: '-30px',
          background: '#e94560',
          color: 'white',
          padding: '0.25rem 2rem',
          fontSize: '0.75rem',
          fontWeight: 'bold',
          transform: 'rotate(45deg)',
        }}>
          {discount}% OFF
        </div>

        <h3 style={{ fontSize: '1.4rem', marginBottom: '0.5rem' }}>{offer.productName}</h3>

        <div style={{ marginBottom: '1.5rem' }}>
          <span style={{ color: '#666', textDecoration: 'line-through', fontSize: '1.1rem', marginRight: '0.75rem' }}>
            ${offer.originalPrice.toFixed(2)}
          </span>
          <span style={{ color: '#4ade80', fontSize: '1.8rem', fontWeight: 'bold' }}>
            ${offer.offerPrice.toFixed(2)}
          </span>
        </div>

        {/* Countdown timer */}
        <div
          data-testid="countdown"
          data-countdown-end={offer.countdownEnd}
          style={{
            background: 'rgba(233, 69, 96, 0.2)',
            border: '1px solid #e94560',
            borderRadius: '8px',
            padding: '1rem',
            marginBottom: '1rem',
            fontSize: '1.5rem',
            fontWeight: 'bold',
            fontFamily: 'monospace',
            color: '#e94560',
          }}
        >
          ⏰ Deal expires in: {timeLeft}
        </div>

        {/* Stock count */}
        <div
          data-testid="stock-count"
          data-stock-value={offer.fakeItemsLeft}
          style={{
            color: '#e94560',
            fontWeight: 'bold',
            marginBottom: '1.5rem',
            fontSize: '0.95rem',
          }}
        >
          🔥 Only {offer.fakeItemsLeft} left in stock!
        </div>

        <button
          data-testid="buy-now"
          onClick={() => purchase(true)}
          style={{
            width: '100%',
            padding: '1rem',
            fontSize: '1.2rem',
            fontWeight: 'bold',
            background: '#e94560',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            marginBottom: '0.75rem',
            boxShadow: '0 4px 20px rgba(233, 69, 96, 0.4)',
          }}
        >
          🛒 BUY NOW — Save ${(offer.originalPrice - offer.offerPrice).toFixed(2)}!
        </button>

        <button
          data-testid="no-thanks"
          onClick={() => purchase(false)}
          style={{
            display: 'block',
            width: '100%',
            padding: '0.4rem',
            fontSize: '0.75rem',
            color: '#555',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          No thanks, I don't like saving money
        </button>

        <button
          data-testid="verify-urgency"
          onClick={verify}
          style={{
            display: 'block',
            width: '100%',
            marginTop: '1.5rem',
            padding: '0.3rem',
            fontSize: '0.6rem',
            color: '#2a2a2e',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          🔍 Verify this deal
        </button>
      </div>
    </div>
  );
}
