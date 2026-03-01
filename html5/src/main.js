import Phaser from 'phaser';
import { MenuScene }    from './scenes/MenuScene.js';
import { GameScene }    from './scenes/GameScene.js';
import { GameOverScene } from './scenes/GameOverScene.js';
import { WinScene }     from './scenes/WinScene.js';

// Original game was designed for ~480x320 (landscape mobile)
const GAME_WIDTH  = 480;
const GAME_HEIGHT = 320;

const config = {
  type: Phaser.AUTO,
  width:  GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: '#87CEEB',
  scale: {
    mode:       Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { y: 0 },
      debug:   false,
    },
  },
  scene: [MenuScene, GameScene, GameOverScene, WinScene],
};

const game = new Phaser.Game(config);

export { game, GAME_WIDTH, GAME_HEIGHT };
