import * as styles from './PlayerStats.css';

interface Props {
  level: number;
  score: number;
}

export function PlayerStats({ level, score }: Props) {
  return (
    <section className={styles.grid} aria-label="Player statistics">
      <div className={styles.stat}>
        <div className={styles.label}>Level</div>
        <div className={styles.value}>{level}</div>
      </div>
      <div className={styles.stat}>
        <div className={styles.label}>Score</div>
        <div className={styles.value}>{score.toLocaleString()}</div>
      </div>
    </section>
  );
}
