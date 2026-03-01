/**
 * GameScene — the main gameplay scene.
 *
 * Ported from GameMechanics.lua (Corona SDK → Phaser 3).
 *
 * State machine:
 *   READY        — waiting for tap/space; world is static
 *   PLAYING      — world scrolls left, bee controllable
 *   PAUSED       — hit a bubble obstacle; tap to resume (Phase 2+)
 *   LEVEL_COMPLETE — reached the finish line
 *   GAME_OVER    — bee hit a wall with no lives remaining
 *
 * Controls:
 *   Desktop : UP / DOWN arrow keys (continuous, clamped to screen)
 *   Mobile  : DeviceOrientationEvent beta (forward tilt → move up)
 *
 * Scrolling world:
 *   All obstacles live in a container that moves left each frame.
 *   Bee stays at a fixed x position (x=120), matching original logic.
 */

const SCROLL_SPEED = 2;          // px per frame (original: speed = 2)
const BEE_X = 120;               // fixed horizontal position
const VERTICAL_MOVE_SPEED = 4;   // px per frame for keyboard control
const WORLD_LENGTH = 3000;       // total scrollable distance before finish

// State enum
const STATE = {
  READY: 'READY',
  PLAYING: 'PLAYING',
  PAUSED: 'PAUSED',
  LEVEL_COMPLETE: 'LEVEL_COMPLETE',
  GAME_OVER: 'GAME_OVER',
};

// Hardcoded wall obstacle configs  [worldX, topGapEnd, bottomGapStart]
// topGapEnd / bottomGapStart define the opening the bee must fly through.
const WALL_CONFIGS = [
  { x: 700,  gapTop: 80,  gapBottom: 200 },
  { x: 1100, gapTop: 120, gapBottom: 240 },
  { x: 1600, gapTop: 60,  gapBottom: 180 },
  { x: 2200, gapTop: 100, gapBottom: 220 },
];

