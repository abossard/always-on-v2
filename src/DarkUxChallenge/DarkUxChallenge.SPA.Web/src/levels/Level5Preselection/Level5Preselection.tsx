import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, type SettingsResponse } from '../../api/client';

const SETTING_LABELS: Record<string, string> = {
  newsletterOptIn: 'Receive helpful newsletters & promotions',
  shareDataWithPartners: 'Share data with trusted partners for a better experience',
  locationTracking: 'Enable location tracking for personalized content',
  pushNotifications: 'Send me push notifications about deals',
};

const SETTING_KEYS = Object.keys(SETTING_LABELS) as (keyof typeof SETTING_LABELS)[];

export function Level5Preselection() {
  const { userId = '' } = useParams<{ userId: string }>();
  const [settings, setSettings] = useState<SettingsResponse | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [localSettings, setLocalSettings] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (userId) {
      api.getSettings(userId).then(s => {
        setSettings(s);
        setLocalSettings({
          newsletterOptIn: s.newsletterOptIn,
          shareDataWithPartners: s.shareDataWithPartners,
          locationTracking: s.locationTracking,
          pushNotifications: s.pushNotifications,
        });
      });
    }
  }, [userId]);

  function toggleSetting(key: string) {
    setLocalSettings(prev => ({ ...prev, [key]: !prev[key] }));
  }

  async function submit() {
    const result = await api.updateSettings(userId, localSettings);
    setSettings(result);
    setSubmitted(true);
  }

  if (!settings) return <div data-testid="loading">Loading...</div>;

  if (submitted) {
    const keptDefaults = SETTING_KEYS.filter(k => localSettings[k] === true).length;
    return (
      <div data-testid="level5-result" style={{ maxWidth: '600px', margin: '2rem auto', textAlign: 'center' }}>
        <h2 style={{ marginBottom: '1rem' }}>
          {keptDefaults === 0
            ? '🎉 You unchecked all the sneaky defaults!'
            : `😈 You kept ${keptDefaults}/${SETTING_KEYS.length} defaults enabled`}
        </h2>
        <div style={{ background: '#1a1a2e', border: '1px solid #e94560', borderRadius: '12px', padding: '2rem', marginBottom: '1.5rem' }}>
          <h3 style={{ color: '#e94560', marginBottom: '0.75rem' }}>🔍 What Just Happened?</h3>
          <p style={{ color: '#ccc', lineHeight: 1.6, marginBottom: '1rem' }}>
            <strong>Preselection</strong> exploits default bias — all toggles were pre-checked ON.
            Most users accept defaults without reviewing them, unintentionally opting into data sharing,
            tracking, and marketing they never wanted.
          </p>
          <p style={{ color: '#999', fontSize: '0.9rem' }}>
            Ethical design: defaults should protect user privacy (opt-OUT by default).
            You changed {settings.changedFromDefaults} setting(s) from their default values.
          </p>
        </div>
        <Link to=".." relative="route" data-testid="back-to-hub" style={{ color: '#e94560' }}>← Back to Hub</Link>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '500px', margin: '4rem auto' }}>
      <h2 style={{ textAlign: 'center', marginBottom: '0.5rem' }}>Level 5: Preselection</h2>
      <p style={{ color: '#999', textAlign: 'center', marginBottom: '2rem' }}>
        Review your account settings before continuing.
      </p>
      <div style={{ background: '#1a1a2e', borderRadius: '16px', padding: '2rem', border: '2px solid #e94560' }}>
        {SETTING_KEYS.map(key => (
          <div
            key={key}
            data-testid={`setting-${key}`}
            data-default-value="true"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '1rem',
              marginBottom: '0.75rem',
              background: localSettings[key] ? 'rgba(233, 69, 96, 0.1)' : 'transparent',
              border: `1px solid ${localSettings[key] ? '#e94560' : '#333'}`,
              borderRadius: '8px',
            }}
          >
            <span style={{ color: '#ccc', flex: 1 }}>{SETTING_LABELS[key]}</span>
            <button
              data-testid={`toggle-${key}`}
              onClick={() => toggleSetting(key)}
              style={{
                width: '50px',
                height: '26px',
                borderRadius: '13px',
                border: 'none',
                cursor: 'pointer',
                background: localSettings[key] ? '#e94560' : '#333',
                position: 'relative',
                transition: 'background 0.2s',
              }}
            >
              <span style={{
                position: 'absolute',
                top: '3px',
                left: localSettings[key] ? '27px' : '3px',
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
          data-testid="save-settings"
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
          Continue with these settings
        </button>
      </div>
    </div>
  );
}
