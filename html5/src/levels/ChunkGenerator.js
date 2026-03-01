/**
 * ChunkGenerator — builds levels from reusable obstacle chunks.
 * Each chunk is ~400–600px wide and describes a distinct gameplay pattern.
 * Levels are composed by sequencing chunks with rules to avoid repetition.
 *
 * Difficulty scaling:
 *   - gapSize interpolates from cfg.startGap → cfg.endGap across the level
 *   - This creates a smooth ramp: early chunks are more forgiving, climax is tightest
 */

const CANVAS_H = 320;

// ─── CHUNK DEFINITIONS ────────────────────────────────────────────────────
// Each chunk fn returns an array of obstacle descriptors relative to x=0.
// Types: 'wall', 'wallPair', 'coin', 'bubble'

const CHUNKS = {

  open: (cfg) => {
    // Wide open, just coins to grab
    const obs = [];
    for (let i = 0; i < 5; i++) {
      obs.push({ type: 'coin', x: 80 + i * 80, y: 80 + Math.sin(i * 1.2) * 60, points: 10 });
    }
    return { obstacles: obs, width: 500 };
  },

  corridor: (cfg) => {
    // Narrow horizontal tunnel
    const gap  = cfg.gapSize;
    const gapY = cfg.gapY ?? 105;
    const obs  = [];
    for (let wx = 0; wx < 400; wx += 80) {
      obs.push({ type: 'wallPair', x: wx, gapY: gapY - gap / 2, gapHeight: gap, width: 18 });
    }
    // Coins in the middle of the corridor
    for (let i = 0; i < 3; i++) {
      obs.push({ type: 'coin', x: 60 + i * 140, y: gapY, points: 10 });
    }
    return { obstacles: obs, width: 440 };
  },

  zigzag: (cfg) => {
    // Wall pairs that alternate top-heavy / bottom-heavy
    const gap       = cfg.gapSize;
    const positions = [60, 200, 80, 220, 70, 200];
    const obs       = positions.map((gapY, i) => ({
      type: 'wallPair', x: i * 90, gapY: gapY - gap / 2, gapHeight: gap, width: 18,
    }));
    return { obstacles: obs, width: 560 };
  },

  gauntlet: (cfg) => {
    // 4 walls close together — high focus required
    const gap = cfg.gapSize;
    const ys  = [90, 180, 120, 160];
    const obs = ys.map((gapY, i) => ({
      type: 'wallPair', x: i * 80, gapY: gapY - gap / 2, gapHeight: gap, width: 20,
    }));
    return { obstacles: obs, width: 380 };
  },

  coin_run: (cfg) => {
    // Dense coins in a curved arc — reward for skill
    const obs = [];
    for (let i = 0; i < 10; i++) {
      const angle = (i / 9) * Math.PI;
      obs.push({ type: 'coin', x: 40 + i * 50, y: 160 - Math.sin(angle) * 80, points: 10 });
    }
    return { obstacles: obs, width: 540 };
  },

  bubble_field: (_cfg) => {
    // 2 bubbles — intentional rest spots
    return {
      obstacles: [
        { type: 'bubble', x: 120, y: 100 },
        { type: 'bubble', x: 300, y: 210 },
      ],
      width: 450,
    };
  },

  breathing_room: (_cfg) => {
    // Open space after a hard section
    return { obstacles: [], width: 400 };
  },

  wave: (cfg) => {
    // Wall pairs whose gaps rise and fall like a wave
    const gap  = cfg.gapSize;
    const half = gap / 2;
    const obs  = [];
    for (let i = 0; i < 6; i++) {
      // Raw center of the gap follows a sine wave
      const rawCenter = 100 + Math.sin(i * 0.9) * 70;
      // Clamp center so the gap never clips outside the canvas
      const center = Math.max(half, Math.min(CANVAS_H - half, rawCenter));
      obs.push({ type: 'wallPair', x: i * 90, gapY: center - half, gapHeight: gap, width: 18 });
    }
    return { obstacles: obs, width: 580 };
  },

  squeeze: (cfg) => {
    // Gap starts wide and narrows to minimum — tests precise control
    const minGap = cfg.gapSize;
    const obs    = [];
    for (let i = 0; i < 5; i++) {
      const gap = minGap + (4 - i) * 14;
      obs.push({ type: 'wallPair', x: i * 100, gapY: 130, gapHeight: gap, width: 18 });
    }
    return { obstacles: obs, width: 520 };
  },

  fakeout: (cfg) => {
    // Two walls close together then suddenly wide open (relief)
    const gap = cfg.gapSize;
    return {
      obstacles: [
        { type: 'wallPair', x: 60,  gapY: 120 - gap / 2, gapHeight: gap, width: 18 },
        { type: 'wallPair', x: 140, gapY: 150 - gap / 2, gapHeight: gap, width: 18 },
        { type: 'coin',     x: 280, y: 160, points: 20 }, // reward for making it through
        { type: 'coin',     x: 340, y: 120, points: 20 },
        { type: 'coin',     x: 400, y: 200, points: 20 },
      ],
      width: 480,
    };
  },
};

// ─── LEVEL RECIPES ────────────────────────────────────────────────────────
// Rules enforced in these recipes:
//   1. 'gauntlet' and 'squeeze' are HARD chunks — never appear back-to-back
//   2. Every HARD chunk is immediately followed by 'breathing_room' or 'open' or 'bubble_field'
//   3. 'bubble_field' appears every 6–7 chunks (indices ~7, 14, 21, 27)
//   4. Difficulty ramps progressively — hard clusters appear later in the level
//
// gapSize ramps from cfg.startGap (early) → cfg.endGap (late) per chunk index.

