/**
 * MenuScene — splash screen / main menu
 *
 * Phase 4 additions:
 *   • P3 — Shows "Best: XXXX" from localStorage high score
 *   • P6 — Level 2 → button (unlocked after beating Level 1)
 *        — 🔊/🔇 sound toggle button (stored in localStorage)
 */
import { GameState }        from '../GameState.js';
import { HighScore }        from '../utils/HighScore.js';
import { SoundManager }     from '../utils/SoundManager.js';
import { getUnlockedLevel } from '../utils/LevelUnlock.js';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MenuScene' });
  }

  preload() {
    // Background
    this.load.image('splash',    'assets/splashScreen.png');
    this.load.image('bg',        'assets/thumb_Background.png');
    this.load.image('bk-default','assets/bk-default.png');

    // Buttons
    this.load.image('btn-play',      'assets/btn-play.png');
    this.load.image('btn-play-over', 'assets/btn-play-over.png');
    this.load.image('btn-about',     'assets/btn-about.png');
    this.load.image('btn-help',      'assets/btn-help.png');
    this.load.image('btn-settings',  'assets/btn-settings.png');

    // Bee for logo decoration
    this.load.image('bee',   'assets/thumb_Bee.png');
    this.load.image('cloud', 'assets/thumb_Cloud.png');
  }

  create() {
    const { width, height } = this.scale;

    // ── Background ────────────────────────────────────────────────────────────
    const bgKey = this.textures.exists('bk-default') ? 'bk-default' : 'bg';
    this.add
      .image(width / 2, height / 2, bgKey)
      .setDisplaySize(width, height);

    this._cloud = this.add
      .tileSprite(0, 40, width, 80, 'cloud')
      .setOrigin(0, 0)
      .setAlpha(0.7);

    // ── Title ─────────────────────────────────────────────────────────────────
    this.add
      .text(width / 2, height * 0.22, 'BumbleBee', {
        fontFamily: 'Arial Black, Impact, sans-serif',
        fontSize:   '42px',
        color:      '#FFD700',
        stroke:     '#8B4513',
        strokeThickness: 6,
        shadow: { offsetX: 2, offsetY: 2, color: '#000', blur: 4, fill: true },
      })
      .setOrigin(0.5);

    this.add
      .image(width / 2 + 120, height * 0.22, 'bee')
      .setScale(0.6)
      .setOrigin(0.5);

    // ── P3: High score display ─────────────────────────────────────────────────
    const best = HighScore.get();
    if (best > 0) {
      this.add
        .text(width / 2, height * 0.32, `Best: ${best}`, {
          fontFamily: 'Arial, sans-serif',
          fontSize:   '15px',
          color:      '#FFD700',
          stroke:     '#000',
          strokeThickness: 2,
        })
        .setOrigin(0.5);
    }

    // ── Play button (starts from Level 1) ─────────────────────────────────────
    const playBtn = this.add
      .image(width / 2, height * 0.52, 'btn-play')
      .setInteractive({ useHandCursor: true })
      .setScale(1.2);

    playBtn.on('pointerover', () => {
      if (this.textures.exists('btn-play-over')) playBtn.setTexture('btn-play-over');
      this.tweens.add({ targets: playBtn, scaleX: 1.35, scaleY: 1.35, duration: 100 });
    });
    playBtn.on('pointerout', () => {
      playBtn.setTexture('btn-play');
      this.tweens.add({ targets: playBtn, scaleX: 1.2, scaleY: 1.2, duration: 100 });
    });
    playBtn.on('pointerdown', () => {
      GameState.reset(); // always start fresh from level 1
      this._launchGame(1);
    });

    // ── P6: Level 2 → button (if unlocked) ───────────────────────────────────
    const unlocked = getUnlockedLevel();
    if (unlocked >= 2) {
      const lvl2Btn = this.add
        .text(width / 2, height * 0.65, '▶  Level 2 →', {
          fontFamily: 'Arial Black, sans-serif',
          fontSize:   '16px',
          color:      '#00FF88',
          stroke:     '#000',
          strokeThickness: 3,
          backgroundColor: '#00000055',
          padding: { x: 14, y: 6 },
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });

      lvl2Btn.on('pointerover',  () => lvl2Btn.setColor('#FFD700'));
      lvl2Btn.on('pointerout',   () => lvl2Btn.setColor('#00FF88'));
      lvl2Btn.on('pointerdown',  () => {
        GameState.reset();
        GameState.currentLevel = 2;
        this._launchGame(2);
      });
    }

    // ── P6: 🔊/🔇 Sound toggle button ────────────────────────────────────────
    const soundLabel = () => SoundManager.muted ? '🔇' : '🔊';
    const soundBtn   = this.add
      .text(width - 12, 12, soundLabel(), {
        fontSize: '22px',
      })
      .setOrigin(1, 0)
      .setDepth(50)
      .setInteractive({ useHandCursor: true });

    soundBtn.on('pointerdown', () => {
      SoundManager.muted = !SoundManager.muted;
      soundBtn.setText(soundLabel());
    });

    // ── Secondary buttons row ─────────────────────────────────────────────────
    const secondary = [
      { key: 'btn-about',    x: width / 2 - 80 },
      { key: 'btn-help',     x: width / 2 },
      { key: 'btn-settings', x: width / 2 + 80 },
    ];
    secondary.forEach(({ key, x }) => {
      this.add
        .image(x, height * 0.82, key)
        .setScale(0.85)
        .setAlpha(0.9);
    });

    // ── Version label ─────────────────────────────────────────────────────────
    this.add
      .text(width - 6, height - 4, 'Phase 4', {
        fontSize: '11px',
        color:    '#ffffff',
      })
      .setOrigin(1, 1)
      .setAlpha(0.5);

    // Fade-in
    this.cameras.main.fadeIn(400, 0, 0, 0);
  }

  update() {
    if (this._cloud) this._cloud.tilePositionX += 0.4;
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  _launchGame(startLevel) {
    GameState.currentLevel = startLevel;
    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('GameScene');
    });
  }
}
