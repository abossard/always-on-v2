import type { AchievementResponse, ClickAchievementResponse } from '../../api/types';
import * as styles from './AchievementList.css';

interface Props {
  achievements: AchievementResponse[];
  clickAchievements: ClickAchievementResponse[];
}

const CLICK_ACHIEVEMENT_NAMES: Record<string, string[]> = {
  'total-clicks':      ['100 Total Clicks', '1,000 Total Clicks', '10,000 Total Clicks', '100,000 Total Clicks', '1,000,000 Total Clicks'],
  'clicks-per-second': ['5 Clicks/sec', '10 Clicks/sec', '20 Clicks/sec', '50 Clicks/sec'],
  'clicks-per-minute': ['60 Clicks/min', '200 Clicks/min', '500 Clicks/min', '1,000 Clicks/min'],
};

function clickAchievementLabel(achievementId: string, tier: number): string {
  const names = CLICK_ACHIEVEMENT_NAMES[achievementId];
  return names?.[tier - 1] ?? `${achievementId} Tier ${tier}`;
}

export function AchievementList({ achievements, clickAchievements }: Props) {
  const hasAny = achievements.length > 0 || clickAchievements.length > 0;

  return (
    <>
      <h2 className={styles.heading}>Achievements</h2>
      {!hasAny && <p className={styles.empty}>No achievements yet. Keep clicking!</p>}
      <ul className={styles.list} role="list" aria-label="Achievements">
        {achievements.map((a) => (
          <li key={a.id} className={styles.item}>
            <span className={styles.name}>{a.name}</span>
            <span className={styles.badge}>🏆</span>
          </li>
        ))}
        {clickAchievements.map((a) => (
          <li key={`${a.achievementId}-${a.tier}`} className={styles.item}>
            <span className={styles.name}>{clickAchievementLabel(a.achievementId, a.tier)}</span>
            <span className={styles.badge}>⭐ Tier {a.tier}</span>
          </li>
        ))}
      </ul>
    </>
  );
}
