/**
 * validate-levels.mjs
 * Run: node html5/validate-levels.mjs
 *
 * Checks all level recipes in ChunkGenerator for:
 *   - Back-to-back hard chunks (gauntlet/squeeze)
 *   - Hard chunks not followed by a rest chunk
 *   - Bubble field spacing (recommend every 5–8 chunks)
 *   - Minimum gap passability (vs. estimated bee hitbox)
 *   - gapY bounds (gap must fit inside the canvas)
 */

import { generateLevel } from './src/levels/ChunkGenerator.js';

// ── Constants ────────────────────────────────────────────────────────────
const CANVAS_H       = 320;
const BEE_HITBOX_H   = 35;   // estimated; bee image * 0.6 scale
const MIN_PASSABLE   = BEE_HITBOX_H + 8; // 43px — gap must exceed this
const HARD_CHUNKS    = new Set(['gauntlet', 'squeeze']);
const REST_CHUNKS    = new Set(['breathing_room', 'open', 'bubble_field']);
const BUBBLE_GAP_MAX = 8;    // warn if bubble fields are >8 chunks apart
const BUBBLE_GAP_MIN = 4;    // warn if bubble fields are <4 chunks apart

// ── Inline recipe + config (mirrors ChunkGenerator) ─────────────────────
// We re-declare them here so the validator is self-contained.

const LEVEL_RECIPES = {
  1: [
    'open',           'coin_run',
    'corridor',       'breathing_room',
    'zigzag',         'open',
    'wave',
    'bubble_field',
    'coin_run',       'fakeout',
    'corridor',       'breathing_room',
    'zigzag',         'coin_run',
    'bubble_field',
    'gauntlet',       'breathing_room',
    'wave',           'open',
    'fakeout',        'coin_run',
    'bubble_field',
    'squeeze',        'breathing_room',
    'gauntlet',       'breathing_room',
    'coin_run',
    'bubble_field',
    'wave',           'zigzag',
    'gauntlet',
  ],
  2: [
    'corridor',       'zigzag',
    'breathing_room', 'coin_run',
    'wave',           'fakeout',
    'open',
    'bubble_field',
    'gauntlet',       'breathing_room',
    'zigzag',         'corridor',
    'wave',           'coin_run',
    'bubble_field',
    'squeeze',        'breathing_room',
    'gauntlet',       'breathing_room',
    'fakeout',        'wave',
    'bubble_field',
    'gauntlet',       'breathing_room',
    'zigzag',         'squeeze',
    'breathing_room',
    'bubble_field',
    'wave',
    'gauntlet',
  ],
  3: [
    'corridor',       'gauntlet',
    'breathing_room', 'wave',
    'squeeze',        'breathing_room',
    'zigzag',
    'bubble_field',
    'gauntlet',       'breathing_room',
    'fakeout',        'wave',
    'squeeze',        'breathing_room',
    'bubble_field',
    'gauntlet',       'breathing_room',
    'zigzag',         'gauntlet',
    'breathing_room', 'wave',
    'bubble_field',
    'squeeze',        'breathing_room',
    'gauntlet',       'breathing_room',
    'fakeout',
    'bubble_field',
    'coin_run',
    'gauntlet',
  ],
};

const LEVEL_CFG = {
  1: { startGap: 120, endGap: 90,  scrollSpeed: 2 },
  2: { startGap: 100, endGap: 76,  scrollSpeed: 3 },
  3: { startGap: 84,  endGap: 60,  scrollSpeed: 4 },
};

// ── Validator ────────────────────────────────────────────────────────────

