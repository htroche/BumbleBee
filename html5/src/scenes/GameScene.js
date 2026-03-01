/**
 * GameScene — Phase 3 (Lives, Level Progression, wallPair obstacles)
 *
 * Ported from GameMechanics.lua (Corona SDK → Phaser 3).
 *
 * State machine:
 *   READY          — waiting for tap/space; world is static
 *   PLAYING        — world scrolls left, bee controllable
 *   PAUSED         — hit a bubble; tap/space to resume
 *   DYING          — bee flashing after wall hit (brief)
 *   LEVEL_COMPLETE — reached the finish line
 *   GAME_OVER      — 0 lives remaining
 *
 * Phase 3 additions:
 *   • Lives system  — 2 bee-icon HUD icons (top-left); wall hit → flash/respawn
 *     → remove one life; 0 lives → GAME_OVER overlay "Level Failed! Tap to retry"
 *   • Level progression — GameState drives currentLevel (1→2→3→Win)
 *   • wallPair obstacle type — generates top-wall + bottom-wall automatically
 *   • Dynamic scroll speed — pulled from levelData.scrollSpeed
 *   • WinScene — launched after completing level 3
 */

import level1Data from '../data/level1.json';
import level2Data from '../data/level2.json';
import level3Data from '../data/level3.json';
import { GameState } from '../GameState.js';

const LEVEL_DATA = [null, level1Data, level2Data, level3Data]; // 1-indexed

const BEE_X         = 120; // fixed horizontal position
const VERT_SPEED    = 4;   // px per frame keyboard control
const DIGIT_SPACING = 18;  // px between score digit sprites
const MAX_LEVELS    = 3;

// State enum
const STATE = {
  READY:          'READY',
  PLAYING:        'PLAYING',
  PAUSED:         'PAUSED',
  DYING:          'DYING',
  LEVEL_COMPLETE: 'LEVEL_COMPLETE',
  GAME_OVER:      'GAME_OVER',
};

// Dimensions for wallPair obstacles (fit the 320px canvas height)
const CANVAS_HEIGHT  = 320;
const WALL_THICKNESS = 48; // px — top & bottom wall blocks

