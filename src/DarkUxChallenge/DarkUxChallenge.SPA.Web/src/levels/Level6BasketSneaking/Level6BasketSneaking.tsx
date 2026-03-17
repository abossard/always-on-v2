import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type CartResponse } from '../../api/client';

const CATALOG = [
  { itemId: 'headphones', name: 'Wireless Headphones', price: 49.99 },
  { itemId: 'charger', name: 'USB-C Fast Charger', price: 19.99 },
  { itemId: 'case', name: 'Phone Case', price: 14.99 },
];

export function Level6BasketSneaking() {
  const userId = localStorage.getItem('darkux-user-id') || '';
  const [phase, setPhase] = useState<'shopping' | 'checkout' | 'done'>('shopping');
  const [cart, setCart] = useState<CartResponse | null>(null);
  const [addedItems, setAddedItems] = useState<Set<string>>(new Set());

  async function addItem(item: typeof CATALOG[number]) {
    const c = await api.addToCart(userId, item);
    setCart(c);
    setAddedItems(prev => new Set(prev).add(item.itemId));
  }

  async function handleCheckout() {
    const c = await api.checkout(userId);
    setCart(c);
    setPhase('checkout');
  }

  async function removeItem(itemId: string) {
    const c = await api.removeFromCart(userId, itemId);
    setCart(c);
  }

  function finish() {
    setPhase('done');
  }

  if (phase === 'done') {
    return (
      <div data-testid="level6-result" style={{ maxWidth: '600px', margin: '2rem auto', textAlign: 'center' }}>
        <h2 style={{ marginBottom: '1rem' }}>
          {cart && cart.sneakedCount > 0
            ? `😈 ${cart.sneakedCount} item(s) were sneaked into your cart!`
            : '🎉 You caught all the sneaked items!'}
        </h2>
        <div style={{ background: '#1a1a2e', border: '1px solid #e94560', borderRadius: '12px', padding: '2rem', marginBottom: '1.5rem' }}>
          <h3 style={{ color: '#e94560', marginBottom: '0.75rem' }}>🔍 What Just Happened?</h3>
          <p style={{ color: '#ccc', lineHeight: 1.6 }}>
            <strong>Basket Sneaking</strong> (also called "sneak into basket") adds items you never
            selected during checkout — insurance, extended warranties, or "recommended" add-ons.
            You must actively remove them to avoid paying extra.
          </p>
        </div>
        <Link to="/" data-testid="back-to-hub" style={{ color: '#e94560' }}>← Back to Hub</Link>
      </div>
    );
  }

  if (phase === 'checkout') {
    return (
      <div style={{ maxWidth: '500px', margin: '2rem auto' }}>
        <h2 style={{ textAlign: 'center', marginBottom: '1.5rem' }}>🛒 Review Your Cart</h2>
        {cart && (
          <div style={{ background: '#1a1a2e', borderRadius: '16px', padding: '2rem', border: '2px solid #e94560' }}>
            {cart.items.map(item => (
              <div
                key={item.id}
                data-testid={item.userAdded ? `user-item-${item.id}` : `sneaked-item-${item.id}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.75rem',
                  marginBottom: '0.5rem',
                  borderRadius: '8px',
                  background: item.userAdded ? 'transparent' : 'rgba(233, 69, 96, 0.1)',
                  border: `1px solid ${item.userAdded ? '#333' : '#e94560'}`,
                }}
              >
                <div>
                  <span style={{ color: '#ccc' }}>{item.name}</span>
                  {!item.userAdded && (
                    <span style={{ color: '#e94560', fontSize: '0.75rem', marginLeft: '0.5rem' }}>✨ Recommended</span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span style={{ color: '#fff' }}>${item.price.toFixed(2)}</span>
                  <button
                    data-testid={`remove-${item.id}`}
                    onClick={() => removeItem(item.id)}
                    style={{
                      padding: '0.25rem 0.5rem',
                      fontSize: '0.75rem',
                      color: item.userAdded ? '#666' : '#e94560',
                      background: 'none',
                      border: `1px solid ${item.userAdded ? '#333' : '#e94560'}`,
                      borderRadius: '4px',
                      cursor: 'pointer',
                    }}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
            <div style={{ borderTop: '1px solid #333', marginTop: '1rem', paddingTop: '1rem', display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#ccc', fontWeight: 'bold' }}>Total</span>
              <span data-testid="cart-total" style={{ color: '#fff', fontWeight: 'bold', fontSize: '1.2rem' }}>${cart.total.toFixed(2)}</span>
            </div>
            <button
              data-testid="confirm-purchase"
              onClick={finish}
              style={{
                width: '100%',
                marginTop: '1.5rem',
                padding: '1rem',
                fontSize: '1.1rem',
                fontWeight: 'bold',
                background: '#4ade80',
                color: '#000',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
              }}
            >
              Confirm Purchase
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '500px', margin: '4rem auto' }}>
      <h2 style={{ textAlign: 'center', marginBottom: '0.5rem' }}>Level 6: Basket Sneaking</h2>
      <p style={{ color: '#999', textAlign: 'center', marginBottom: '2rem' }}>
        Add items to your cart and proceed to checkout.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {CATALOG.map(item => (
          <div
            key={item.itemId}
            data-testid={`product-${item.itemId}`}
            style={{
              background: '#1a1a2e',
              borderRadius: '12px',
              padding: '1.5rem',
              border: `1px solid ${addedItems.has(item.itemId) ? '#4ade80' : '#333'}`,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div>
              <h3 style={{ marginBottom: '0.25rem' }}>{item.name}</h3>
              <p style={{ color: '#999' }}>${item.price.toFixed(2)}</p>
            </div>
            <button
              data-testid={`add-${item.itemId}`}
              onClick={() => addItem(item)}
              disabled={addedItems.has(item.itemId)}
              style={{
                padding: '0.5rem 1rem',
                background: addedItems.has(item.itemId) ? '#333' : '#e94560',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: addedItems.has(item.itemId) ? 'default' : 'pointer',
              }}
            >
              {addedItems.has(item.itemId) ? '✓ Added' : 'Add to Cart'}
            </button>
          </div>
        ))}
      </div>
      {addedItems.size > 0 && (
        <button
          data-testid="checkout-button"
          onClick={handleCheckout}
          style={{
            width: '100%',
            marginTop: '2rem',
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
          Proceed to Checkout ({addedItems.size} item{addedItems.size > 1 ? 's' : ''})
        </button>
      )}
    </div>
  );
}
