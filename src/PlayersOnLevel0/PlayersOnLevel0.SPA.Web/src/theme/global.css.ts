import { globalStyle } from '@vanilla-extract/css';
import { vars } from './theme.css';

globalStyle('*, *::before, *::after', {
  boxSizing: 'border-box',
  margin: 0,
  padding: 0,
});

globalStyle('html, body', {
  height: '100%',
  fontFamily: vars.font.body,
  backgroundColor: '#0a0a0f',
  color: '#e8e8f0',
  lineHeight: 1.6,
});

globalStyle('#root', {
  height: '100%',
});
