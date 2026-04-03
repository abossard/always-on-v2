import { style } from '@vanilla-extract/css';
import { vars } from '../../theme/theme.css';

export const container = style({
  width: '100%',
  marginTop: vars.space.lg,
});

export const heading = style({
  fontSize: '0.85rem',
  color: vars.color.textMuted,
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
  marginBottom: vars.space.sm,
});

export const tabs = style({
  display: 'flex',
  gap: vars.space.xs,
  marginBottom: vars.space.md,
});

export const tab = style({
  padding: `${vars.space.xs} ${vars.space.md}`,
  fontSize: '0.75rem',
  fontFamily: vars.font.mono,
  border: `1px solid ${vars.color.surface}`,
  borderRadius: vars.radius.full,
  backgroundColor: 'transparent',
  color: vars.color.textMuted,
  cursor: 'pointer',
  transition: 'all 0.2s ease',
  ':hover': {
    borderColor: vars.color.primary,
    color: vars.color.text,
  },
});

export const tabActive = style({
  backgroundColor: vars.color.primary,
  borderColor: vars.color.primary,
  color: vars.color.text,
});

export const list = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.xs,
});

export const row = style({
  display: 'grid',
  gridTemplateColumns: '2rem 1fr auto',
  alignItems: 'center',
  gap: vars.space.sm,
  backgroundColor: vars.color.surface,
  borderRadius: vars.radius.md,
  padding: `${vars.space.sm} ${vars.space.md}`,
  fontSize: '0.85rem',
});

export const rowHighlight = style({
  outline: `1px solid ${vars.color.primary}`,
  outlineOffset: '-1px',
});

export const rank = style({
  fontFamily: vars.font.mono,
  fontWeight: 700,
  textAlign: 'center',
  fontSize: '0.8rem',
});

export const playerId = style({
  fontFamily: vars.font.mono,
  fontSize: '0.75rem',
  color: vars.color.textMuted,
});

export const score = style({
  fontFamily: vars.font.mono,
  fontWeight: 600,
  textAlign: 'right',
});

export const empty = style({
  color: vars.color.textMuted,
  textAlign: 'center',
  padding: vars.space.md,
  fontSize: '0.85rem',
});
