/**
 * LevelUnlock — localStorage-backed level unlock tracker.
 *
 * Stores the highest level the player has reached.
 * Used by MenuScene (P6) to show a "Level 2 →" jump button.
 */

const UNLOCKED_KEY = 'bumblebee_unlocked_level';

/** Returns the highest level unlocked (minimum 1). */
export function getUnlockedLevel() {
  return parseInt(localStorage.getItem(UNLOCKED_KEY) || '1', 10);
}

/** Unlock the given level if it's higher than the current record. */
export function unlockLevel(level) {
  if (level > getUnlockedLevel()) {
    localStorage.setItem(UNLOCKED_KEY, String(level));
  }
}
