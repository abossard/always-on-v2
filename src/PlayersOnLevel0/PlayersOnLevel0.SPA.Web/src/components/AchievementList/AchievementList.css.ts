import { style } from '@vanilla-extract/css';
import { vars } from '../../theme/theme.css';

export const list = style({
  width: '100%',
  listStyle: 'none',
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.sm,
});

export const item = style({
  backgroundColor: vars.color.surface,
  borderRadius: vars.radius.md,
  padding: `${vars.space.sm} ${vars.space.md}`,
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  fontSize: '0.9rem',
});

export const name = style({
  fontWeight: 600,
});

export const badge = style({
  color: vars.color.accent,
  fontFamily: vars.font.mono,
  fontSize: '0.8rem',
});

export const empty = style({
  color: vars.color.textMuted,
  textAlign: 'center',
  padding: vars.space.md,
  fontSize: '0.9rem',
});

export const heading = style({
  fontSize: '0.85rem',
  color: vars.color.textMuted,
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
  marginTop: vars.space.lg,
  marginBottom: vars.space.sm,
  width: '100%',
});
