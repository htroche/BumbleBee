/**
 * HighScore — localStorage-backed high score tracker.
 *
 * Key: 'bumblebee_highscore'
 * Stores the all-time best total score across sessions.
 */

const KEY = 'bumblebee_highscore';

export const HighScore = {
  /** Returns the stored high score (0 if none). */
  get: () => parseInt(localStorage.getItem(KEY) || '0', 10),

  /**
   * Saves score only if it beats the current record.
   * @param {number} score
   */
  set: (score) => {
    if (score > HighScore.get()) {
      localStorage.setItem(KEY, String(score));
    }
  },

  /** Clears the stored high score. */
  reset: () => localStorage.removeItem(KEY),
};
