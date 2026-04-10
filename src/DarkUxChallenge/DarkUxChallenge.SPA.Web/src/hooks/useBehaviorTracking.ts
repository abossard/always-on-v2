import { useEffect, useRef, useCallback } from 'react';

interface MouseScore {
  entropy: number;
  isRobotic: boolean;
  sampleCount: number;
}

interface MouseEvent2D {
  x: number;
  y: number;
  t: number;
}

/**
 * Tracks mouse movement patterns and computes a "roboticness" score.
 * Returns an entropy score: low entropy = suspicious bot-like movement.
 * Also provides a header value to send with API requests.
 */
export function useBehaviorTracking(): {
  getScore: () => MouseScore;
  getHeader: () => string;
} {
  const eventsRef = useRef<MouseEvent2D[]>([]);

  useEffect(() => {
    function handleMouseMove(e: MouseEvent) {
      const events = eventsRef.current;
      events.push({ x: e.clientX, y: e.clientY, t: Date.now() });
      if (events.length > 150) events.shift();
    }

    document.addEventListener('mousemove', handleMouseMove, { passive: true });
    return () => document.removeEventListener('mousemove', handleMouseMove);
  }, []);

  const getScore = useCallback((): MouseScore => {
    const events = eventsRef.current;
    if (events.length < 10) {
      return { entropy: 0, isRobotic: false, sampleCount: events.length };
    }

    // Calculate velocity variance (humans have high variance, bots are uniform)
    const velocities: number[] = [];
    const angles: number[] = [];

    for (let i = 1; i < events.length; i++) {
      const dx = events[i].x - events[i - 1].x;
      const dy = events[i].y - events[i - 1].y;
      const dt = Math.max(1, events[i].t - events[i - 1].t);
      velocities.push(Math.sqrt(dx * dx + dy * dy) / dt);
      angles.push(Math.atan2(dy, dx));
    }

    const velMean = velocities.reduce((a, b) => a + b, 0) / velocities.length;
    const velVariance = velocities.reduce((sum, v) => sum + (v - velMean) ** 2, 0) / velocities.length;

    // Angle change variance (humans curve, bots go straight)
    const angleChanges: number[] = [];
    for (let i = 1; i < angles.length; i++) {
      angleChanges.push(Math.abs(angles[i] - angles[i - 1]));
    }
    const angleVariance = angleChanges.length > 0
      ? angleChanges.reduce((sum, a) => sum + a ** 2, 0) / angleChanges.length
      : 0;

    const entropy = velVariance * 1000 + angleVariance * 100;
    const isRobotic = entropy < 0.5 && events.length > 20;

    return { entropy, isRobotic, sampleCount: events.length };
  }, []);

  const getHeader = useCallback((): string => {
    const score = getScore();
    return `e=${score.entropy.toFixed(3)};r=${score.isRobotic ? 1 : 0};n=${score.sampleCount}`;
  }, [getScore]);

  return { getScore, getHeader };
}
