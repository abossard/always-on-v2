# PlayersOnLevel0 → Clicker Game Plan

## Philosophy
- Click API is the new game mechanic, layered **on top of** the existing player progression API
- No gold, no currency, no upgrades, no shop
- Pure clicks + time-windowed achievements
- Every click API call = 1 click. No batching, no limits, no quotas
- Click achievements are **repeatable** (earn them multiple times at increasing tiers)
- Existing score/level/achievement system stays as-is and works alongside

---

## API Surface

### Existing (already implemented, keep as-is)

#### `GET /api/players/{playerId}`
- Returns full player state (score, level, achievements, clicks)

#### `POST /api/players/{playerId}`
- Update player: add score, unlock manual achievements
- Request: `{ addScore?: number, unlockAchievement?: { id, name } }`
- Get-or-create pattern, optimistic concurrency via ETag

#### `PUT /api/players/{playerId}`
- Same as POST (alias)

### New (clicker game)

#### `POST /api/players/{playerId}/click`
- Increments `TotalClicks` by 1
- Records click timestamp
- Evaluates all click-achievement conditions
- Auto-awards click achievements (no separate unlock call needed)
- Returns: current state + any newly earned achievement instances

---

## Domain Model

### `PlayerProgression` (extended)
Existing fields stay:
```
PlayerId        : Guid
Level           : Level
Score           : Score
Achievements    : list of Achievement (manually unlocked via POST)
CreatedAt       : DateTimeOffset
UpdatedAt       : DateTimeOffset
ETag            : string
```

New fields added:
```
TotalClicks       : long
ClickAchievements : list of (AchievementId, Tier, EarnedAt)
```

### Click Rate Calculation — Pure In-Memory, No Persisted State

- Rate tracking lives **only in server memory** (per-player timestamp list)
- **Nothing about rates is stored in the database** — zero extra write cost
- On each click, append `DateTimeOffset.UtcNow` to an in-memory list per player
- Prune entries older than 60s on each click
- Count entries in last 1s → clicks/sec, count entries in last 60s → clicks/min
- If the server restarts, rate history resets — **this is acceptable**
  - Rate achievements are about bursts in a single session
  - Total-click achievements are persisted and survive restarts
- Implementation: `ConcurrentDictionary<PlayerId, List<DateTimeOffset>>` or similar

### Interaction between systems
- `POST /click` → updates TotalClicks + ClickAchievements (persisted) + in-memory rate tracker (not persisted)
- `POST /players/{id}` → updates Score + Level + (manual) Achievements
- `GET /players/{id}` → returns everything: score, level, clicks, both achievement lists
- Score/Level remain independent from clicks (could wire them later, but not now)

### Achievement System

Achievements are **staggered tiers** — each can be earned multiple times at increasing thresholds.

#### By Total Clicks (lifetime)
| Tier | Threshold |
|------|-----------|
| 1 | 100 |
| 2 | 1,000 |
| 3 | 10,000 |
| 4 | 100,000 |
| 5 | 1,000,000 |

#### By Clicks Per Second (burst)
| Tier | Clicks in 1 second |
|------|---------------------|
| 1 | 5 |
| 2 | 10 |
| 3 | 20 |
| 4 | 50 |

#### By Clicks Per Minute
| Tier | Clicks in 1 minute |
|------|---------------------|
| 1 | 60 |
| 2 | 200 |
| 3 | 500 |
| 4 | 1,000 |

### Achievement Evaluation (pure function)
```
EvaluateAchievements(totalClicks, clickTimestamps, existingAchievements)
  → list of newly earned (AchievementId, Tier, EarnedAt)
```
- Compares current rates against thresholds
- Only awards tiers not yet earned
- Each tier earned once (but next tier is a new earn)

---

## Storage

### Cosmos Document (flat, extended from existing)
```json
{
  "id": "<playerId>",
  "playerId": "<guid>",
  "level": 3,
  "score": 2500,
  "achievements": [
    { "id": "first-blood", "name": "First Blood", "unlockedAt": "..." }
  ],
  "totalClicks": 42573,
  "clickAchievements": [
    { "id": "total-clicks", "tier": 3, "earnedAt": "..." },
    { "id": "clicks-per-second", "tier": 2, "earnedAt": "..." }
  ],
  "createdAt": "...",
  "updatedAt": "...",
  "_etag": "..."
}
```

- Partition key: `/playerId`
- No rate state persisted — rates are in-memory only
- Document grows only by click achievements (bounded list)

---

## Web (PlayerDashboard)

- Big click button (each click = 1 `POST /click`)
- Display: total clicks, current click rates (per sec/min/hour/day)
- Click achievement wall: grid of all click achievements with tier badges
- New achievement toast/animation on earn
- Existing dashboard features (name, XP, stats, manual achievements) remain

---

## Implementation Steps

1. **Domain**: Extend `PlayerProgression` with `TotalClicks`, `ClickAchievements`, `WithClick()`, achievement evaluator
2. **Rate tracker**: In-memory service (`IClickRateTracker`) — append timestamps, prune, count per window
3. **API**: Add `POST /click` endpoint — calls rate tracker + domain + store
4. **Storage**: Extend Cosmos document shape (additive — only `totalClicks` + `clickAchievements` added)
5. **Response**: Extend `PlayerResponse` to include click data + click achievements
6. **Web**: Add click button + click achievement display to dashboard
7. **Tests**: Achievement threshold logic, rate tracker with fake clock, tier earning, coexistence with existing tests

---

## Design Principle (from ADR 0026)
> "production-grade ≠ complex"
- Domain logic stays pure
- Cosmos document stays flat
- API stays thin (parse → validate → domain → store → respond)
- One endpoint. Click it.
