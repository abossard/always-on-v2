import { style } from '@vanilla-extract/css';
import { vars } from '../../theme/theme.css';

export const grid = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  gap: vars.space.md,
  width: '100%',
});

export const stat = style({
  backgroundColor: vars.color.surface,
  borderRadius: vars.radius.md,
  padding: vars.space.md,
  textAlign: 'center',
});

export const label = style({
  fontSize: '0.75rem',
  color: vars.color.textMuted,
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
});

export const value = style({
  fontSize: '1.5rem',
  fontWeight: 700,
  fontFamily: vars.font.mono,
  marginTop: vars.space.xs,
});
