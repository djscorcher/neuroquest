import Phaser from 'phaser';

// One channel between React overlays and Phaser scenes.
//   Phaser → React: 'scene-ready', 'activity', 'pickup' {item}, 'interact' {kind, ...}, 'door'
//   React → Phaser: 'lock-input' (bool), 'world-refresh'
export const EventBus = new Phaser.Events.EventEmitter();
