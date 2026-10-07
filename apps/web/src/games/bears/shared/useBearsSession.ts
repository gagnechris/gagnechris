import { useCallback, useEffect, useRef, useState } from 'react';
import {
  trackBearsGameComplete,
  trackBearsGameStart,
  trackBearsTipLinkClick,
} from '../../../utils/analytics';
import { playFailSound, playSuccessSound } from '../sound';
import type { BearsGame } from './games';
import { readHighScore, writeHighScore } from './highScore';

/** Start and end of a round: analytics, high score and the end sound. */
export function useBearsSession(
  game: BearsGame,
  from: string,
  soundOn: boolean,
) {
  const [highScore, setHighScore] = useState(() => readHighScore(game));
  const soundOnRef = useRef(soundOn);

  useEffect(() => {
    soundOnRef.current = soundOn;
  }, [soundOn]);

  const sound = useCallback((play: () => void) => {
    if (soundOnRef.current) play();
  }, []);

  const start = useCallback(() => {
    trackBearsGameStart(game, from);
  }, [game, from]);

  const finish = useCallback(
    (score: number, won: boolean) => {
      trackBearsGameComplete(game, from, score);
      if (score > readHighScore(game)) {
        writeHighScore(game, score);
        setHighScore(score);
      }
      sound(won ? playSuccessSound : playFailSound);
    },
    [game, from, sound],
  );

  const onTipLinkClick = useCallback(() => {
    trackBearsTipLinkClick(from, game);
  }, [from, game]);

  return { highScore, sound, start, finish, onTipLinkClick };
}
