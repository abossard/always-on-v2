import { createTheme, createThemeContract } from '@vanilla-extract/css';

export const vars = createThemeContract({
  color: {
    bg: null,
    surface: null,
    text: null,
    textMuted: null,
    primary: null,
    primaryHover: null,
    accent: null,
    danger: null,
  },
  space: {
    xs: null,
    sm: null,
    md: null,
    lg: null,
    xl: null,
  },
  radius: {
    sm: null,
    md: null,
    lg: null,
    full: null,
  },
  font: {
    body: null,
    mono: null,
  },
});

export const darkTheme = createTheme(vars, {
  color: {
    bg: '#0a0a0f',
    surface: '#16161f',
    text: '#e8e8f0',
    textMuted: '#8888a0',
    primary: '#6c5ce7',
    primaryHover: '#7f6ff0',
    accent: '#00b4d8',
    danger: '#ff6b6b',
  },
  space: {
    xs: '4px',
    sm: '8px',
    md: '16px',
    lg: '24px',
    xl: '48px',
  },
  radius: {
    sm: '4px',
    md: '8px',
    lg: '16px',
    full: '9999px',
  },
  font: {
    body: "'Inter', system-ui, -apple-system, sans-serif",
    mono: "'JetBrains Mono', 'Fira Code', monospace",
  },
});
