import { useState, useEffect, useCallback } from 'react';

/**
 * Countdown timer hook
 */
export function useCountdown(
  targetDate: Date | string | number,
  onComplete?: () => void
) {
  const [timeLeft, setTimeLeft] = useState(
    Math.max(0, new Date(targetDate).getTime() - Date.now())
  );

  useEffect(() => {
    if (timeLeft <= 0) {
      onComplete?.();
      return;
    }

    const timer = setInterval(() => {
      const remaining = Math.max(0, new Date(targetDate).getTime() - Date.now());
      setTimeLeft(remaining);
      if (remaining <= 0) {
        clearInterval(timer);
        onComplete?.();
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [targetDate, onComplete, timeLeft]);

  const days = Math.floor(timeLeft / (1000 * 60 * 60 * 24));
  const hours = Math.floor((timeLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((timeLeft % (1000 * 60)) / 1000);

  return { days, hours, minutes, seconds, isComplete: timeLeft <= 0 };
}
