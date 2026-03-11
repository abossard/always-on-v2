import { style } from '@vanilla-extract/css';
import { vars } from '../../theme/theme.css';

export const container = style({
  minHeight: '100%',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  padding: vars.space.lg,
  maxWidth: '600px',
  margin: '0 auto',
});

export const header = style({
  width: '100%',
  textAlign: 'center',
  marginBottom: vars.space.xl,
  paddingBottom: vars.space.md,
  borderBottom: `1px solid ${vars.color.surface}`,
});

export const title = style({
  fontSize: '1.5rem',
  fontWeight: 700,
  color: vars.color.accent,
  letterSpacing: '0.05em',
  margin: 0,
});

export const nav = style({
  marginTop: vars.space.sm,
  display: 'flex',
  justifyContent: 'center',
  gap: vars.space.md,
});

export const navLink = style({
  fontSize: '0.8rem',
  color: vars.color.textMuted,
  textDecoration: 'none',
  padding: '2px 8px',
  borderRadius: vars.radius.sm,
  ':hover': {
    color: vars.color.text,
  },
});
