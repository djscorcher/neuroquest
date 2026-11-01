import Phaser from 'phaser';
import { ART_KEYS, drawArt, drawTile } from '../../art/pixelArt.js';

export const TILE_KEYS = { '.': 'grass', ',': 'flower', P: 'path', '~': 'water', '#': 'tree', H: 'house', D: 'door', F: 'fog' };

// Bakes all placeholder art into textures, then starts the world.
export class Boot extends Phaser.Scene {
  constructor() { super('Boot'); }

  create() {
    for (const key of ART_KEYS) this.textures.addCanvas(key, drawArt(key, 2));
    for (const [ch, key] of Object.entries(TILE_KEYS)) this.textures.addCanvas(`tile-${key}`, drawTile(ch));
    this.scene.start('World');
  }
}
