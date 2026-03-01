/**
 * GameOverScene — stub scene shown after a final game-over event.
 *
 * In Phase 1 the "game over" state is handled inline inside GameScene.
 * This scene exists as a clean entry point for future phases (Phase 4
 * will add the lives system and route here when all lives are gone).
 *
 * Current behaviour:
 *   • Shows a "Game Over" banner
 *   • Shows final score passed via scene data
 *   • "Retry" → restarts GameScene
 *   • "Menu"  → goes back to MenuScene
 */
export class GameOverScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameOverScene' });
  }

  init(data) {
    // Scene data passed from GameScene when all lives are exhausted
    this._finalScore = data?.score ?? 0;
  }

  create() {
    const { width, height } = this.scale;

    // Dark overlay
    this.add
      .rectangle(width / 2, height / 2, width, height, 0x000000, 0.75)
      .setDepth(0);

    // Title
    this.add
      .text(width / 2, height * 0.3, 'GAME OVER', {
        fontFamily: 'Arial Black, Impact, sans-serif',
        fontSize: '36px',
        color: '#FF4444',
        stroke: '#000000',
        strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setDepth(1);

    // Score
    this.add
      .text(width / 2, height * 0.48, `Score: ${this._finalScore}`, {
        fontFamily: 'Arial, sans-serif',
        fontSize: '20px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(1);

    // Retry button
    const retryBtn = this.add
      .text(width / 2, height * 0.65, '[ RETRY ]', {
        fontFamily: 'Arial Black, sans-serif',
        fontSize: '22px',
        color: '#FFD700',
        stroke: '#000',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(1)
      .setInteractive({ useHandCursor: true });

    retryBtn.on('pointerover', () => retryBtn.setColor('#FFA500'));
    retryBtn.on('pointerout', () => retryBtn.setColor('#FFD700'));
    retryBtn.on('pointerdown', () => {
      this.cameras.main.fadeOut(300, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => {
        this.scene.start('GameScene');
      });
    });

    // Menu button
    const menuBtn = this.add
      .text(width / 2, height * 0.8, '[ MENU ]', {
        fontFamily: 'Arial Black, sans-serif',
        fontSize: '18px',
        color: '#aaaaaa',
        stroke: '#000',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(1)
      .setInteractive({ useHandCursor: true });

    menuBtn.on('pointerover', () => menuBtn.setColor('#ffffff'));
    menuBtn.on('pointerout', () => menuBtn.setColor('#aaaaaa'));
    menuBtn.on('pointerdown', () => {
      this.cameras.main.fadeOut(300, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => {
        this.scene.start('MenuScene');
      });
    });

    this.cameras.main.fadeIn(400, 0, 0, 0);
  }
}
