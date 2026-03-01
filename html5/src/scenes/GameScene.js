/**
 * GameScene — Phase 2 (Coins, Bubbles, Level Data & Polish)
 *
 * Ported from GameMechanics.lua (Corona SDK → Phaser 3).
 *
 * State machine:
 *   READY          — waiting for tap/space; world is static
 *   PLAYING        — world scrolls left, bee controllable
 *   PAUSED         — hit a bubble; tap/space to resume
 *   LEVEL_COMPLETE — reached the finish line
 *   GAME_OVER      — bee hit a wall
 *
 * Controls:
 *   Desktop : UP / DOWN arrow keys (continuous, clamped to screen)
 *   Mobile  : DeviceOrientationEvent beta (forward tilt → move up)
 *
 * Level data is loaded from src/data/level1.json (imported as JS module).
 * All sprites come from html5/public/assets/.
 *
 * Phase 2 additions:
 *   • JSON-driven obstacles (walls, coins, bubbles)
 *   • Coins: monster.png sprite, bob tween, +10 floating popup, score sum
 *   • Bubbles: pause mechanic matching original (state=PAUSED, tap to resume)
 *   • Bee: wing-flap scaleY tween + gentle tilt wobble
 *   • Score HUD: digit-sprite images (0.png–9.png) rendered top-right
 */

import level1Data from '../data/level1.json';

const SCROLL_SPEED   = 2;   // px per frame (original: speed = 2)
const BEE_X          = 120; // fixed horizontal position
const VERT_SPEED     = 4;   // px per frame keyboard control
const DIGIT_SPACING  = 18;  // px between score digit sprites

// State enum
const STATE = {
  READY:          'READY',
  PLAYING:        'PLAYING',
  PAUSED:         'PAUSED',
  LEVEL_COMPLETE: 'LEVEL_COMPLETE',
  GAME_OVER:      'GAME_OVER',
};

