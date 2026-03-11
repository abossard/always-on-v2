import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Layout } from '../components/Layout/Layout';
import { vars } from '../theme/theme.css';

const BASE_URL = window.location.origin;

interface CurlBlockProps {
  command: string;
  label: string;
}

function CurlBlock({ command, label }: CurlBlockProps) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      style={{
        backgroundColor: vars.color.surface,
        borderRadius: vars.radius.md,
        padding: '12px 16px',
        marginTop: '8px',
        position: 'relative',
      }}
      aria-label={label}
    >
      <pre
        style={{
          fontFamily: vars.font.mono,
          fontSize: '0.78rem',
          color: vars.color.accent,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
          margin: 0,
          paddingRight: '60px',
        }}
      >
        {command}
      </pre>
      <button
        onClick={copy}
        aria-label={`Copy ${label}`}
        style={{
          position: 'absolute',
          top: '8px',
          right: '8px',
          padding: '4px 10px',
          fontSize: '0.7rem',
          cursor: 'pointer',
          borderRadius: vars.radius.sm,
          border: `1px solid ${vars.color.textMuted}`,
          backgroundColor: 'transparent',
          color: copied ? '#4caf50' : vars.color.textMuted,
          transition: 'color 0.2s',
        }}
      >
        {copied ? 'Copied!' : 'Copy'}
      </button>
    </div>
  );
}

interface EndpointProps {
  method: 'GET' | 'POST' | 'PUT';
  path: string;
  description: string;
  children: React.ReactNode;
}

