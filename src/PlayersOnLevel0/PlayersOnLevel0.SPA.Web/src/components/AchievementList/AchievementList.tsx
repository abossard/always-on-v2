import type { AchievementResponse, ClickAchievementResponse } from '../../api/types';
import * as styles from './AchievementList.css';

interface Props {
  achievements: AchievementResponse[];
  clickAchievements: ClickAchievementResponse[];
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
            <span className={styles.name}>{a.achievementId}</span>
            <span className={styles.badge}>⭐ Tier {a.tier}</span>
          </li>
        ))}
      </ul>
    </>
  );
}
