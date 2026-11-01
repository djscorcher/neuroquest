import Phaser from 'phaser';
import { ART_KEYS, drawArt, drawTile, SHEETS, SHEET_SPRITES, drawSheetFrame } from '../../art/pixelArt.js';

// Loads the Kenney sheets, bakes every sprite key into its own 16×16 texture
// (sheet frame if we have one, code art otherwise), then starts the world.
export class Boot extends Phaser.Scene {
  constructor() { super('Boot'); }

  preload() {
    for (const [key, url] of Object.entries(SHEETS)) {
      this.load.spritesheet(key, url, { frameWidth: 16, frameHeight: 16 });
    }
  }

  create() {
    for (const key of ART_KEYS) {
      const src = SHEET_SPRITES[key];
      const canvas = src && this.textures.exists(src[0])
        ? drawSheetFrame(this.textures.get(src[0]).getSourceImage(), src[1], 16)
        : drawArt(key, 2);
      this.textures.addCanvas(key, canvas);
    }
    // Neither pack has water or fog, so those stay code-drawn
    this.textures.addCanvas('tile-water', drawTile('~'));
    this.textures.addCanvas('tile-fog', drawTile('F'));
    this.scene.start('World');
  }
}
