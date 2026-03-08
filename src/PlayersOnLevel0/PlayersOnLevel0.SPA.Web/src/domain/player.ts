// CALCULATIONS: Pure functions, no side effects, no imports from React.
// These are trivially testable.

export function levelFromScore(score: number): number {
  return Math.floor(score / 1000) + 1;
}

export function formatClicks(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function scoreToNextLevel(score: number): { current: number; needed: number } {
  const currentLevel = levelFromScore(score);
  const nextLevelAt = currentLevel * 1000;
  const progressInLevel = score - (currentLevel - 1) * 1000;
  return { current: progressInLevel, needed: nextLevelAt - (currentLevel - 1) * 1000 };
}