function validateRecipe(levelNum) {
  const recipe = LEVEL_RECIPES[levelNum];
  const cfg    = LEVEL_CFG[levelNum];
  const errors   = [];
  const warnings = [];
  const info     = [];

  const n = recipe.length;

  // 1. Back-to-back hard chunks
  for (let i = 0; i < n - 1; i++) {
    if (HARD_CHUNKS.has(recipe[i]) && HARD_CHUNKS.has(recipe[i + 1])) {
      errors.push(`Back-to-back hard: '${recipe[i]}' → '${recipe[i + 1]}' at index ${i}`);
    }
  }

  // 2. Hard chunk must be followed by a rest chunk (or be the last chunk)
  for (let i = 0; i < n - 1; i++) {
    if (HARD_CHUNKS.has(recipe[i]) && !REST_CHUNKS.has(recipe[i + 1])) {
      errors.push(`'${recipe[i]}' at index ${i} not followed by a rest chunk (got '${recipe[i + 1]}')`);
    }
  }

  // 3. Bubble field spacing
  const bubbleIdx = recipe.reduce((acc, c, i) => c === 'bubble_field' ? [...acc, i] : acc, []);
  info.push(`Bubble fields: ${bubbleIdx.length} total at indices [${bubbleIdx.join(', ')}]`);
  if (bubbleIdx.length < 3) {
    warnings.push(`Only ${bubbleIdx.length} bubble field(s); recommend ≥3 for a 30-chunk level`);
  }
  for (let i = 1; i < bubbleIdx.length; i++) {
    const gap = bubbleIdx[i] - bubbleIdx[i - 1];
    if (gap > BUBBLE_GAP_MAX) warnings.push(`Bubble gap ${i - 1}→${i}: ${gap} chunks apart (max ${BUBBLE_GAP_MAX})`);
    if (gap < BUBBLE_GAP_MIN) warnings.push(`Bubble gap ${i - 1}→${i}: only ${gap} chunks apart (min ${BUBBLE_GAP_MIN})`);
  }

  // 4. Minimum passable gap
  const minGap = cfg.endGap; // tightest point is at the last chunk
  if (minGap < MIN_PASSABLE) {
    errors.push(`Minimum gap ${minGap}px < passability threshold ${MIN_PASSABLE}px (bee ~${BEE_HITBOX_H}px + margin)`);
  } else {
    info.push(`Gap ramp: ${cfg.startGap}px → ${minGap}px (passability OK, min ${MIN_PASSABLE}px)`);
  }

  // 5. Hard chunk density per third of level (early/mid/late)
  const third  = Math.floor(n / 3);
  const thirds = [recipe.slice(0, third), recipe.slice(third, third * 2), recipe.slice(third * 2)];
  const density = thirds.map(t => t.filter(c => HARD_CHUNKS.has(c)).length);
  info.push(`Hard chunk distribution (early/mid/late): ${density.join(' / ')}`);
  if (density[0] > density[2]) {
    warnings.push(`More hard chunks early (${density[0]}) than late (${density[2]}) — difficulty curve inverted`);
  }

  // 6. Validate the generated obstacles using the actual generator
  try {
    const level = generateLevel(levelNum);
    const tightestGap = level.obstacles
      .filter(o => o.type === 'wallPair')
      .reduce((min, o) => Math.min(min, o.gapHeight ?? 9999), 9999);
    const outOfBounds = level.obstacles.filter(o => {
      if (o.type !== 'wallPair') return false;
      return (o.gapY < 0) || (o.gapY + o.gapHeight > CANVAS_H);
    });
    info.push(`Generated ${level.obstacles.length} obstacles, level length ${level.length}px`);
    info.push(`Tightest wallPair gap in generated output: ${tightestGap}px`);
    if (outOfBounds.length > 0) {
      errors.push(`${outOfBounds.length} wallPair(s) extend outside canvas bounds (0–${CANVAS_H}px)`);
    }
  } catch (e) {
    errors.push(`generateLevel(${levelNum}) threw: ${e.message}`);
  }

  return { errors, warnings, info };
}

// ── Report ────────────────────────────────────────────────────────────────

let anyFail = false;

for (const levelNum of [1, 2, 3]) {
  const { errors, warnings, info } = validateRecipe(levelNum);
  const status = errors.length > 0 ? '✗ FAIL' : warnings.length > 0 ? '⚠ WARN' : '✓ PASS';
  if (errors.length > 0) anyFail = true;

  console.log(`\n── Level ${levelNum} ${status} ${'─'.repeat(50 - `Level ${levelNum} ${status}`.length)}`);
  info.forEach(m     => console.log(`   ℹ  ${m}`));
  warnings.forEach(m => console.log(`   ⚠  ${m}`));
  errors.forEach(m   => console.log(`   ✗  ${m}`));
}

console.log(`\n${'─'.repeat(56)}`);
console.log(anyFail ? '✗  Validation FAILED — fix errors above' : '✓  All levels passed validation');
console.log('');

process.exit(anyFail ? 1 : 0);