export class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' });
    this._state              = STATE.READY;
    this._tiltStartBeta      = null;
    this._orientationHandler = null;
    this._digitImages        = [];
    this._coinTweens         = [];
    this._bubbleTweens       = [];
    this._lifeIcons          = [];   // bee-icon HUD images
  }

  // ─── Asset Loading ────────────────────────────────────────────────────────

  preload() {
    // Backgrounds
    this.load.image('bg',     'assets/thumb_Background.png');
    this.load.image('cloud',  'assets/thumb_Cloud.png');

    // Sprites
    this.load.image('bee',    'assets/thumb_Bee.png');
    this.load.image('wall',   'assets/wall.png');
    this.load.image('coin',   'assets/monster.png');
    this.load.image('bubble', 'assets/thumb_Bubble.png');

    // Digit sprites for score display
    for (let d = 0; d <= 9; d++) {
      this.load.image(`digit_${d}`, `assets/${d}.png`);
    }
  }

  // ─── Scene Creation ────────────────────────────────────────────────────────

  create() {
    const { width, height } = this.scale;

    // Pick level data from GameState
    this._levelData   = LEVEL_DATA[GameState.currentLevel] ?? level1Data;
    this._scrollSpeed = this._levelData.scrollSpeed ?? 2;

    this._state         = STATE.READY;
    this._score         = 0;
    this._worldOffset   = 0;
    this._tiltStartBeta = null;
    this._coinTweens    = [];
    this._bubbleTweens  = [];
    this._lifeIcons     = [];

    // ── Background (tiled, scrolls left) ──
    this._bgTile = this.add
      .tileSprite(0, 0, width, height, 'bg')
      .setOrigin(0, 0);

    // Cloud layer, slight parallax
    this._cloudTile = this.add
      .tileSprite(0, 0, width, height * 0.4, 'cloud')
      .setOrigin(0, 0)
      .setAlpha(0.45);

    // ── World container — everything that scrolls ──
    this._world = this.add.container(0, 0);

    // ── Physics groups ──
    this._walls   = this.physics.add.staticGroup();
    this._coins   = this.physics.add.staticGroup();
    this._bubbles = this.physics.add.staticGroup();

    // ── Build level from JSON ──
    this._buildLevel();

    // ── Bee ──
    this._bee = this.physics.add.image(BEE_X, height / 2, 'bee');
    this._bee.setCollideWorldBounds(true);
    this._bee.setDepth(10);
    this._bee.body.setSize(
      this._bee.width  * 0.65,
      this._bee.height * 0.65,
    );

    // Wing-flap tween
    this._wingTween = this.tweens.add({
      targets:  this._bee,
      scaleX:   { from: 1.0, to: 0.75 },
      duration: 120,
      yoyo:     true,
      repeat:   -1,
      ease:     'Sine.easeInOut',
    });

    // ── Collisions ──
    this.physics.add.overlap(this._bee, this._walls,   this._onBeeHitWall,   null, this);
    this.physics.add.overlap(this._bee, this._coins,   this._onBeeHitCoin,   null, this);
    this.physics.add.overlap(this._bee, this._bubbles, this._onBeeHitBubble, null, this);

    // ── Lives HUD (top-left bee icons) ──
    this._buildLivesHUD();

    // ── Score HUD (top-right digit sprites) ──
    this._buildScoreHUD(width);

    // ── Level label (top-center) ──
    this.add
      .text(width / 2, 10, `Level ${GameState.currentLevel}`, {
        fontFamily: 'Arial Black, sans-serif',
        fontSize:   '12px',
        color:      '#FFD700',
        stroke:     '#000',
        strokeThickness: 2,
      })
      .setOrigin(0.5, 0)
      .setDepth(25);

    // ── Ready text ──
    this._readyTxt = this.add
      .text(width / 2, height / 2 - 40, 'Tap  /  Press Space to start', {
        fontFamily: 'Arial, sans-serif',
        fontSize:   '16px',
        color:      '#FFD700',
        stroke:     '#000',
        strokeThickness: 3,
        align:      'center',
      })
      .setOrigin(0.5)
      .setDepth(20);

    this.tweens.add({
      targets:  this._readyTxt,
      alpha:    0.2,
      duration: 700,
      yoyo:     true,
      repeat:   -1,
    });

    // ── Paused label ──
    this._pausedLabel = this.add
      .text(width / 2, height / 2, '🐝 Bee is resting.\nTap or press Space to continue', {
        fontFamily: 'Arial Black, sans-serif',
        fontSize:   '18px',
        color:      '#FFD700',
        stroke:     '#222',
        strokeThickness: 4,
        align:      'center',
      })
      .setOrigin(0.5)
      .setDepth(30)
      .setVisible(false);

    // ── Game Over overlay ("Level Failed") ──
    this._gameOverGroup = this.add.container(0, 0).setDepth(30);

    const goBg = this.add.rectangle(width / 2, height / 2, 340, 120, 0x000000, 0.72);
    const goTxt = this.add
      .text(width / 2, height / 2 - 20, 'Level Failed!', {
        fontFamily: 'Arial Black, sans-serif',
        fontSize:   '26px',
        color:      '#FF4444',
        stroke:     '#000',
        strokeThickness: 4,
        align:      'center',
      })
      .setOrigin(0.5);
    const goSubTxt = this.add
      .text(width / 2, height / 2 + 20, 'Tap to retry', {
        fontFamily: 'Arial, sans-serif',
        fontSize:   '16px',
        color:      '#ffffff',
        stroke:     '#000',
        strokeThickness: 3,
        align:      'center',
      })
      .setOrigin(0.5);

    this._gameOverGroup.add([goBg, goTxt, goSubTxt]);
    this._gameOverGroup.setVisible(false);

    // ── Level Complete overlay ──
    this._levelCompleteGroup = this.add.container(0, 0).setDepth(30);

    const lcBg = this.add.rectangle(width / 2, height / 2, 360, 120, 0x000000, 0.72);
    const lcTxt = this.add
      .text(width / 2, height / 2 - 22, 'Level Complete! 🎉', {
        fontFamily: 'Arial Black, sans-serif',
        fontSize:   '24px',
        color:      '#00FF88',
        stroke:     '#000',
        strokeThickness: 4,
        align:      'center',
      })
      .setOrigin(0.5);
    const lcSubTxt = this.add
      .text(width / 2, height / 2 + 20, 'Tap to continue', {
        fontFamily: 'Arial, sans-serif',
        fontSize:   '16px',
        color:      '#ffffff',
        stroke:     '#000',
        strokeThickness: 3,
        align:      'center',
      })
      .setOrigin(0.5);

    this._levelCompleteGroup.add([lcBg, lcTxt, lcSubTxt]);
    this._levelCompleteGroup.setVisible(false);

    // ── Input ──
    this._cursors  = this.input.keyboard.createCursorKeys();
    this._spaceKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

    this.input.on('pointerdown', this._onTap, this);

    this._setupTiltControl();

    // ── Fade in ──
    this.cameras.main.fadeIn(400, 0, 0, 0);

    this._finishX = this._levelData.length ?? 5000;
  }

  // ─── Lives HUD ─────────────────────────────────────────────────────────────

  _buildLivesHUD() {
    // Two small bee icons at top-left (24px each, spaced 28px apart)
    this._lifeIcons = [];
    const startX = 8;
    const y      = 10;
    const iconW  = 24;
    const gap    = 28;

    for (let i = 0; i < GameState.lives; i++) {
      const icon = this.add.image(startX + i * gap, y, 'bee')
        .setOrigin(0, 0)
        .setDisplaySize(iconW, iconW)
        .setDepth(25);
      this._lifeIcons.push(icon);
    }
  }

  _removeOneLifeIcon() {
    const icon = this._lifeIcons.pop();
    if (icon) icon.destroy();
  }

  // ─── Level Builder ─────────────────────────────────────────────────────────

  _buildLevel() {
    (this._levelData.obstacles || []).forEach((obs) => {
      switch (obs.type) {
        case 'wall':     this._spawnWall(obs);     break;
        case 'wallPair': this._spawnWallPair(obs); break;
        case 'coin':     this._spawnCoin(obs);     break;
        case 'bubble':   this._spawnBubble(obs);   break;
      }
    });
  }

  _spawnWall(obs) {
    const w = this.add.image(obs.x, obs.y, 'wall');
    w.setDisplaySize(obs.width, obs.height);
    w.setDepth(5);
    this.physics.add.existing(w, true);
    this._walls.add(w);
    this._world.add(w);
  }

  /**
   * wallPair — creates top wall (ceiling → gapY) and bottom wall (gapY+gapHeight → canvas bottom).
   * gapY is the top of the opening.
   */
  _spawnWallPair(obs) {
    const wallWidth = obs.width || 20;
    const gapTop    = obs.gapY;                      // top of opening
    const gapBot    = obs.gapY + obs.gapHeight;      // bottom of opening
    const canvasH   = CANVAS_HEIGHT;

    // Top wall — from y=0 to y=gapTop
    const topH = gapTop;
    if (topH > 0) {
      const topW = this.add.image(obs.x, topH / 2, 'wall');
      topW.setDisplaySize(wallWidth, topH);
      topW.setDepth(5);
      this.physics.add.existing(topW, true);
      this._walls.add(topW);
      this._world.add(topW);
    }

    // Bottom wall — from y=gapBot to y=canvasH
    const botH = canvasH - gapBot;
    if (botH > 0) {
      const botY = gapBot + botH / 2;
      const botW = this.add.image(obs.x, botY, 'wall');
      botW.setDisplaySize(wallWidth, botH);
      botW.setDepth(5);
      this.physics.add.existing(botW, true);
      this._walls.add(botW);
      this._world.add(botW);
    }
  }

  _spawnCoin(obs) {
    const coin = this.physics.add.staticImage(obs.x, obs.y, 'coin');
    coin.setDisplaySize(28, 32);
    coin.setDepth(6);
    coin.refreshBody();
    coin._points = obs.points || 10;

    const t = this.tweens.add({
      targets:  coin,
      y:        obs.y + 6,
      duration: 800 + Math.random() * 300,
      yoyo:     true,
      repeat:   -1,
      ease:     'Sine.easeInOut',
    });
    this._coinTweens.push(t);

    this.tweens.add({
      targets: coin,
      scaleX:  1.15,
      scaleY:  1.15,
      duration: 600,
      yoyo:    true,
      repeat:  -1,
      ease:    'Sine.easeInOut',
    });

    this._coins.add(coin);
    this._world.add(coin);
  }

  _spawnBubble(obs) {
    const bubble = this.physics.add.staticImage(obs.x, obs.y, 'bubble');
    bubble.setDisplaySize(50, 50);
    bubble.setDepth(6);
    bubble.refreshBody();

    const t = this.tweens.add({
      targets:  bubble,
      y:        obs.y - 8,
      duration: 1400,
      yoyo:     true,
      repeat:   -1,
      ease:     'Sine.easeInOut',
    });
    this._bubbleTweens.push(t);

    this.tweens.add({
      targets:  bubble,
      alpha:    0.75,
      duration: 1000,
      yoyo:     true,
      repeat:   -1,
      ease:     'Sine.easeInOut',
    });

    this._bubbles.add(bubble);
    this._world.add(bubble);
  }

  // ─── Score HUD — Digit Sprites ─────────────────────────────────────────────

  _buildScoreHUD(width) {
    this._digitImages = [];
    const maxDigits = 6;
    for (let i = 0; i < maxDigits; i++) {
      const img = this.add.image(0, 12, 'digit_0')
        .setOrigin(0, 0)
        .setDepth(25)
        .setVisible(false)
        .setScale(0.9);
      this._digitImages.push(img);
    }
    this._updateScoreHUD(width);
  }

  _updateScoreHUD(width) {
    const w     = width || this.scale.width;
    const str   = String(this._score);
    const total = this._digitImages.length;
    const n     = str.length;
    const rightEdge = w - 6;

    for (let i = 0; i < total; i++) {
      const img  = this._digitImages[i];
      const pos  = total - 1 - i;
      const cIdx = n - 1 - pos;

      if (cIdx < 0) {
        img.setVisible(false);
      } else {
        const digit = parseInt(str[cIdx], 10);
        img.setTexture(`digit_${digit}`);
        img.setX(rightEdge - (pos + 1) * DIGIT_SPACING);
        img.setVisible(true);
      }
    }
  }

  // ─── Floating Text Popup ───────────────────────────────────────────────────

  _spawnFloatingText(x, y, text) {
    const screenX = x + this._world.x;
    const screenY = y;

    const txt = this.add
      .text(screenX, screenY, text, {
        fontFamily: 'Arial Black, sans-serif',
        fontSize:   '14px',
        color:      '#FFD700',
        stroke:     '#000',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(50);

    this.tweens.add({
      targets:  txt,
      y:        screenY - 40,
      alpha:    0,
      duration: 900,
      ease:     'Power2',
      onComplete: () => txt.destroy(),
    });
  }

  // ─── Tilt / Orientation Control ────────────────────────────────────────────

  _setupTiltControl() {
    if (typeof window !== 'undefined' && 'DeviceOrientationEvent' in window) {
      this._orientationHandler = (event) => {
        if (this._state !== STATE.PLAYING) return;
        const beta = event.beta;
        if (beta === null) return;
        if (this._tiltStartBeta === null) this._tiltStartBeta = beta;
        const { height } = this.scale;
        let delta = Phaser.Math.Clamp(beta - this._tiltStartBeta, -10, 10);
        const targetY = height / 2 - 16 * delta;
        this._bee.y = Phaser.Math.Clamp(targetY, 0, height);
      };
      window.addEventListener('deviceorientation', this._orientationHandler);

      if (
        typeof DeviceOrientationEvent !== 'undefined' &&
        typeof DeviceOrientationEvent.requestPermission === 'function'
      ) {
        this._needsOrientationPermission = true;
      }
    }
  }

  _requestOrientationPermission() {
    if (this._needsOrientationPermission) {
      DeviceOrientationEvent.requestPermission()
        .then((s) => { if (s !== 'granted') console.warn('Orientation denied'); })
        .catch(console.error);
      this._needsOrientationPermission = false;
    }
  }

  // ─── Input Handlers ────────────────────────────────────────────────────────

  _onTap() {
    this._requestOrientationPermission();

    switch (this._state) {
      case STATE.READY:
        this._startGame();
        break;
      case STATE.PAUSED:
        this._resumeGame();
        break;
      case STATE.GAME_OVER:
        this._retryLevel();
        break;
      case STATE.LEVEL_COMPLETE:
        this._advanceLevel();
        break;
      // DYING — ignore taps while bee is flashing
    }
  }

  _onBeeHitWall(bee, wall) {
    if (this._state !== STATE.PLAYING) return;
    this._triggerDeath();
  }

  _onBeeHitCoin(bee, coin) {
    if (this._state !== STATE.PLAYING) return;

    const pts = coin._points || 10;

    this._coinTweens = this._coinTweens.filter((t) => {
      if (t.targets && t.targets.includes(coin)) {
        t.stop();
        return false;
      }
      return true;
    });

    this._spawnFloatingText(coin.x, coin.y, `+${pts}`);
    this._coins.remove(coin, true, true);
    this._score += pts;
  }

  _onBeeHitBubble(bee, bubble) {
    if (this._state !== STATE.PLAYING) return;

    this._state = STATE.PAUSED;
    bubble.body.enable = false;
    this._pausedLabel.setVisible(true);
  }

  // ─── State Transitions ─────────────────────────────────────────────────────

  _startGame() {
    this._state         = STATE.PLAYING;
    this._tiltStartBeta = null;
    this._score         = 0;
    this._worldOffset   = 0;
    this._readyTxt.setVisible(false);
  }

  _resumeGame() {
    this._state = STATE.PLAYING;
    this._pausedLabel.setVisible(false);
  }

  /**
   * Bee hit a wall:
   *   1. Enter DYING state (prevents re-triggers & input)
   *   2. Flash the bee 3x, then fade out
   *   3. Decrement GameState.lives — remove one life icon from HUD
   *   4a. lives > 0 → respawn bee at start; resume PLAYING
   *   4b. lives = 0 → show "Level Failed" overlay → GAME_OVER
   */
  _triggerDeath() {
    if (this._state === STATE.DYING || this._state === STATE.GAME_OVER) return;
    this._state = STATE.DYING;

    // Disable bee physics while dying
    this._bee.body.enable = false;
    if (this._wingTween) this._wingTween.pause();

    this.tweens.add({
      targets:  this._bee,
      alpha:    0,
      duration: 150,
      yoyo:     true,
      repeat:   4,   // 5 flashes total
      ease:     'Linear',
      onComplete: () => {
        // Decrement lives
        GameState.lives = Math.max(0, GameState.lives - 1);
        this._removeOneLifeIcon();

        if (GameState.lives > 0) {
          // Respawn bee
          const { height } = this.scale;
          this._bee.setPosition(BEE_X, height / 2);
          this._bee.setAlpha(1);
          this._bee.body.enable = true;
          if (this._wingTween) this._wingTween.resume();
          this._state = STATE.PLAYING;
        } else {
          // No lives left → Game Over
          this._bee.setAlpha(0.3);
          this._state = STATE.GAME_OVER;
          this._gameOverGroup.setVisible(true);
        }
      },
    });
  }

  _triggerLevelComplete() {
    this._state = STATE.LEVEL_COMPLETE;
    this._levelCompleteGroup.setVisible(true);
  }

  /**
   * Retry current level — resets lives to 2, restarts scene.
   */
  _retryLevel() {
    GameState.retryLevel();
    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this._cleanup();
      this.scene.restart();
    });
  }

  /**
   * Level complete — advance or win.
   */
  _advanceLevel() {
    GameState.advanceLevel(this._score);

    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this._cleanup();

      if (GameState.currentLevel > MAX_LEVELS) {
        // All levels done → Win screen
        this.scene.start('WinScene', { totalScore: GameState.totalScore });
      } else {
        // Next level
        this.scene.restart();
      }
    });
  }

  _goToMenu() {
    GameState.reset();
    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this._cleanup();
      this.scene.start('MenuScene');
    });
  }

  _cleanup() {
    if (this._orientationHandler) {
      window.removeEventListener('deviceorientation', this._orientationHandler);
      this._orientationHandler = null;
    }
  }

  // ─── Main Update Loop ──────────────────────────────────────────────────────

  update() {
    const { height, width } = this.scale;

    // Space bar: start or resume
    if (Phaser.Input.Keyboard.JustDown(this._spaceKey)) {
      if (this._state === STATE.READY)  { this._startGame();  return; }
      if (this._state === STATE.PAUSED) { this._resumeGame(); return; }
    }

    if (this._state !== STATE.PLAYING) return;

    // ── Scroll backgrounds (parallax) ──
    this._bgTile.tilePositionX    += this._scrollSpeed * 0.8;
    this._cloudTile.tilePositionX += this._scrollSpeed * 0.4;

    // ── Scroll world container ──
    this._world.x     -= this._scrollSpeed;
    this._worldOffset += this._scrollSpeed;

    // ── Check finish line (5000px or level length) ──
    if (this._worldOffset >= this._finishX) {
      this._triggerLevelComplete();
      return;
    }

    // ── Keyboard: vertical movement ──
    if (this._cursors.up.isDown) {
      this._bee.y = Phaser.Math.Clamp(
        this._bee.y - VERT_SPEED,
        this._bee.displayHeight / 2,
        height - this._bee.displayHeight / 2,
      );
    } else if (this._cursors.down.isDown) {
      this._bee.y = Phaser.Math.Clamp(
        this._bee.y + VERT_SPEED,
        this._bee.displayHeight / 2,
        height - this._bee.displayHeight / 2,
      );
    }

    // Always clamp
    this._bee.y = Phaser.Math.Clamp(
      this._bee.y,
      this._bee.displayHeight / 2,
      height - this._bee.displayHeight / 2,
    );

    // ── Bee tilt wobble ──
    const tiltAngle = Math.sin(this.time.now / 250) * 4;
    this._bee.setAngle(tiltAngle);

    // ── Update score HUD ──
    this._updateScoreHUD(width);
  }

  // ─── Scene Lifecycle ───────────────────────────────────────────────────────

  shutdown() {
    this._cleanup();
  }
}
