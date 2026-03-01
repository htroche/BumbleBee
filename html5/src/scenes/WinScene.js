/**
 * WinScene — shown when the player clears all 3 levels.
 *
 * Receives { totalScore } via scene data.
 * "Play Again" → resets GameState and returns to MenuScene.
 */
import { GameState } from '../GameState.js';

export class WinScene extends Phaser.Scene {
  constructor() {
    super({ key: 'WinScene' });
    this._totalScore = 0;
  }

  init(data) {
    this._totalScore = data?.totalScore ?? GameState.totalScore;
  }

  preload() {
    // Assets should already be cached from GameScene, but load defensively
    if (!this.textures.exists('bee')) {
      this.load.image('bee',  'assets/thumb_Bee.png');
    }
    if (!this.textures.exists('bg')) {
      this.load.image('bg',   'assets/thumb_Background.png');
    }
    if (!this.textures.exists('cloud')) {
      this.load.image('cloud','assets/thumb_Cloud.png');
    }
  }

  create() {
    const { width, height } = this.scale;

    // ── Background ──────────────────────────────────────────────────────────
    this._bg = this.add
      .tileSprite(0, 0, width, height, 'bg')
      .setOrigin(0, 0);

    this._cloud = this.add
      .tileSprite(0, 0, width, height * 0.45, 'cloud')
      .setOrigin(0, 0)
      .setAlpha(0.5);

    // ── Dark panel ──────────────────────────────────────────────────────────
    this.add
      .rectangle(width / 2, height / 2, width * 0.82, height * 0.78, 0x000000, 0.65)
      .setDepth(1);

    // ── Trophy & title ──────────────────────────────────────────────────────
    this.add
      .text(width / 2, height * 0.16, '🏆', {
        fontSize: '52px',
      })
      .setOrigin(0.5)
      .setDepth(2);

    this.add
      .text(width / 2, height * 0.34, 'You Win!', {
        fontFamily: 'Arial Black, Impact, sans-serif',
        fontSize:   '36px',
        color:      '#FFD700',
        stroke:     '#8B4513',
        strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setDepth(2);

    // ── Score ────────────────────────────────────────────────────────────────
    this.add
      .text(width / 2, height * 0.50, `Total Score: ${this._totalScore}`, {
        fontFamily: 'Arial, sans-serif',
        fontSize:   '20px',
        color:      '#ffffff',
        stroke:     '#000',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(2);

    // ── Star rating ──────────────────────────────────────────────────────────
    const stars = this._starRating(this._totalScore);
    this.add
      .text(width / 2, height * 0.61, stars, {
        fontSize: '28px',
      })
      .setOrigin(0.5)
      .setDepth(2);

    // ── Play Again button ─────────────────────────────────────────────────────
    const playAgainBtn = this.add
      .text(width / 2, height * 0.75, '[ PLAY AGAIN ]', {
        fontFamily: 'Arial Black, sans-serif',
        fontSize:   '20px',
        color:      '#00FF88',
        stroke:     '#000',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(2)
      .setInteractive({ useHandCursor: true });

    playAgainBtn.on('pointerover',  () => playAgainBtn.setColor('#FFD700'));
    playAgainBtn.on('pointerout',   () => playAgainBtn.setColor('#00FF88'));
    playAgainBtn.on('pointerdown',  () => {
      GameState.reset();
      this.cameras.main.fadeOut(300, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => {
        this.scene.start('MenuScene');
      });
    });

    // ── Decorative bees ──────────────────────────────────────────────────────
    [width * 0.15, width * 0.85].forEach((beeX, i) => {
      const bee = this.add.image(beeX, height * 0.48, 'bee')
        .setScale(0.55)
        .setDepth(2)
        .setFlipX(i === 1);

      this.tweens.add({
        targets:  bee,
        y:        height * 0.48 - 12,
        duration: 900 + i * 150,
        yoyo:     true,
        repeat:   -1,
        ease:     'Sine.easeInOut',
      });
    });

    // ── Tap anywhere to continue ──────────────────────────────────────────────
    this.input.on('pointerdown', () => {
      GameState.reset();
      this.cameras.main.fadeOut(300, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => {
        this.scene.start('MenuScene');
      });
    });

    this.cameras.main.fadeIn(500, 0, 0, 0);
  }

  update() {
    if (this._bg)    this._bg.tilePositionX    += 0.6;
    if (this._cloud) this._cloud.tilePositionX += 0.3;
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  _starRating(score) {
    if (score >= 500) return '⭐⭐⭐';
    if (score >= 250) return '⭐⭐';
    return '⭐';
  }
}