const LEVEL_RECIPES = {
  // Level 1: introduce all mechanics gently; first hard chunks at chunk 15+
  1: [
    'open',           'coin_run',          // 0,1   — easy warmup
    'corridor',       'breathing_room',    // 2,3   — first walls, safe gap
    'zigzag',         'open',              // 4,5   — medium
    'wave',                                // 6     — medium
    'bubble_field',                        // 7     — rest #1
    'coin_run',       'fakeout',           // 8,9   — medium
    'corridor',       'breathing_room',    // 10,11 — medium + rest
    'zigzag',         'coin_run',          // 12,13 — medium
    'bubble_field',                        // 14    — rest #2
    'gauntlet',       'breathing_room',    // 15,16 — HARD + rest
    'wave',           'open',              // 17,18 — medium + easy
    'fakeout',        'coin_run',          // 19,20 — medium + easy
    'bubble_field',                        // 21    — rest #3
    'squeeze',        'breathing_room',    // 22,23 — HARD + rest
    'gauntlet',       'breathing_room',    // 24,25 — HARD + rest
    'coin_run',                            // 26    — breather reward
    'bubble_field',                        // 27    — rest #4
    'wave',           'zigzag',            // 28,29 — build to climax
    'gauntlet',                            // 30    — CLIMAX
  ],

  // Level 2: skip the long warmup; first hard chunk arrives at chunk 8
  2: [
    'corridor',       'zigzag',            // 0,1   — medium right away
    'breathing_room', 'coin_run',          // 2,3   — brief rest
    'wave',           'fakeout',           // 4,5   — medium
    'open',                                // 6     — easy breather
    'bubble_field',                        // 7     — rest #1
    'gauntlet',       'breathing_room',    // 8,9   — HARD + rest
    'zigzag',         'corridor',          // 10,11 — medium
    'wave',           'coin_run',          // 12,13 — medium + reward
    'bubble_field',                        // 14    — rest #2
    'squeeze',        'breathing_room',    // 15,16 — HARD + rest
    'gauntlet',       'breathing_room',    // 17,18 — HARD + rest
    'fakeout',        'wave',              // 19,20 — medium
    'bubble_field',                        // 21    — rest #3
    'gauntlet',       'breathing_room',    // 22,23 — HARD + rest
    'zigzag',         'squeeze',           // 24,25 — medium → HARD
    'breathing_room',                      // 26    — rest after squeeze
    'bubble_field',                        // 27    — rest #4
    'wave',                                // 28    — build to climax
    'gauntlet',                            // 29    — CLIMAX
  ],

  // Level 3: hard from chunk 1; 7 gauntlets + 3 squeezes across the level
  3: [
    'corridor',       'gauntlet',          // 0,1   — HARD immediately
    'breathing_room', 'wave',              // 2,3   — rest then medium
    'squeeze',        'breathing_room',    // 4,5   — HARD + rest
    'zigzag',                              // 6     — medium
    'bubble_field',                        // 7     — rest #1
    'gauntlet',       'breathing_room',    // 8,9   — HARD + rest
    'fakeout',        'wave',              // 10,11 — medium
    'squeeze',        'breathing_room',    // 12,13 — HARD + rest
    'bubble_field',                        // 14    — rest #2
    'gauntlet',       'breathing_room',    // 15,16 — HARD + rest
    'zigzag',         'gauntlet',          // 17,18 — medium → HARD
    'breathing_room', 'wave',              // 19,20 — rest + medium
    'bubble_field',                        // 21    — rest #3
    'squeeze',        'breathing_room',    // 22,23 — HARD + rest
    'gauntlet',       'breathing_room',    // 24,25 — HARD + rest
    'fakeout',                             // 26    — medium (reward coins)
    'bubble_field',                        // 27    — rest #4 (last breather)
    'coin_run',                            // 28    — calm before the storm
    'gauntlet',                            // 29    — CLIMAX
  ],
};

// ─── DIFFICULTY CONFIG ────────────────────────────────────────────────────
// gapSize ramps linearly from startGap (first chunk) to endGap (last chunk).
// scrollSpeed is constant per level (changing mid-level would feel jarring).
//
// Gap sizing rationale (bee hitbox ~35px):
//   startGap 120 → very comfortable; endGap 60 → tight but learnable

const LEVEL_CFG = {
  1: { startGap: 120, endGap: 90,  scrollSpeed: 2 },
  2: { startGap: 100, endGap: 76,  scrollSpeed: 3 },
  3: { startGap: 84,  endGap: 60,  scrollSpeed: 4 },
};

// ─── GENERATOR ────────────────────────────────────────────────────────────

export function generateLevel(levelNum) {
  const recipe = LEVEL_RECIPES[levelNum] ?? LEVEL_RECIPES[1];
  const cfg    = LEVEL_CFG[levelNum]    ?? LEVEL_CFG[1];

  const obstacles = [];
  let cursorX = 600; // start after bee's initial position + some breathing room

  for (let i = 0; i < recipe.length; i++) {
    const chunkName = recipe[i];
    const chunkFn   = CHUNKS[chunkName];
    if (!chunkFn) continue;

    // Interpolate gapSize: 0% progress = startGap, 100% progress = endGap
    const progress = recipe.length > 1 ? i / (recipe.length - 1) : 0;
    const gapSize  = Math.round(cfg.startGap + (cfg.endGap - cfg.startGap) * progress);

    const chunk = chunkFn({ ...cfg, gapSize });

    // Offset each obstacle by cursorX
    for (const obs of chunk.obstacles) {
      obstacles.push({ ...obs, x: obs.x + cursorX });
    }

    cursorX += chunk.width + 60; // 60px gap between chunks
  }

  return {
    level:       levelNum,
    scrollSpeed: cfg.scrollSpeed,
    length:      cursorX + 400, // level ends 400px after last chunk
    obstacles,
  };
}
