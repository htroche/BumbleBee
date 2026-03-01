/**
 * MenuScene — splash screen / main menu
 *
 * Shows the splash background, the BumbleBee logo text, and a Play button.
 * Tapping/clicking Play transitions to GameScene.
 */
import { GameState } from '../GameState.js';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MenuScene' });
  }

  preload() {
    // Background
    this.load.image('splash', 'assets/splashScreen.png');
    this.load.image('bg', 'assets/thumb_Background.png');
    this.load.image('bk-default', 'assets/bk-default.png');

    // Buttons
    this.load.image('btn-play', 'assets/btn-play.png');
    this.load.image('btn-play-over', 'assets/btn-play-over.png');
    this.load.image('btn-about', 'assets/btn-about.png');
    this.load.image('btn-help', 'assets/btn-help.png');
    this.load.image('btn-settings', 'assets/btn-settings.png');

    // Bee for logo decoration
    this.load.image('bee', 'assets/thumb_Bee.png');
    this.load.image('cloud', 'assets/thumb_Cloud.png');
  }

  create() {
    const { width, height } = this.scale;

    // --- Background ---
    // Try the default background first; fall back to solid colour via tileSprite
    const bgKey = this.textures.exists('bk-default') ? 'bk-default' : 'bg';
    this.add
      .image(width / 2, height / 2, bgKey)
      .setDisplaySize(width, height);

    // Scrolling cloud layer for ambiance
    this._cloud = this.add
      .tileSprite(0, 40, width, 80, 'cloud')
      .setOrigin(0, 0)
      .setAlpha(0.7);

    // --- Title ---
    this.add
      .text(width / 2, height * 0.22, 'BumbleBee', {
        fontFamily: 'Arial Black, Impact, sans-serif',
        fontSize: '42px',
        color: '#FFD700',
        stroke: '#8B4513',
        strokeThickness: 6,
        shadow: { offsetX: 2, offsetY: 2, color: '#000', blur: 4, fill: true },
      })
      .setOrigin(0.5);

    // Decorative bee next to title
    this.add
      .image(width / 2 + 120, height * 0.22, 'bee')
      .setScale(0.6)
      .setOrigin(0.5);

    // --- Play button ---
    const playBtn = this.add
      .image(width / 2, height * 0.58, 'btn-play')
      .setInteractive({ useHandCursor: true })
      .setScale(1.2);

    playBtn.on('pointerover', () => {
      if (this.textures.exists('btn-play-over')) {
        playBtn.setTexture('btn-play-over');
      }
      this.tweens.add({ targets: playBtn, scaleX: 1.35, scaleY: 1.35, duration: 100 });
    });

    playBtn.on('pointerout', () => {
      playBtn.setTexture('btn-play');
      this.tweens.add({ targets: playBtn, scaleX: 1.2, scaleY: 1.2, duration: 100 });
    });

    playBtn.on('pointerdown', () => {
      GameState.reset(); // always start fresh from level 1
      this.cameras.main.fadeOut(300, 0, 0, 0);
    });

    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('GameScene');
    });

    // --- Secondary buttons (About / Help / Settings) — decorative row ---
    const secondary = [
      { key: 'btn-about', x: width / 2 - 80 },
      { key: 'btn-help', x: width / 2 },
      { key: 'btn-settings', x: width / 2 + 80 },
    ];

    secondary.forEach(({ key, x }) => {
      this.add
        .image(x, height * 0.82, key)
        .setScale(0.85)
        .setAlpha(0.9);
    });

    // --- Version label ---
    this.add
      .text(width - 6, height - 4, 'Phase 1', {
        fontSize: '11px',
        color: '#ffffff',
        alpha: 0.5,
      })
      .setOrigin(1, 1)
      .setAlpha(0.5);

    // Fade-in on entry
    this.cameras.main.fadeIn(400, 0, 0, 0);
  }

  update() {
    // Slowly scroll the cloud layer
    if (this._cloud) {
      this._cloud.tilePositionX += 0.4;
    }
  }
}
