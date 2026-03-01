/**
 * ChunkGenerator — builds levels from reusable obstacle chunks.
 * Each chunk is ~400–600px wide and describes a distinct gameplay pattern.
 * Levels are composed by sequencing chunks with rules to avoid repetition.
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
    const gap  = cfg.gapSize;      // e.g. 110
    const gapY = cfg.gapY ?? 105;  // center of gap
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
    // 2–3 bubbles — intentional rest spots
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
    const gap = cfg.gapSize;
    const obs = [];
    for (let i = 0; i < 6; i++) {
      const gapY = 100 + Math.sin(i * 0.9) * 70;
      obs.push({ type: 'wallPair', x: i * 90, gapY: gapY - gap / 2, gapHeight: gap, width: 18 });
    }
    return { obstacles: obs, width: 580 };
  },

  squeeze: (cfg) => {
    // Gap starts wide and narrows to minimum
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
        { type: 'coin',     x: 280, y: 160, points: 20 }, // reward
        { type: 'coin',     x: 340, y: 120, points: 20 },
        { type: 'coin',     x: 400, y: 200, points: 20 },
      ],
      width: 480,
    };
  },
};

// ─── LEVEL RECIPES ────────────────────────────────────────────────────────
// Each level is a sequence of chunk names. Rules:
//   - Never two 'gauntlet' or 'squeeze' back to back
//   - Always follow hard chunks with 'breathing_room' or 'open'
//   - Scatter 'bubble_field' every 5–7 chunks
//   - More hard chunks later in the level

const LEVEL_RECIPES = {
  1: [
    'open',         'coin_run',
    'corridor',     'breathing_room',
    'zigzag',       'open',
    'wave',         'breathing_room',
    'fakeout',      'coin_run',
    'bubble_field',
    'corridor',     'breathing_room',
    'zigzag',       'coin_run',
    'gauntlet',     'breathing_room',
    'wave',         'open',
    'squeeze',      'breathing_room',
    'fakeout',      'coin_run',
    'gauntlet',     'breathing_room',
    'zigzag',       'wave',
    'open',         'coin_run',
    'gauntlet',                       // climax
  ],
  2: [
    'coin_run',     'corridor',
    'zigzag',       'open',
    'gauntlet',     'breathing_room',
    'wave',         'fakeout',
    'squeeze',      'breathing_room',
    'bubble_field',
    'gauntlet',     'wave',
    'zigzag',       'coin_run',
    'squeeze',      'breathing_room',
    'gauntlet',     'fakeout',
    'wave',         'corridor',
    'gauntlet',     'breathing_room',
    'squeeze',      'zigzag',
    'gauntlet',     'coin_run',
    'wave',         'gauntlet',
  ],
  3: [
    'corridor',     'gauntlet',
    'squeeze',      'coin_run',
    'wave',         'gauntlet',
    'fakeout',      'breathing_room',
    'bubble_field',
    'gauntlet',     'squeeze',
    'zigzag',       'gauntlet',
    'wave',         'coin_run',
    'gauntlet',     'fakeout',
    'squeeze',      'gauntlet',
    'wave',         'zigzag',
    'gauntlet',     'breathing_room',
    'squeeze',      'gauntlet',
    'coin_run',     'wave',
    'gauntlet',     'squeeze',
    'gauntlet',                       // climax
  ],
};

const LEVEL_CFG = {
  1: { gapSize: 100, scrollSpeed: 2 },
  2: { gapSize: 88,  scrollSpeed: 3 },
  3: { gapSize: 74,  scrollSpeed: 4 },
};

// ─── GENERATOR ────────────────────────────────────────────────────────────

export function generateLevel(levelNum) {
  const recipe = LEVEL_RECIPES[levelNum] ?? LEVEL_RECIPES[1];
  const cfg    = LEVEL_CFG[levelNum]    ?? LEVEL_CFG[1];

  const obstacles = [];
  let cursorX = 600; // start after bee's initial position + some breathing room

  for (const chunkName of recipe) {
    const chunkFn = CHUNKS[chunkName];
    if (!chunkFn) continue;

    const chunk = chunkFn(cfg);

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
