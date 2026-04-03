// DATA: API types — mirrors the server's JSON contract exactly.
// No logic, no behavior, just shapes.

export interface PlayerResponse {
  playerId: string;
  level: number;
  score: number;
  totalClicks: number;
  achievements: AchievementResponse[];
  clickAchievements: ClickAchievementResponse[];
  createdAt: string;
  updatedAt: string;
}

export interface AchievementResponse {
  id: string;
  name: string;
  unlockedAt: string;
}

export interface ClickAchievementResponse {
  achievementId: string;
  tier: number;
  earnedAt: string;
}

export interface UpdatePlayerRequest {
  addScore?: number;
  unlockAchievement?: { id: string; name: string };
}

// SSE event types — discriminated union
export type PlayerEvent =
  | ClickRecordedEvent
  | ClickAchievementEarnedEvent
  | ScoreUpdatedEvent
  | AchievementUnlockedEvent
  | LeaderboardUpdatedEvent;

export interface ClickRecordedEvent {
  type: 'clickRecorded';
  playerId: string;
  totalClicks: number;
  occurredAt: string;
}

export interface ClickAchievementEarnedEvent {
  type: 'clickAchievementEarned';
  playerId: string;
  achievementId: string;
  tier: number;
  occurredAt: string;
}

export interface ScoreUpdatedEvent {
  type: 'scoreUpdated';
  playerId: string;
  newScore: number;
  newLevel: number;
  occurredAt: string;
}

export interface AchievementUnlockedEvent {
  type: 'achievementUnlocked';
  playerId: string;
  achievementId: string;
  name: string;
  occurredAt: string;
}

// Leaderboard types
export interface LeaderboardResponse {
  window: string;
  entries: LeaderboardEntryResponse[];
  asOf: string;
}

export interface LeaderboardEntryResponse {
  rank: number;
  playerId: string;
  score: number;
  totalClicks: number;
  updatedAt: string;
}

export interface LeaderboardUpdatedEvent {
  type: 'leaderboardUpdated';
  playerId: string;
  snapshot: LeaderboardSnapshot;
  occurredAt: string;
}

export interface LeaderboardSnapshot {
  allTime: LeaderboardEntryResponse[];
  daily: LeaderboardEntryResponse[];
  weekly: LeaderboardEntryResponse[];
}
