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
      <button
        className={styles.button}
        onClick={onClick}
        aria-label="Click to earn points"
      >
        <span className={styles.clickCount}>{formatClicks(totalClicks)}</span>
        <span>CLICK</span>
      </button>
    </div>
  );
});
