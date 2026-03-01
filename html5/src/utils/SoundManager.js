/**
 * SoundManager — Web Audio API sound effects (no external library, no audio files).
 *
 * Each effect is a brief programmatic oscillator + gain envelope.
 * Sound can be muted globally via SoundManager.muted.
 */

const MUTE_KEY = 'bumblebee_sound_muted';

// Lazily create AudioContext on first use (avoids autoplay policy issues).
let _ctx = null;
function getCtx() {
  if (!_ctx) {
    _ctx = new (window.AudioContext || window.webkitAudioContext)();
  }
  // Resume if suspended (browser autoplay policy)
  if (_ctx.state === 'suspended') {
    _ctx.resume();
  }
  return _ctx;
}

/**
 * Play a tone with the given parameters.
 * @param {number}   freq        - start frequency (Hz)
 * @param {number}   endFreq     - end frequency (for sweep; same as freq for flat)
 * @param {number}   duration    - duration in seconds
 * @param {string}   type        - OscillatorType ('sine'|'square'|'sawtooth'|'triangle')
 * @param {number}   volume      - peak gain (0–1)
 */
function playTone(freq, endFreq, duration, type = 'sine', volume = 0.35) {
  const ctx  = getCtx();
  const osc  = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.type = type;
  osc.frequency.setValueAtTime(freq, ctx.currentTime);
  if (endFreq !== freq) {
    osc.frequency.linearRampToValueAtTime(endFreq, ctx.currentTime + duration);
  }

  // Attack–decay envelope
  gain.gain.setValueAtTime(0, ctx.currentTime);
  gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + duration + 0.01);
}

export const SoundManager = {
  /** Read/write: set to true to silence all sounds. */
  get muted() {
    return localStorage.getItem(MUTE_KEY) === '1';
  },
  set muted(val) {
    localStorage.setItem(MUTE_KEY, val ? '1' : '0');
  },

  /** Short ascending beep — coin collect. */
  coin() {
    if (this.muted) return;
    playTone(660, 1320, 0.18, 'sine', 0.3);
  },

  /** Low thud — wall hit / bee death. */
  hit() {
    if (this.muted) return;
    playTone(120, 60, 0.25, 'sawtooth', 0.45);
  },

  /** Short fanfare — level complete. */
  levelComplete() {
    if (this.muted) return;
    // Three quick ascending notes
    const ctx = getCtx();
    const notes = [523, 659, 784];
    notes.forEach((freq, i) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.12);
      gain.gain.setValueAtTime(0, ctx.currentTime + i * 0.12);
      gain.gain.linearRampToValueAtTime(0.35, ctx.currentTime + i * 0.12 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.12 + 0.18);
      osc.start(ctx.currentTime + i * 0.12);
      osc.stop(ctx.currentTime + i * 0.12 + 0.2);
    });
  },

  /** Descending tone — game over. */
  gameOver() {
    if (this.muted) return;
    playTone(440, 110, 0.7, 'sawtooth', 0.4);
  },
};