export class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' });
    this._state = STATE.READY;
    this._tiltStartBeta       = null;
    this._orientationHandler  = null;
    this._digitImages         = [];   // HUD digit sprites
    this._coinTweens          = [];   // track bob tweens for cleanup
    this._bubbleTweens        = [];
  }

  // ─── Asset Loading ────────────────────────────────────────────────────────

  preload() {
    // Backgrounds
    this.load.image('bg',     'assets/thumb_Background.png');
    this.load.image('cloud',  'assets/thumb_Cloud.png');

    // Sprites
    this.load.image('bee',    'assets/thumb_Bee.png');
    this.load.image('wall',   'assets/wall.png');
    this.load.image('coin',   'assets/monster.png');   // monster.png = coin in original
    this.load.image('bubble', 'assets/thumb_Bubble.png');

    // Digit sprites for score display
    for (let d = 0; d <= 9; d++) {
      this.load.image(`digit_${d}`, `assets/${d}.png`);
    }
  }

  // ─── Scene Creation ────────────────────────────────────────────────────────

  create() {
    const { width, height } = this.scale;

    this._state         = STATE.READY;
    this._score         = 0;
    this._worldOffset   = 0;
    this._tiltStartBeta = null;
    this._coinTweens    = [];
    this._bubbleTweens  = [];

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

    // Wing-flap tween (scaleX oscillates to simulate wing beat)
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

    // ── Score HUD — digit sprites (top-right) ──
    this._buildScoreHUD(width);

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

    // ── Game Over overlay ──
    this._gameOverTxt = this.add
      .text(width / 2, height / 2, 'You hit a wall!\nTap to retry', {
        fontFamily: 'Arial Black, sans-serif',
        fontSize:   '22px',
        color:      '#FF4444',
        stroke:     '#000',
        strokeThickness: 4,
        align:      'center',
      })
      .setOrigin(0.5)
      .setDepth(30)
      .setVisible(false);

    // ── Level Complete overlay ──
    this._levelCompleteTxt = this.add
      .text(width / 2, height / 2, '🎉 Level Complete!\nTap to return to menu', {
        fontFamily: 'Arial Black, sans-serif',
        fontSize:   '22px',
        color:      '#00FF88',
        stroke:     '#000',
        strokeThickness: 4,
        align:      'center',
      })
      .setOrigin(0.5)
      .setDepth(30)
      .setVisible(false);

    // ── Input ──
    this._cursors  = this.input.keyboard.createCursorKeys();
    this._spaceKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

    this.input.on('pointerdown', this._onTap, this);

    this._setupTiltControl();

    // ── Fade in ──
    this.cameras.main.fadeIn(400, 0, 0, 0);

    this._finishX = level1Data.length;
  }

  // ─── Level Builder ─────────────────────────────────────────────────────────

  _buildLevel() {
    level1Data.obstacles.forEach((obs) => {
      if (obs.type === 'wall')   this._spawnWall(obs);
      if (obs.type === 'coin')   this._spawnCoin(obs);
      if (obs.type === 'bubble') this._spawnBubble(obs);
    });
  }

  _spawnWall(obs) {
    const w   = this.add.image(obs.x, obs.y, 'wall');
    w.setDisplaySize(obs.width, obs.height);
    w.setDepth(5);
    this.physics.add.existing(w, true);
    this._walls.add(w);
    this._world.add(w);
  }

  _spawnCoin(obs) {
    // Use monster.png (the coin sprite from the original)
    const coin = this.physics.add.staticImage(obs.x, obs.y, 'coin');
    coin.setDisplaySize(28, 32);
    coin.setDepth(6);
    coin.refreshBody();
    coin._points = obs.points || 10;

    // Gentle bob tween
    const t = this.tweens.add({
      targets:  coin,
      y:        obs.y + 6,
      duration: 800 + Math.random() * 300,
      yoyo:     true,
      repeat:   -1,
      ease:     'Sine.easeInOut',
    });
    this._coinTweens.push(t);

    // Scale pulse
    this.tweens.add({
      targets:  coin,
      scaleX:   1.15,
      scaleY:   1.15,
      duration: 600,
      yoyo:     true,
      repeat:   -1,
      ease:     'Sine.easeInOut',
    });

    this._coins.add(coin);
    this._world.add(coin);
  }

  _spawnBubble(obs) {
    const bubble = this.physics.add.staticImage(obs.x, obs.y, 'bubble');
    bubble.setDisplaySize(50, 50);
    bubble.setDepth(6);
    bubble.refreshBody();

    // Slow float animation
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
    // We'll maintain up to 6 digit images, right-aligned
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

    // Right-align: place last digit at rightmost
    const rightEdge = w - 6;

    for (let i = 0; i < total; i++) {
      const img = this._digitImages[i];
      const pos = total - 1 - i; // distance from right
      const charIdx = n - 1 - pos;

      if (charIdx < 0) {
        img.setVisible(false);
      } else {
        const digit = parseInt(str[charIdx], 10);
        img.setTexture(`digit_${digit}`);
        img.setX(rightEdge - (pos + 1) * DIGIT_SPACING);
        img.setVisible(true);
      }
    }
  }

  // ─── Floating Text Popup ───────────────────────────────────────────────────

  _spawnFloatingText(x, y, text) {
    // worldX → screen X: add world container's current X
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
        this._restartGame();
        break;
      case STATE.LEVEL_COMPLETE:
        this._goToMenu();
        break;
    }
  }

  _onBeeHitWall(bee, wall) {
    if (this._state !== STATE.PLAYING) return;
    this._triggerGameOver();
  }

  /**
   * Coin collision — mirrors original:
   *   moveGroup:remove(object)
   *   score.setScore(score.getScore() + object.points)
   */
  _onBeeHitCoin(bee, coin) {
    if (this._state !== STATE.PLAYING) return;

    const pts = coin._points || 10;

    // Stop bob tween so it doesn't try to animate a destroyed object
    this._coinTweens = this._coinTweens.filter((t) => {
      if (t.targets && t.targets.includes(coin)) {
        t.stop();
        return false;
      }
      return true;
    });

    // Floating "+10" text at world-relative position
    this._spawnFloatingText(coin.x, coin.y, `+${pts}`);

    // Remove from group and destroy
    this._coins.remove(coin, true, true);

    // Add to score
    this._score += pts;
  }

  /**
   * Bubble collision — mirrors original:
   *   object.isBodyActive = false
   *   speed = 0
   *   state = 2 (PAUSED)
   *   pausedLabel.alpha = 1
   */
  _onBeeHitBubble(bee, bubble) {
    if (this._state !== STATE.PLAYING) return;

    this._state = STATE.PAUSED;

    // Disable bubble body so we don't keep firing
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
    // Mirrors original: tap after bubble pause → state = PLAYING
    this._state = STATE.PLAYING;
    this._pausedLabel.setVisible(false);
  }

  _triggerGameOver() {
    if (this._state === STATE.GAME_OVER) return;
    this._state = STATE.GAME_OVER;

    this.tweens.add({
      targets:  this._bee,
      alpha:    0,
      duration: 200,
      yoyo:     true,
      repeat:   2,
      onComplete: () => { this._gameOverTxt.setVisible(true); },
    });
  }

  _triggerLevelComplete() {
    this._state = STATE.LEVEL_COMPLETE;
    this._levelCompleteTxt.setVisible(true);
  }

  _restartGame() {
    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this._cleanup();
      this.scene.restart();
    });
  }

  _goToMenu() {
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
    this._bgTile.tilePositionX    += SCROLL_SPEED * 0.8;
    this._cloudTile.tilePositionX += SCROLL_SPEED * 0.4;

    // ── Scroll world container ──
    this._world.x     -= SCROLL_SPEED;
    this._worldOffset += SCROLL_SPEED;

    // ── Check finish line ──
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

    // ── Bee tilt wobble (slight rotation while flying) ──
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
