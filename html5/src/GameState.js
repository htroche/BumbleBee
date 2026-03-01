/**
 * GameState — singleton that persists across Phaser scene restarts.
 *
 * Why a module-level object instead of Phaser registry?
 *   scene.restart() destroys and recreates the scene, wiping any
 *   per-scene state.  This module keeps lives, level number, and
 *   cumulative score alive across restarts so we can implement:
 *     • per-level lives (reset only on full GAME_OVER retry)
 *     • level progression (1 → 2 → 3 → Win)
 *     • total score accumulation across levels
 */

export const GameState = {
  /** 1-indexed level number (1–3) */
  currentLevel: 1,

  /** Remaining lives for the current level attempt (0 = game over) */
  lives: 2,

  /** Total score accumulated across all levels this session */
  totalScore: 0,

  // ─── Mutations ────────────────────────────────────────────────────────────

  /** Full reset — call when returning to the main menu after winning/quitting */
  reset() {
    this.currentLevel = 1;
    this.lives        = 2;
    this.totalScore   = 0;
  },

  /**
   * Call when the player retries the current level after GAME_OVER.
   * Resets lives to 2; currentLevel and totalScore unchanged.
   */
  retryLevel() {
    this.lives = 2;
  },

  /**
   * Call when the player completes a level.
   * Adds levelScore to the running total and bumps the level counter.
   * Lives refresh to 2 for the new level.
   *
   * @param {number} levelScore – score earned this level
   */
  advanceLevel(levelScore) {
    this.totalScore  += levelScore;
    this.currentLevel += 1;
    this.lives        = 2;
  },
};
