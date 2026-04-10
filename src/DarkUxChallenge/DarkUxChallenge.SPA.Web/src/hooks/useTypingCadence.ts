import { useRef, useCallback } from 'react';

interface TypingPattern {
  intervals: number[];
  avgInterval: number;
  variance: number;
  isSuspicious: boolean;
}

/**
 * Tracks inter-keystroke timing to detect bot-like uniform typing.
 * Humans type with variable rhythm; bots type uniformly.
 */
export function useTypingCadence(): {
  recordKeystroke: () => void;
  getPattern: () => TypingPattern;
  reset: () => void;
} {
  const timestampsRef = useRef<number[]>([]);

  const recordKeystroke = useCallback(() => {
    timestampsRef.current.push(Date.now());
    if (timestampsRef.current.length > 100) {
      timestampsRef.current.shift();
    }
  }, []);

  const getPattern = useCallback((): TypingPattern => {
    const ts = timestampsRef.current;
    if (ts.length < 3) {
      return { intervals: [], avgInterval: 0, variance: 0, isSuspicious: false };
    }

    const intervals: number[] = [];
    for (let i = 1; i < ts.length; i++) {
      intervals.push(ts[i] - ts[i - 1]);
    }

    const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const variance = intervals.reduce((sum, v) => sum + (v - avg) ** 2, 0) / intervals.length;

    // Suspicious: very low variance (uniform timing) or impossibly fast (<5ms avg)
    const isSuspicious = (variance < 100 && intervals.length > 5) || avg < 5;

    return { intervals, avgInterval: avg, variance, isSuspicious };
  }, []);

  const reset = useCallback(() => {
    timestampsRef.current = [];
  }, []);

  return { recordKeystroke, getPattern, reset };
}
