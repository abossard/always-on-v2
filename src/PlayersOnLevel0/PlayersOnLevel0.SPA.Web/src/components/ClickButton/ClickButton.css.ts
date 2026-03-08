import { style, keyframes } from '@vanilla-extract/css';
import { vars } from '../../theme/theme.css';

const pulse = keyframes({
  '0%, 100%': { transform: 'scale(1)' },
  '50%': { transform: 'scale(0.95)' },
});

export const button = style({
  width: '180px',
  height: '180px',
  borderRadius: vars.radius.full,
  border: `3px solid ${vars.color.primary}`,
  backgroundColor: vars.color.surface,
  color: vars.color.text,
  fontSize: '1rem',
  fontWeight: 700,
  cursor: 'pointer',
  transition: 'all 0.15s ease',
  userSelect: 'none',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: vars.space.xs,
  ':hover': {
    backgroundColor: vars.color.primary,
    color: vars.color.text,
    transform: 'scale(1.05)',
  },
  ':active': {
    animation: `${pulse} 0.15s ease`,
  },
});

export const wrapper = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  margin: `${vars.space.xl} 0`,
});

export const clickCount = style({
  fontFamily: vars.font.mono,
  fontSize: '2rem',
  fontWeight: 700,
  lineHeight: 1,
});