export class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' });
    this._state = STATE.READY;
    this._tiltStartBeta = null;   // calibration reference for device tilt
    this._orientationHandler = null;
  }

  // ─── Asset Loading ────────────────────────────────────────────────────────

  preload() {
    this.load.image('bg', 'assets/thumb_Background.png');
    this.load.image('bg01', 'assets/thumb_Background01.png');
    this.load.image('cloud', 'assets/thumb_Cloud.png');
    this.load.image('bee', 'assets/thumb_Bee.png');
    this.load.image('wall', 'assets/wall.png');
    this.load.image('bubble', 'assets/thumb_Bubble.png');
  }

  // ─── Scene Creation ────────────────────────────────────────────────────────

  create() {
    const { width, height } = this.scale;

    this._state = STATE.READY;
    this._score = 0;
    this._tiltStartBeta = null;

    // ── Background (tiled, scrolls left) ──
    this._bgTile = this.add
      .tileSprite(0, 0, width, height, 'bg')
      .setOrigin(0, 0);

    // Optional: secondary cloud layer for parallax depth
    this._cloudTile = this.add
      .tileSprite(0, 0, width, height * 0.4, 'cloud')
      .setOrigin(0, 0)
      .setAlpha(0.5);

    // ── World container — everything that scrolls ──
    this._world = this.add.container(0, 0);

    // ── Wall obstacles ──
    this._walls = this.physics.add.staticGroup();
    this._buildWalls(width, height);

    // ── Bee ──
    this._bee = this.physics.add.image(BEE_X, height / 2, 'bee');
    this._bee.setCollideWorldBounds(true);
    this._bee.setDepth(10);
    // Keep bee physics body tight
    this._bee.body.setSize(
      this._bee.width * 0.7,
      this._bee.height * 0.7,
    );

    // ── Collision: bee ↔ walls ──
    this.physics.add.overlap(
      this._bee,
      this._walls,
      this._onBeeHitWall,
      null,
      this,
    );

    // ── Score text ──
    this._scoreTxt = this.add
      .text(width - 8, 8, 'Score: 0', {
        fontFamily: 'Arial Black, sans-serif',
        fontSize: '14px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(1, 0)
      .setDepth(20);

    // ── HUD: Ready prompt ──
    this._readyTxt = this.add
      .text(width / 2, height / 2 - 40, 'Tap  /  Press Space to start', {
        fontFamily: 'Arial, sans-serif',
        fontSize: '16px',
        color: '#FFD700',
        stroke: '#000',
        strokeThickness: 3,
        align: 'center',
      })
      .setOrigin(0.5)
      .setDepth(20);

    // Pulsing animation on ready text
    this.tweens.add({
      targets: this._readyTxt,
      alpha: 0.2,
      duration: 700,
      yoyo: true,
      repeat: -1,
    });

    // ── HUD: Game Over / Level Complete overlays ──
    this._gameOverTxt = this.add
      .text(width / 2, height / 2, 'You hit a wall!\nTap to retry', {
        fontFamily: 'Arial Black, sans-serif',
        fontSize: '22px',
        color: '#FF4444',
        stroke: '#000',
        strokeThickness: 4,
        align: 'center',
      })
      .setOrigin(0.5)
      .setDepth(30)
      .setVisible(false);

    this._levelCompleteTxt = this.add
      .text(width / 2, height / 2, '🎉 Level Complete!\nTap to return to menu', {
        fontFamily: 'Arial Black, sans-serif',
        fontSize: '22px',
        color: '#00FF88',
        stroke: '#000',
        strokeThickness: 4,
        align: 'center',
      })
      .setOrigin(0.5)
      .setDepth(30)
      .setVisible(false);

    // ── Input ──
    this._cursors = this.input.keyboard.createCursorKeys();
    this._spaceKey = this.input.keyboard.addKey(
      Phaser.Input.Keyboard.KeyCodes.SPACE,
    );

    // Pointer (tap/click)
    this.input.on('pointerdown', this._onTap, this);

    // Device orientation for mobile tilt control
    this._setupTiltControl();

    // ── Fade in ──
    this.cameras.main.fadeIn(400, 0, 0, 0);

    // ── Finish line marker (invisible trigger) ──
    this._finishX = WORLD_LENGTH;
  }

  // ─── Wall Construction ─────────────────────────────────────────────────────

  /**
   * Each wall config produces two static wall segments (top + bottom)
   * leaving a gap for the bee to pass through.
   */
  _buildWalls(sceneWidth, sceneHeight) {
    WALL_CONFIGS.forEach((cfg) => {
      // Top segment: from y=0 to gapTop
      const topH = cfg.gapTop;
      if (topH > 0) {
        const topWall = this.add.image(cfg.x, topH / 2, 'wall');
        topWall.setDisplaySize(32, topH);
        topWall.setDepth(5);
        this.physics.add.existing(topWall, true); // true = static
        this._walls.add(topWall);
        this._world.add(topWall);
      }

      // Bottom segment: from gapBottom to scene bottom
      const bottomH = sceneHeight - cfg.gapBottom;
      if (bottomH > 0) {
        const botWall = this.add.image(
          cfg.x,
          cfg.gapBottom + bottomH / 2,
          'wall',
        );
        botWall.setDisplaySize(32, bottomH);
        botWall.setDepth(5);
        this.physics.add.existing(botWall, true);
        this._walls.add(botWall);
        this._world.add(botWall);
      }
    });
  }

  // ─── Tilt / Orientation Control ────────────────────────────────────────────

  _setupTiltControl() {
    if (typeof window !== 'undefined' && 'DeviceOrientationEvent' in window) {
      this._orientationHandler = (event) => {
        if (this._state !== STATE.PLAYING) return;

        const beta = event.beta; // forward tilt −180…180
        if (beta === null) return;

        // Calibrate on first tilt event in PLAYING state
        if (this._tiltStartBeta === null) {
          this._tiltStartBeta = beta;
        }

        // Original formula: bee.y = 160 - 16 * delta  (clamped ±10°)
        const { height } = this.scale;
        let delta = beta - this._tiltStartBeta;
        delta = Phaser.Math.Clamp(delta, -10, 10);
        const targetY = height / 2 - 16 * delta;
        this._bee.y = Phaser.Math.Clamp(targetY, 0, height);
      };

      window.addEventListener('deviceorientation', this._orientationHandler);

      // iOS 13+ requires explicit permission
      if (
        typeof DeviceOrientationEvent !== 'undefined' &&
        typeof DeviceOrientationEvent.requestPermission === 'function'
      ) {
        // Will be prompted on first tap (see _onTap)
        this._needsOrientationPermission = true;
      }
    }
  }

  _requestOrientationPermission() {
    if (this._needsOrientationPermission) {
      DeviceOrientationEvent.requestPermission()
        .then((state) => {
          if (state !== 'granted') {
            console.warn('Device orientation permission denied.');
          }
        })
        .catch(console.error);
      this._needsOrientationPermission = false;
    }
  }

  // ─── Input Handlers ────────────────────────────────────────────────────────

  _onTap() {
    this._requestOrientationPermission();

    if (this._state === STATE.READY) {
      this._startGame();
    } else if (this._state === STATE.GAME_OVER) {
      this._restartGame();
    } else if (this._state === STATE.LEVEL_COMPLETE) {
      this._goToMenu();
    }
  }

  _onBeeHitWall(bee, wall) {
    if (this._state !== STATE.PLAYING) return;
    this._triggerGameOver();
  }

  // ─── State Transitions ─────────────────────────────────────────────────────

  _startGame() {
    this._state = STATE.PLAYING;
    this._readyTxt.setVisible(false);
    this._tiltStartBeta = null; // re-calibrate tilt on game start
    this._score = 0;
    this._worldOffset = 0;
  }

  _triggerGameOver() {
    if (this._state === STATE.GAME_OVER) return;
    this._state = STATE.GAME_OVER;

    // Flash bee red then show overlay
    this.tweens.add({
      targets: this._bee,
      alpha: 0,
      duration: 200,
      yoyo: true,
      repeat: 2,
      onComplete: () => {
        this._gameOverTxt.setVisible(true);
      },
    });
  }

  _triggerLevelComplete() {
    this._state = STATE.LEVEL_COMPLETE;
    this._levelCompleteTxt.setVisible(true);
  }

  _restartGame() {
    // Cleanly restart the scene
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
    if (this._state !== STATE.PLAYING) return;

    const { height } = this.scale;

    // ── Scroll background (parallax: slightly slower) ──
    this._bgTile.tilePositionX += SCROLL_SPEED * 0.8;
    this._cloudTile.tilePositionX += SCROLL_SPEED * 0.4;

    // ── Scroll world container (walls) ──
    this._world.x -= SCROLL_SPEED;
    this._worldOffset = (this._worldOffset || 0) + SCROLL_SPEED;

    // ── Check finish ──
    if (this._worldOffset >= this._finishX) {
      this._triggerLevelComplete();
      return;
    }

    // ── Keyboard vertical control ──
    // Only active when no tilt hardware is available OR device is not tilting
    const upKey = this._cursors.up;
    const downKey = this._cursors.down;

    if (Phaser.Input.Keyboard.JustDown(this._spaceKey) && this._state === STATE.READY) {
      this._startGame();
      return;
    }

    if (upKey.isDown) {
      this._bee.y = Phaser.Math.Clamp(
        this._bee.y - VERTICAL_MOVE_SPEED,
        this._bee.displayHeight / 2,
        height - this._bee.displayHeight / 2,
      );
    } else if (downKey.isDown) {
      this._bee.y = Phaser.Math.Clamp(
        this._bee.y + VERTICAL_MOVE_SPEED,
        this._bee.displayHeight / 2,
        height - this._bee.displayHeight / 2,
      );
    }

    // Keep bee within vertical bounds at all times
    this._bee.y = Phaser.Math.Clamp(
      this._bee.y,
      this._bee.displayHeight / 2,
      height - this._bee.displayHeight / 2,
    );

    // ── Score: increments with distance ──
    this._score = Math.floor(this._worldOffset / 10);
    this._scoreTxt.setText(`Score: ${this._score}`);

    // ── Bee gentle bob animation ──
    const beeHover = Math.sin(this.time.now / 200) * 2;
    this._bee.setAngle(beeHover * 3); // slight tilt wobble
  }

  // ─── Scene Cleanup (called by Phaser when scene stops) ────────────────────

  shutdown() {
    this._cleanup();
  }
}
