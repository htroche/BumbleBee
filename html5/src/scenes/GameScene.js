/**
 * GameScene — Collision Fix + Cartoon Background
 */

import level1Data from '../data/level1.json';
import level2Data from '../data/level2.json';
import level3Data from '../data/level3.json';
import { GameState }    from '../GameState.js';
import { HighScore }    from '../utils/HighScore.js';
import { SoundManager } from '../utils/SoundManager.js';
import { unlockLevel }  from '../utils/LevelUnlock.js';

const LEVEL_DATA  = [null, level1Data, level2Data, level3Data];
const BEE_X       = 120;
const VERT_SPEED  = 4;
const MAX_LEVELS  = 3;
const CANVAS_H    = 320;
const CANVAS_W    = 480;

const STATE = {
  READY:          'READY',
  PLAYING:        'PLAYING',
  PAUSED:         'PAUSED',
  DYING:          'DYING',
  LEVEL_COMPLETE: 'LEVEL_COMPLETE',
  GAME_OVER:      'GAME_OVER',
};

export class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' });
  }

  preload() {
    this.load.image('bee',    'assets/thumb_Bee.png');
    this.load.image('wall',   'assets/wall.png');
    this.load.image('bubble', 'assets/thumb_Bubble.png');
    for (let d = 0; d <= 9; d++) {
      this.load.image(`digit_${d}`, `assets/${d}.png`);
    }
  }

  create() {
    const { width, height } = this.scale;

    this._levelData   = LEVEL_DATA[GameState.currentLevel] ?? level1Data;
    this._scrollSpeed = this._levelData.scrollSpeed ?? 2;
    this._state       = STATE.READY;
    this._score       = 0;
    this._worldOffset = 0;
    this._lifeIcons   = [];
    this._walls       = [];   // plain arrays — no container
    this._coins       = [];
    this._bubbles     = [];
    this._tiltStartBeta      = null;
    this._orientationHandler = null;
    this._tiltAvailable      = false;
    this._touchDirection     = 0;
    this._invincible         = false;

    // Generate coin particle texture
    if (!this.textures.exists('coin_particle')) {
      const g = this.make.graphics({ add: false });
      g.fillStyle(0xFFD700, 1);
      g.fillCircle(8, 8, 8);
      g.generateTexture('coin_particle', 16, 16);
      g.destroy();
    }

    // ── CARTOON BACKGROUND ──
    this._buildCartoonBackground();

    // ── Physics groups ──
    this._wallGroup   = this.physics.add.staticGroup();
    this._coinGroup   = this.physics.add.staticGroup();
    this._bubbleGroup = this.physics.add.staticGroup();

    // ── Build level ──
    this._buildLevel();

    // ── Bee ──
    this._bee = this.physics.add.image(BEE_X, height / 2, 'bee');
    this._bee.setCollideWorldBounds(true);
    this._bee.setDepth(10);
    this._bee.body.setSize(this._bee.width * 0.6, this._bee.height * 0.6);

    this._wingTween = this.tweens.add({
      targets: this._bee, scaleX: { from: 1.0, to: 0.75 },
      duration: 120, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });

    // ── Colliders — use overlap so we control the response ──
    this.physics.add.overlap(this._bee, this._wallGroup,   this._onHitWall,   null, this);
    this.physics.add.overlap(this._bee, this._coinGroup,   this._onHitCoin,   null, this);
    this.physics.add.overlap(this._bee, this._bubbleGroup, this._onHitBubble, null, this);

    // ── HUD ──
    this._buildLivesHUD();
    this._buildScoreHUD(width);

    this.add.text(width / 2, 10, `Level ${GameState.currentLevel}`, {
      fontFamily: 'Arial Black', fontSize: '12px',
      color: '#FFD700', stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5, 0).setDepth(25);

    // ── Overlays ──
    this._readyTxt = this.add.text(width / 2, height / 2 - 40, 'Tap / Press Space to start', {
      fontFamily: 'Arial', fontSize: '16px', color: '#FFD700',
      stroke: '#000', strokeThickness: 3, align: 'center',
    }).setOrigin(0.5).setDepth(20);
    this.tweens.add({ targets: this._readyTxt, alpha: 0.2, duration: 700, yoyo: true, repeat: -1 });

    this._pausedLabel = this.add.text(width / 2, height / 2, '🐝 Bee resting.\nTap or Space to continue', {
      fontFamily: 'Arial Black', fontSize: '18px', color: '#FFD700',
      stroke: '#222', strokeThickness: 4, align: 'center',
    }).setOrigin(0.5).setDepth(30).setVisible(false);

    this._gameOverGroup = this._buildOverlay(width, height,
      'Level Failed!', '#FF4444', 'Tap to retry');

    this._levelCompleteGroup = this._buildOverlay(width, height,
      'Level Complete! 🎉', '#00FF88', 'Tap to continue');

    // ── Input ──
    this._cursors  = this.input.keyboard.createCursorKeys();
    this._spaceKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.input.on('pointerdown', this._onTap, this);

    this._setupTilt();
    this._setupTouchZones(width, height);

    this.cameras.main.fadeIn(400, 0, 0, 0);
    this._finishX = this._levelData.length ?? 5000;
  }

  // ─── CARTOON BACKGROUND ──────────────────────────────────────────────────

  _buildCartoonBackground() {
    const W = CANVAS_W;
    const H = CANVAS_H;
    const groundY = H - 40; // where ground starts

    // 1. Sky gradient (draw as two rectangles blended)
    const sky = this.add.graphics().setDepth(0);
    sky.fillGradientStyle(0x87CEEB, 0x87CEEB, 0xFFF8DC, 0xFFF8DC, 1);
    sky.fillRect(0, 0, W, H);

    // 2. Back hills (slow parallax) — stored as tileSprite-equivalent using graphics texture
    // Generate a back-hills texture
    if (!this.textures.exists('hills_back')) {
      const g = this.make.graphics({ add: false });
      g.fillStyle(0x90C060, 1); // light green
      // Draw several bumps
      const hillW = 320;
      const hillH = 120;
      for (let i = 0; i < 4; i++) {
        g.fillEllipse(i * 110 + 60, hillH, 180, hillH * 1.6);
      }
      g.generateTexture('hills_back', hillW * 2, hillH);
      g.destroy();
    }
    this._hillsBack = this.add.tileSprite(0, groundY - 60, CANVAS_W, 120, 'hills_back')
      .setOrigin(0, 0).setDepth(1);

    // 3. Mid hills
    if (!this.textures.exists('hills_mid')) {
      const g = this.make.graphics({ add: false });
      g.fillStyle(0x5DA032, 1); // darker green
      for (let i = 0; i < 5; i++) {
        g.fillEllipse(i * 80 + 40, 80, 130, 100);
      }
      g.generateTexture('hills_mid', 480, 80);
      g.destroy();
    }
    this._hillsMid = this.add.tileSprite(0, groundY - 20, CANVAS_W, 80, 'hills_mid')
      .setOrigin(0, 0).setDepth(2);

    // 4. Ground strip
    const ground = this.add.graphics().setDepth(3);
    ground.fillStyle(0x4A8C23, 1);
    ground.fillRect(0, groundY, W, H - groundY);
    ground.lineStyle(3, 0x2D5A14, 1);
    ground.lineBetween(0, groundY, W, groundY);

    // 5. Clouds — generate cloud texture
    if (!this.textures.exists('cloud_cartoon')) {
      const g = this.make.graphics({ add: false });
      g.fillStyle(0xFFFFFF, 0.92);
      g.fillCircle(40, 30, 28);
      g.fillCircle(70, 22, 22);
      g.fillCircle(100, 28, 25);
      g.fillCircle(60, 44, 20);
      g.fillCircle(80, 44, 22);
      g.generateTexture('cloud_cartoon', 140, 60);
      g.destroy();
    }
    this._cloudTile = this.add.tileSprite(0, 20, CANVAS_W, 60, 'cloud_cartoon')
      .setOrigin(0, 0).setDepth(4).setAlpha(0.85);

    // 6. Flowers row — generate flower texture
    if (!this.textures.exists('flowers')) {
      const g = this.make.graphics({ add: false });
      const colors = [0xFF3366, 0xFFDD00, 0xFF88CC, 0xFF5500];
      for (let i = 0; i < 6; i++) {
        const fx = i * 40 + 15;
        g.fillStyle(0x3A7D14, 1);
        g.fillRect(fx, 10, 3, 18); // stem
        g.fillStyle(colors[i % colors.length], 1);
        g.fillCircle(fx + 1, 10, 7); // bloom
        g.fillStyle(0xFFFFFF, 0.6);
        g.fillCircle(fx + 1, 10, 3); // highlight
      }
      g.generateTexture('flowers', 240, 28);
      g.destroy();
    }
    this._flowersTile = this.add.tileSprite(0, groundY - 10, CANVAS_W, 28, 'flowers')
      .setOrigin(0, 0).setDepth(5);
  }

  // ─── LEVEL BUILDER ───────────────────────────────────────────────────────

  _buildLevel() {
    (this._levelData.obstacles || []).forEach(obs => {
      switch (obs.type) {
        case 'wall':     this._spawnWall(obs.x, obs.y, obs.width || 20, obs.height || 60); break;
        case 'wallPair': this._spawnWallPair(obs); break;
        case 'coin':     this._spawnCoin(obs); break;
        case 'bubble':   this._spawnBubble(obs); break;
      }
    });
  }

  _spawnWall(x, y, w, h) {
    const img = this.add.image(x, y, 'wall').setDisplaySize(w, h).setDepth(5);
    this.physics.add.existing(img, true); // static body
    this._wallGroup.add(img);
    this._walls.push(img);
  }

  _spawnWallPair(obs) {
    const ww     = obs.width || 20;
    const gapTop = obs.gapY;
    const gapBot = obs.gapY + obs.gapHeight;
    if (gapTop > 0) {
      this._spawnWall(obs.x, gapTop / 2, ww, gapTop);
    }
    const botH = CANVAS_H - gapBot;
    if (botH > 0) {
      this._spawnWall(obs.x, gapBot + botH / 2, ww, botH);
    }
  }

  _spawnCoin(obs) {
    // Draw a coin as a yellow circle graphic — no sprite needed
    const g = this.add.graphics().setDepth(6);
    g.fillStyle(0xFFD700, 1);
    g.lineStyle(2, 0xB8860B, 1);
    g.fillCircle(0, 0, 12);
    g.strokeCircle(0, 0, 12);
    g.fillStyle(0xFFF8DC, 1);
    g.fillCircle(-2, -3, 5); // shine
    g.x = obs.x;
    g.y = obs.y;

    // Give it a physics body using an invisible static image
    const body = this.physics.add.staticImage(obs.x, obs.y, '__DEFAULT').setAlpha(0);
    body.body.setSize(24, 24);
    body.refreshBody();
    body._graphic = g;
    body._points  = obs.points || 10;

    this.tweens.add({ targets: [g, body], y: obs.y + 6, duration: 800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    this._coinGroup.add(body);
    this._coins.push({ body, graphic: g, startX: obs.x });
  }

  _spawnBubble(obs) {
    const bubble = this.physics.add.staticImage(obs.x, obs.y, 'bubble')
      .setDisplaySize(50, 50).setDepth(6);
    bubble.refreshBody();
    this.tweens.add({ targets: bubble, y: obs.y - 8, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.tweens.add({ targets: bubble, alpha: 0.75, duration: 1000, yoyo: true, repeat: -1 });
    this._bubbleGroup.add(bubble);
    this._bubbles.push({ body: bubble, startX: obs.x });
  }

  // ─── SCROLL OBSTACLES (KEY FIX) ──────────────────────────────────────────

  _scrollObstacles() {
    const spd = this._scrollSpeed;

    // Walls
    for (let i = this._walls.length - 1; i >= 0; i--) {
      const w = this._walls[i];
      w.x -= spd;
      w.body.reset(w.x, w.y); // sync static body to new position
      if (w.x < -100) {
        this._wallGroup.remove(w, true, true);
        this._walls.splice(i, 1);
      }
    }

    // Coins
    for (let i = this._coins.length - 1; i >= 0; i--) {
      const c = this._coins[i];
      c.body.x -= spd;
      c.body.body.reset(c.body.x, c.body.y);
      c.graphic.x = c.body.x;
      if (c.body.x < -50) {
        c.graphic.destroy();
        this._coinGroup.remove(c.body, true, true);
        this._coins.splice(i, 1);
      }
    }

    // Bubbles
    for (let i = this._bubbles.length - 1; i >= 0; i--) {
      const b = this._bubbles[i];
      b.body.x -= spd;
      b.body.body.reset(b.body.x, b.body.y);
      if (b.body.x < -80) {
        this._bubbleGroup.remove(b.body, true, true);
        this._bubbles.splice(i, 1);
      }
    }
  }

  // ─── COLLISION HANDLERS ───────────────────────────────────────────────────

  _onHitWall(bee, wall) {
    if (this._state !== STATE.PLAYING || this._invincible) return;
    this.cameras.main.shake(250, 0.015);
    SoundManager.hit();
    this._triggerDeath();
  }

  _onHitCoin(bee, coinBody) {
    if (this._state !== STATE.PLAYING) return;
    const pts = coinBody._points || 10;
    const cx  = coinBody.x;
    const cy  = coinBody.y;

    // Remove graphic
    if (coinBody._graphic) coinBody._graphic.destroy();
    const idx = this._coins.findIndex(c => c.body === coinBody);
    if (idx !== -1) this._coins.splice(idx, 1);
    this._coinGroup.remove(coinBody, true, true);

    // Particles
    this._burstParticles(cx, cy);
    SoundManager.coin();
    this._floatingText(cx, cy, `+${pts}`);
    this._score += pts;
  }

  _onHitBubble(bee, bubble) {
    if (this._state !== STATE.PLAYING) return;
    this._state = STATE.PAUSED;
    bubble.body.enable = false;
    this._pausedLabel.setVisible(true);
  }

  // ─── DEATH ANIMATION (CUTE) ───────────────────────────────────────────────

  _triggerDeath() {
    if (this._state === STATE.DYING || this._state === STATE.GAME_OVER) return;
    this._state = STATE.DYING;
    this._invincible = true;

    if (this._wingTween) this._wingTween.pause();
    this._bee.body.enable = false;

    // Spin + shrink + red tint
    this._bee.setTint(0xFF4444);
    this.tweens.add({
      targets:  this._bee,
      angle:    { from: 0, to: 360 },
      scaleX:   { from: 1, to: 0.1 },
      scaleY:   { from: 1, to: 0.1 },
      alpha:    { from: 1, to: 0.2 },
      duration: 700,
      ease:     'Power2',
      onComplete: () => {
        GameState.lives = Math.max(0, GameState.lives - 1);
        this._removeOneLifeIcon();

        if (GameState.lives > 0) {
          // Respawn — fly in from left with invincibility blink
          const { height } = this.scale;
          this._bee.setPosition(BEE_X, height / 2);
          this._bee.setScale(1);
          this._bee.setAngle(0);
          this._bee.clearTint();
          this._bee.setAlpha(1);
          this._bee.body.enable = true;
          if (this._wingTween) this._wingTween.resume();

          // Invincibility blink for 2s
          const blinkTween = this.tweens.add({
            targets: this._bee, alpha: 0.3,
            duration: 120, yoyo: true, repeat: 8,
            onComplete: () => {
              this._bee.setAlpha(1);
              this._invincible = false;
            },
          });

          this._state = STATE.PLAYING;
        } else {
          SoundManager.gameOver();
          HighScore.set(GameState.totalScore + this._score);
          this._bee.setAlpha(0.3);
          this._state = STATE.GAME_OVER;
          this._gameOverGroup.setVisible(true);
          this._invincible = false;
        }
      },
    });
  }

  // ─── HELPERS ─────────────────────────────────────────────────────────────

  _buildOverlay(w, h, title, color, subtitle) {
    const g = this.add.container(0, 0).setDepth(30).setVisible(false);
    g.add(this.add.rectangle(w / 2, h / 2, 360, 120, 0x000000, 0.75));
    g.add(this.add.text(w / 2, h / 2 - 20, title, {
      fontFamily: 'Arial Black', fontSize: '24px',
      color, stroke: '#000', strokeThickness: 4, align: 'center',
    }).setOrigin(0.5));
    g.add(this.add.text(w / 2, h / 2 + 20, subtitle, {
      fontFamily: 'Arial', fontSize: '16px',
      color: '#fff', stroke: '#000', strokeThickness: 3, align: 'center',
    }).setOrigin(0.5));
    return g;
  }

  _buildLivesHUD() {
    this._lifeIcons = [];
    for (let i = 0; i < GameState.lives; i++) {
      const icon = this.add.image(8 + i * 28, 10, 'bee')
        .setOrigin(0, 0).setDisplaySize(24, 24).setDepth(25);
      this._lifeIcons.push(icon);
    }
  }

  _removeOneLifeIcon() {
    const icon = this._lifeIcons.pop();
    if (icon) icon.destroy();
  }

  _buildScoreHUD(width) {
    this._digitImages = [];
    for (let i = 0; i < 6; i++) {
      this._digitImages.push(
        this.add.image(0, 12, 'digit_0')
          .setOrigin(0, 0).setDepth(25).setVisible(false).setScale(0.9)
      );
    }
    this._updateScoreHUD(width);
  }

  _updateScoreHUD(width) {
    const str  = String(this._score);
    const n    = str.length;
    const r    = width - 6;
    const SPACING = 18;
    this._digitImages.forEach((img, i) => {
      const pos  = this._digitImages.length - 1 - i;
      const cIdx = n - 1 - pos;
      if (cIdx < 0) { img.setVisible(false); return; }
      img.setTexture(`digit_${parseInt(str[cIdx], 10)}`);
      img.setX(r - (pos + 1) * SPACING);
      img.setVisible(true);
    });
  }

  _floatingText(x, y, text) {
    const t = this.add.text(x, y, text, {
      fontFamily: 'Arial Black', fontSize: '14px',
      color: '#FFD700', stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(50);
    this.tweens.add({ targets: t, y: y - 40, alpha: 0, duration: 900, ease: 'Power2', onComplete: () => t.destroy() });
  }

  _burstParticles(x, y) {
    try {
      const e = this.add.particles(x, y, 'coin_particle', {
        speed: { min: 40, max: 120 }, angle: { min: 0, max: 360 },
        scale: { start: 0.7, end: 0 }, lifespan: 400,
        quantity: 8, emitting: false, depth: 60, gravityY: 80,
      });
      e.explode(8);
      this.time.delayedCall(600, () => { if (e?.scene) e.destroy(); });
    } catch (err) { /* silently skip if Phaser version differs */ }
  }

  // ─── TILT + TOUCH ────────────────────────────────────────────────────────

  _setupTilt() {
    if (!('DeviceOrientationEvent' in window)) return;
    this._orientationHandler = (ev) => {
      if (ev.beta === null) return;
      this._tiltAvailable = true;
      if (this._state !== STATE.PLAYING) return;
      if (this._tiltStartBeta === null) this._tiltStartBeta = ev.beta;
      const { height } = this.scale;
      const delta = Phaser.Math.Clamp(ev.beta - this._tiltStartBeta, -10, 10);
      this._bee.y = Phaser.Math.Clamp(height / 2 - 16 * delta, 0, height);
    };
    window.addEventListener('deviceorientation', this._orientationHandler);
    if (typeof DeviceOrientationEvent?.requestPermission === 'function') {
      this._needsTiltPermission = true;
    }
  }

  _setupTouchZones(w, h) {
    const half = h / 2;
    this._tzTop = this.add.rectangle(0, 0, w, half, 0, 0).setOrigin(0, 0).setDepth(5).setInteractive();
    this._tzBot = this.add.rectangle(0, half, w, half, 0, 0).setOrigin(0, 0).setDepth(5).setInteractive();
    this._tzTop.on('pointerdown', () => this._touchDirection = -1);
    this._tzTop.on('pointerup',   () => this._touchDirection = 0);
    this._tzBot.on('pointerdown', () => this._touchDirection = 1);
    this._tzBot.on('pointerup',   () => this._touchDirection = 0);
    this._tzTop.on('pointerout',  () => this._touchDirection = 0);
    this._tzBot.on('pointerout',  () => this._touchDirection = 0);
    this._touchZoneActive = true;
  }

  // ─── STATE TRANSITIONS ────────────────────────────────────────────────────

  _onTap() {
    if (this._needsTiltPermission) {
      DeviceOrientationEvent.requestPermission().catch(console.error);
      this._needsTiltPermission = false;
    }
    switch (this._state) {
      case STATE.READY:          this._startGame();       break;
      case STATE.PAUSED:         this._resumeGame();      break;
      case STATE.GAME_OVER:      this._retryLevel();      break;
      case STATE.LEVEL_COMPLETE: this._advanceLevel();    break;
    }
  }

  _startGame() {
    this._state = STATE.PLAYING;
    this._tiltStartBeta = null;
    this._score = 0;
    this._worldOffset = 0;
    this._readyTxt.setVisible(false);
  }

  _resumeGame() {
    this._state = STATE.PLAYING;
    this._pausedLabel.setVisible(false);
  }

  _retryLevel() {
    GameState.retryLevel();
    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this._cleanup();
      this.scene.restart();
    });
  }

  _advanceLevel() {
    GameState.advanceLevel(this._score);
    unlockLevel(GameState.currentLevel);
    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this._cleanup();
      if (GameState.currentLevel > MAX_LEVELS) {
        HighScore.set(GameState.totalScore);
        this.scene.start('WinScene', { totalScore: GameState.totalScore });
      } else {
        this.scene.restart();
      }
    });
  }

  _cleanup() {
    if (this._orientationHandler) {
      window.removeEventListener('deviceorientation', this._orientationHandler);
      this._orientationHandler = null;
    }
  }

  // ─── UPDATE ───────────────────────────────────────────────────────────────

  update() {
    const { height, width } = this.scale;

    if (Phaser.Input.Keyboard.JustDown(this._spaceKey)) {
      if (this._state === STATE.READY)  { this._startGame();  return; }
      if (this._state === STATE.PAUSED) { this._resumeGame(); return; }
    }

    if (this._state !== STATE.PLAYING) return;

    // Scroll background layers (parallax)
    this._hillsBack.tilePositionX  += this._scrollSpeed * 0.3;
    this._hillsMid.tilePositionX   += this._scrollSpeed * 0.6;
    this._cloudTile.tilePositionX  += this._scrollSpeed * 0.2;
    this._flowersTile.tilePositionX += this._scrollSpeed;

    // *** KEY FIX: scroll obstacles by moving them individually ***
    this._worldOffset += this._scrollSpeed;
    this._scrollObstacles();

    // Check finish
    if (this._worldOffset >= this._finishX) {
      SoundManager.levelComplete();
      HighScore.set(GameState.totalScore + this._score);
      this._state = STATE.LEVEL_COMPLETE;
      this._levelCompleteGroup.setVisible(true);
      return;
    }

    // Keyboard
    if (this._cursors.up.isDown) {
      this._bee.y = Phaser.Math.Clamp(this._bee.y - VERT_SPEED, this._bee.displayHeight / 2, height - this._bee.displayHeight / 2);
    } else if (this._cursors.down.isDown) {
      this._bee.y = Phaser.Math.Clamp(this._bee.y + VERT_SPEED, this._bee.displayHeight / 2, height - this._bee.displayHeight / 2);
    }

    // Touch zones (when tilt not available)
    if (this._touchZoneActive && this._touchDirection !== 0 && !this._tiltAvailable) {
      this._bee.y = Phaser.Math.Clamp(
        this._bee.y + this._touchDirection * VERT_SPEED,
        this._bee.displayHeight / 2,
        height - this._bee.displayHeight / 2,
      );
    }

    this._bee.y = Phaser.Math.Clamp(this._bee.y, this._bee.displayHeight / 2, height - this._bee.displayHeight / 2);
    this._bee.setAngle(Math.sin(this.time.now / 250) * 4);
    this._updateScoreHUD(width);
  }

  shutdown() { this._cleanup(); }
}