function Endpoint({ method, path, description, children }: EndpointProps) {
  const methodColor: Record<string, string> = {
    GET: '#4caf50',
    POST: '#2196f3',
    PUT: '#ff9800',
  };

  return (
    <div
      style={{
        width: '100%',
        marginBottom: '2rem',
        paddingBottom: '2rem',
        borderBottom: `1px solid ${vars.color.surface}`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
        <span
          style={{
            fontFamily: vars.font.mono,
            fontSize: '0.75rem',
            fontWeight: 700,
            color: methodColor[method],
            backgroundColor: vars.color.surface,
            padding: '2px 8px',
            borderRadius: vars.radius.sm,
          }}
        >
          {method}
        </span>
        <code
          style={{
            fontFamily: vars.font.mono,
            fontSize: '0.9rem',
            color: vars.color.text,
          }}
        >
          {path}
        </code>
      </div>
      <p style={{ color: vars.color.textMuted, fontSize: '0.9rem', margin: '4px 0 12px' }}>
        {description}
      </p>
      {children}
    </div>
  );
}

export function ApiDocsPage() {
  const exampleId = '00000000-0000-0000-0000-000000000001';
  const apiBase = `${BASE_URL}/api/players`;

  const sectionStyle: React.CSSProperties = {
    width: '100%',
    marginBottom: '1rem',
  };

  const h2Style: React.CSSProperties = {
    fontSize: '1.1rem',
    fontWeight: 700,
    color: vars.color.accent,
    marginBottom: '1.5rem',
    marginTop: '0.5rem',
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
  };

  const tableStyle: React.CSSProperties = {
    width: '100%',
    borderCollapse: 'collapse',
    fontFamily: vars.font.mono,
    fontSize: '0.8rem',
    marginTop: '8px',
  };

  const thStyle: React.CSSProperties = {
    textAlign: 'left',
    padding: '8px 12px',
    color: vars.color.textMuted,
    borderBottom: `1px solid ${vars.color.surface}`,
    fontWeight: 600,
  };

  const tdStyle: React.CSSProperties = {
    padding: '8px 12px',
    color: vars.color.text,
    borderBottom: `1px solid ${vars.color.surface}`,
  };

  return (
    <Layout>
      <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h2 style={{ ...h2Style, margin: 0 }}>API Reference</h2>
        <Link
          to="/"
          style={{
            fontSize: '0.8rem',
            color: vars.color.textMuted,
            textDecoration: 'none',
          }}
          aria-label="Back to game"
        >
          ← Back to Game
        </Link>
      </div>

      <p style={{ color: vars.color.textMuted, fontSize: '0.9rem', width: '100%', marginBottom: '2rem' }}>
        Players on Level 0 exposes a REST API. Every endpoint accepts and returns JSON.
        Clicks are fire-and-forget — the response comes back immediately via{' '}
        <strong style={{ color: vars.color.text }}>Server-Sent Events</strong>.
      </p>

      {/* Endpoints */}
      <div style={sectionStyle}>
        <h3 style={h2Style}>Endpoints</h3>

        <Endpoint
          method="GET"
          path="/api/players/{playerId}"
          description="Get the current state of a player. Returns 404 if the player does not exist yet."
        >
          <CurlBlock
            label="Get player"
            command={`curl ${apiBase}/${exampleId}`}
          />
        </Endpoint>

        <Endpoint
          method="POST"
          path="/api/players/{playerId}/click"
          description="Record one click. Creates the player automatically if they don't exist. Returns 202 Accepted — the updated state arrives via SSE."
        >
          <CurlBlock
            label="Record a click"
            command={`curl -X POST ${apiBase}/${exampleId}/click`}
          />
        </Endpoint>

        <Endpoint
          method="POST"
          path="/api/players/{playerId}"
          description="Add score points or unlock a named achievement. At least one field is required. Returns the updated player state."
        >
          <CurlBlock
            label="Add score"
            command={`curl -X POST ${apiBase}/${exampleId} \\
  -H "Content-Type: application/json" \\
  -d '{"addScore": 500}'`}
          />
          <CurlBlock
            label="Unlock achievement"
            command={`curl -X POST ${apiBase}/${exampleId} \\
  -H "Content-Type: application/json" \\
  -d '{"unlockAchievement": {"id": "first-blood", "name": "First Blood"}}'`}
          />
          <CurlBlock
            label="Add score and unlock achievement"
            command={`curl -X POST ${apiBase}/${exampleId} \\
  -H "Content-Type: application/json" \\
  -d '{"addScore": 1000, "unlockAchievement": {"id": "level-2", "name": "Reached Level 2"}}'`}
          />
        </Endpoint>

        <Endpoint
          method="PUT"
          path="/api/players/{playerId}"
          description="Alias for POST /api/players/{playerId}. Identical behavior."
        >
          <CurlBlock
            label="Update player (PUT)"
            command={`curl -X PUT ${apiBase}/${exampleId} \\
  -H "Content-Type: application/json" \\
  -d '{"addScore": 250}'`}
          />
        </Endpoint>

        <Endpoint
          method="GET"
          path="/api/players/{playerId}/events"
          description="Subscribe to a Server-Sent Events stream for a player. Emits events in real time as clicks and score changes occur. Use -N to disable curl buffering."
        >
          <CurlBlock
            label="Subscribe to SSE events"
            command={`curl -N \\
  -H "Accept: text/event-stream" \\
  ${apiBase}/${exampleId}/events`}
          />
        </Endpoint>
      </div>

      {/* Quick start */}
      <div style={{ ...sectionStyle, marginBottom: '2rem' }}>
        <h3 style={h2Style}>Quick Start</h3>
        <p style={{ color: vars.color.textMuted, fontSize: '0.85rem', marginBottom: '12px' }}>
          Create a new player and watch clicks accumulate:
        </p>
        <CurlBlock
          label="Full quick start script"
          command={`# 1. Pick a player ID (any UUID)
PLAYER="${exampleId}"

# 2. Check initial state (404 = not created yet)
curl ${apiBase}/$PLAYER

# 3. Click 5 times
for i in 1 2 3 4 5; do
  curl -X POST ${apiBase}/$PLAYER/click
done

# 4. Get updated state
curl ${apiBase}/$PLAYER`}
        />
      </div>

      {/* Achievement thresholds */}
      <div style={sectionStyle}>
        <h3 style={h2Style}>Click Achievements</h3>
        <p style={{ color: vars.color.textMuted, fontSize: '0.85rem', marginBottom: '12px' }}>
          Achievements are awarded automatically when thresholds are crossed.
          Rate-based achievements (clicks/sec, clicks/min) reset on server restart.
        </p>

        <table style={tableStyle} aria-label="Achievement thresholds">
          <thead>
            <tr>
              <th style={thStyle}>ID</th>
              <th style={thStyle}>Tier 1</th>
              <th style={thStyle}>Tier 2</th>
              <th style={thStyle}>Tier 3</th>
              <th style={thStyle}>Tier 4</th>
              <th style={thStyle}>Tier 5</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={tdStyle}>total-clicks</td>
              <td style={{ ...tdStyle, color: vars.color.accent }}>100</td>
              <td style={{ ...tdStyle, color: vars.color.accent }}>1,000</td>
              <td style={{ ...tdStyle, color: vars.color.accent }}>10,000</td>
              <td style={{ ...tdStyle, color: vars.color.accent }}>100,000</td>
              <td style={{ ...tdStyle, color: vars.color.accent }}>1,000,000</td>
            </tr>
            <tr>
              <td style={tdStyle}>clicks-per-second</td>
              <td style={{ ...tdStyle, color: vars.color.accent }}>5</td>
              <td style={{ ...tdStyle, color: vars.color.accent }}>10</td>
              <td style={{ ...tdStyle, color: vars.color.accent }}>20</td>
              <td style={{ ...tdStyle, color: vars.color.accent }}>50</td>
              <td style={{ ...tdStyle, color: vars.color.textMuted }}>—</td>
            </tr>
            <tr>
              <td style={tdStyle}>clicks-per-minute</td>
              <td style={{ ...tdStyle, color: vars.color.accent }}>60</td>
              <td style={{ ...tdStyle, color: vars.color.accent }}>200</td>
              <td style={{ ...tdStyle, color: vars.color.accent }}>500</td>
              <td style={{ ...tdStyle, color: vars.color.accent }}>1,000</td>
              <td style={{ ...tdStyle, color: vars.color.textMuted }}>—</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* SSE events */}
      <div style={{ ...sectionStyle, marginBottom: '0' }}>
        <h3 style={h2Style}>SSE Event Types</h3>
        <table style={tableStyle} aria-label="SSE event types">
          <thead>
            <tr>
              <th style={thStyle}>Event type</th>
              <th style={thStyle}>Payload fields</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ ...tdStyle, color: vars.color.primary }}>clickRecorded</td>
              <td style={tdStyle}>playerId, totalClicks, occurredAt</td>
            </tr>
            <tr>
              <td style={{ ...tdStyle, color: vars.color.primary }}>clickAchievementEarned</td>
              <td style={tdStyle}>playerId, achievementId, tier, occurredAt</td>
            </tr>
            <tr>
              <td style={{ ...tdStyle, color: vars.color.primary }}>scoreUpdated</td>
              <td style={tdStyle}>playerId, newScore, newLevel, occurredAt</td>
            </tr>
            <tr>
              <td style={{ ...tdStyle, color: vars.color.primary }}>achievementUnlocked</td>
              <td style={tdStyle}>playerId, achievementId, name, occurredAt</td>
            </tr>
          </tbody>
        </table>
      </div>
    </Layout>
  );
}
