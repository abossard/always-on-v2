/**
 * Homoglyph substitutions: visually identical Unicode characters
 * that break LLM tokenizers and copy-paste extraction.
 */
const HOMOGLYPH_MAP: Record<string, string[]> = {
  'a': ['\u0430'],                // Cyrillic а
  'c': ['\u0441', '\u217D'],      // Cyrillic с, Small Roman Numeral Hundred
  'e': ['\u0435'],                // Cyrillic е
  'o': ['\u043E', '\u03BF'],      // Cyrillic о, Greek ο
  'p': ['\u0440'],                // Cyrillic р
  's': ['\u0455'],                // Cyrillic ѕ
  'x': ['\u0445'],                // Cyrillic х
  'y': ['\u0443'],                // Cyrillic у
  'i': ['\u0456'],                // Cyrillic і
  'A': ['\u0410'],                // Cyrillic А
  'B': ['\u0412'],                // Cyrillic В (looks like B)
  'C': ['\u0421'],                // Cyrillic С
  'E': ['\u0415'],                // Cyrillic Е
  'H': ['\u041D'],                // Cyrillic Н
  'O': ['\u041E'],                // Cyrillic О
  'P': ['\u0420'],                // Cyrillic Р
  'T': ['\u0422'],                // Cyrillic Т
};

/**
 * Sprinkle homoglyphs into text at a given density (0-1).
 * Humans see the same text; LLM tokenizers get confused.
 */
export function seasonWithHomoglyphs(text: string, density = 0.3): string {
  return text
    .split('')
    .map((char) => {
      const replacements = HOMOGLYPH_MAP[char];
      if (!replacements || Math.random() > density) return char;
      return replacements[Math.floor(Math.random() * replacements.length)];
    })
    .join('');
}

/**
 * Inject zero-width characters as a watermark.
 * Each call produces a unique pattern traceable to the session.
 */
export function watermarkText(text: string, sessionId: string): string {
  const zwChars = ['\u200B', '\u200C', '\u200D', '\uFEFF'];
  let hash = 0;
  for (let i = 0; i < sessionId.length; i++) {
    hash = ((hash << 5) - hash + sessionId.charCodeAt(i)) | 0;
  }

  return text
    .split('')
    .map((char, i) => {
      if (i % 4 !== 0) return char;
      const zwIndex = Math.abs((hash + i * 7) % zwChars.length);
      return char + zwChars[zwIndex];
    })
    .join('');
}
