import { memo } from 'react';
import { formatClicks } from '../../domain/player';
import * as styles from './ClickButton.css';

interface Props {
  totalClicks: number;
  onClick: () => void;
}

export const ClickButton = memo(function ClickButton({ totalClicks, onClick }: Props) {
  return (
    <div className={styles.wrapper}>
      <span className={styles.clickCount} aria-label="Total clicks">
        {formatClicks(totalClicks)}
      </span>
      <button
        className={styles.button}
        onClick={onClick}
        aria-label="Click to earn points"
      >
        CLICK
      </button>
    </div>
  );
});
