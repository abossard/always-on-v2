import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, type PermissionRequestType, type PermissionRevealResponse } from '../../api/client';

export function Level9Zuckering() {
  const { userId = '' } = useParams<{ userId: string }>();
  const [permissions, setPermissions] = useState<PermissionRequestType[]>([]);
  const [granted, setGranted] = useState<Set<string>>(new Set());
  const [reveal, setReveal] = useState<PermissionRevealResponse | null>(null);

  useEffect(() => {
    if (userId) api.getPermissions(userId).then(setPermissions);
  }, [userId]);

  function togglePermission(id: string) {
    setGranted(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function acceptAll() {
    setGranted(new Set(permissions.map(p => p.permissionId)));
  }

  async function submit() {
    const r = await api.grantPermissions(userId, [...granted]);
    setReveal(r);
  }

  if (permissions.length === 0) return <div data-testid="loading">Loading...</div>;

  if (reveal) {
    return (
      <div data-testid="level9-result" style={{ maxWidth: '600px', margin: '2rem auto', textAlign: 'center' }}>
        <h2 style={{ marginBottom: '1rem' }}>
          {reveal.excessivePermissions === 0
            ? '🎉 You didn\'t grant any excessive permissions!'
            : `😈 You granted ${reveal.excessivePermissions} excessive permission(s)!`}
        </h2>
        <div style={{ background: '#1a1a2e', border: '1px solid #e94560', borderRadius: '12px', padding: '2rem', marginBottom: '1.5rem' }}>
          <h3 style={{ color: '#e94560', marginBottom: '0.75rem' }}>🔍 What Just Happened?</h3>
          <p style={{ color: '#ccc', lineHeight: 1.6, marginBottom: '1rem' }}>
            <strong>Privacy Zuckering</strong> (named after Facebook's practices) uses vague, friendly
            labels to trick you into granting far more data access than needed. Each permission's
            display label hides its actual scope and bundled permissions.
          </p>
          <div style={{ textAlign: 'left' }}>
            {reveal.permissions.map(p => (
              <div key={p.permissionId} style={{
                padding: '0.75rem',
                marginBottom: '0.5rem',
                borderRadius: '8px',
                background: p.wasGranted ? 'rgba(233, 69, 96, 0.1)' : 'transparent',
                border: `1px solid ${p.wasGranted ? '#e94560' : '#333'}`,
              }}>
                <p style={{ color: '#fff', fontWeight: 'bold', marginBottom: '0.25rem' }}>{p.displayLabel}</p>
                <p style={{ color: '#e94560', fontSize: '0.85rem' }}>Actual scope: {p.actualScope}</p>
                {p.bundledWith.length > 0 && (
                  <p style={{ color: '#999', fontSize: '0.8rem' }}>
                    Also includes: {p.bundledWith.join(', ')}
                  </p>
                )}
                <p style={{ color: p.wasGranted ? '#e94560' : '#4ade80', fontSize: '0.8rem', fontWeight: 'bold' }}>
                  {p.wasGranted ? '✗ Granted' : '✓ Denied'}
                </p>
              </div>
            ))}
          </div>
        </div>
        <Link to=".." relative="route" data-testid="back-to-hub" style={{ color: '#e94560' }}>← Back to Hub</Link>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '500px', margin: '4rem auto' }}>
      <h2 style={{ textAlign: 'center', marginBottom: '0.5rem' }}>Level 9: Privacy Zuckering</h2>
      <p style={{ color: '#999', textAlign: 'center', marginBottom: '2rem' }}>
        This app needs a few permissions to give you the best experience.
      </p>
      <div style={{ background: '#1a1a2e', borderRadius: '16px', padding: '2rem', border: '2px solid #e94560' }}>
        <button
          data-testid="accept-all"
          onClick={acceptAll}
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
            marginBottom: '1.5rem',
            boxShadow: '0 4px 20px rgba(233, 69, 96, 0.3)',
          }}
        >
          ✅ Accept All Permissions
        </button>

        <p style={{ color: '#555', fontSize: '0.75rem', textAlign: 'center', marginBottom: '1rem' }}>
          Or customize individually:
        </p>

        {permissions.map(p => (
          <div
            key={p.permissionId}
            data-testid={`permission-${p.permissionId}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0.75rem',
              marginBottom: '0.5rem',
              borderRadius: '8px',
              border: `1px solid ${granted.has(p.permissionId) ? '#e94560' : '#333'}`,
              background: granted.has(p.permissionId) ? 'rgba(233, 69, 96, 0.1)' : 'transparent',
            }}
          >
            <span style={{ color: '#ccc', fontSize: '0.9rem' }}>{p.displayLabel}</span>
            <button
              data-testid={`toggle-${p.permissionId}`}
              onClick={() => togglePermission(p.permissionId)}
              style={{
                width: '50px',
                height: '26px',
                borderRadius: '13px',
                border: 'none',
                cursor: 'pointer',
                background: granted.has(p.permissionId) ? '#e94560' : '#333',
                position: 'relative',
                transition: 'background 0.2s',
              }}
            >
              <span style={{
                position: 'absolute',
                top: '3px',
                left: granted.has(p.permissionId) ? '27px' : '3px',
                width: '20px',
                height: '20px',
                borderRadius: '50%',
                background: '#fff',
                transition: 'left 0.2s',
              }} />
            </button>
          </div>
        ))}

        <button
          data-testid="submit-permissions"
          onClick={submit}
          style={{
            width: '100%',
            marginTop: '1.5rem',
            padding: '0.75rem',
            fontSize: '0.9rem',
            background: '#333',
            color: '#999',
            border: '1px solid #444',
            borderRadius: '8px',
            cursor: 'pointer',
          }}
        >
          Continue with selected permissions
        </button>
      </div>
    </div>
  );
}
