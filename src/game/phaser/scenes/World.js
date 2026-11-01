import Phaser from 'phaser';
import { EventBus } from '../EventBus.js';
import { getArea, TILE } from '../../data/areas.js';
import { ITEMS } from '../../data/items.js';
import { ENEMIES } from '../../data/enemies.js';
import { NPCS } from '../../data/npcs.js';
import { isWalkable, occupantAt, findPath, tileAt } from '../../engine/world.js';
import { getGameState, moveTo, pickUp } from '../../store.js';

const T = 16;           // tile size in px
const STEP_MS = 130;    // time to walk one tile

// Frames in Kenney's Tiny Town sheet (row * 12 + col)
const TOWN = {
  grass: 0, grassTuft: 1, flowers: 2, dirt: 25,
  trees: [16],
  house: [[52, 53, 53, 54], [64, 65, 65, 66], [72, 73, 73, 75]],
  doorway: 74,
};

// Top-left of the house block, so each house tile picks its roof/wall piece
function houseOrigin(tiles) {
  let x = Infinity, y = Infinity;
  tiles.forEach((row, ry) => [...row].forEach((ch, rx) => {
    if (ch === TILE.HOUSE || ch === TILE.DOOR) { x = Math.min(x, rx); y = Math.min(y, ry); }
  }));
  return { x, y };
}

// Top-down grid world: renders the area, moves the player tile by tile
// (keyboard or tap-to-move), and reports pickups / interactions to React.
export class World extends Phaser.Scene {
  constructor() { super('World'); }

  create() {
    const { world } = getGameState();
    this.area = getArea(world.areaId);
    this.locked = false;
    this.moving = false;
    this.path = [];
    this.pendingInteract = null;

    this.drawMap();
    this.drawObjects();

    this.player = this.add.image(0, 0, 'player').setDepth(10);
    this.placePlayer(world.pos);

    const w = this.area.tiles[0].length * T, h = this.area.tiles.length * T;
    this.cameras.main.setBounds(0, 0, w, h);
    this.cameras.main.startFollow(this.player, true, 0.2, 0.2);
    this.cameras.main.setRoundPixels(true);

    // Dark world → light: a dim veil that lifts when the area's fog is cleared
    this.veil = this.add.rectangle(0, 0, w, h, 0x05070f, 0.45).setOrigin(0).setDepth(20);
    if (world.fogCleared[this.area.id]) this.veil.setAlpha(0.08);

    this.keys = this.input.keyboard.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT');
    this.input.on('pointerdown', (p) => this.onTap(p));

    this.onLock = (v) => { this.locked = v; if (v) this.path = []; };
    this.onRefresh = () => this.refresh();
    EventBus.on('lock-input', this.onLock);
    EventBus.on('world-refresh', this.onRefresh);
    this.events.once('shutdown', () => {
      EventBus.off('lock-input', this.onLock);
      EventBus.off('world-refresh', this.onRefresh);
    });

    EventBus.emit('scene-ready', this);
  }

  // ── Rendering ──────────────────────────────────────────────────────────
  drawMap() {
    this.fogImages = [];
    const house = houseOrigin(this.area.tiles);
    this.area.tiles.forEach((row, y) => {
      [...row].forEach((ch, x) => {
        const at = (key, frame) => this.add.image(x * T, y * T, key, frame).setOrigin(0);
        if (ch === TILE.WATER) { at('tile-water'); return; }
        // Grass under everything else (trees, fog, house have transparent edges)
        at('town', ch === TILE.FLOWER ? TOWN.flowers : (x * 7 + y * 3) % 5 === 0 ? TOWN.grassTuft : TOWN.grass);
        if (ch === TILE.PATH) at('town', TOWN.dirt);
        if (ch === TILE.WALL) at('town', TOWN.trees[(x + y) % TOWN.trees.length]);
        if (ch === TILE.HOUSE || ch === TILE.DOOR) {
          const r = Math.min(y - house.y, 2), c = Math.min(x - house.x, 3);
          at('town', ch === TILE.DOOR ? TOWN.doorway : TOWN.house[r][c]);
        }
        if (ch === TILE.FOG) {
          this.fogImages.push(at('tile-fog').setDepth(15));
        }
      });
    });
    if (getGameState().world.fogCleared[this.area.id]) this.fogImages.forEach(f => f.setVisible(false));
  }

  drawObjects() {
    const { world } = getGameState();
    this.pickupImages?.forEach(i => i.destroy());
    this.actorImages?.forEach(i => i.destroy());
    this.pickupImages = new Map();
    this.actorImages = [];

    for (const p of this.area.pickups) {
      if (world.picked[p.id]) continue;
      const img = this.add.image(p.x * T + 8, p.y * T + 8, ITEMS[p.itemId].sprite).setDepth(5);
      this.tweens.add({ targets: img, y: img.y - 2, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
      this.pickupImages.set(p.id, img);
    }
    for (const n of this.area.npcs) {
      this.actorImages.push(this.add.image(n.x * T + 8, n.y * T + 8, NPCS[n.npcId].sprite).setDepth(9));
    }
    for (const e of this.area.enemies) {
      if (world.defeated[e.id]) continue;
      const def = ENEMIES[e.enemyId];
      const img = this.add.image(e.x * T + 8, e.y * T + 8, def.sprite).setDepth(9);
      if (def.clearsFog) img.setScale(1.5);
      if (def.id === 'fogling') img.setTint(0xb8b0e0); // foggy purple ghosts
      this.tweens.add({ targets: img, alpha: 0.75, duration: 900, yoyo: true, repeat: -1 });
      this.actorImages.push(img);
    }
  }

  placePlayer(pos) {
    this.pos = { x: pos.x, y: pos.y };
    this.player.setPosition(pos.x * T + 8, pos.y * T + 8);
  }

  // Called by React after battles/quests: redraw actors, lift fog, maybe respawn.
  refresh() {
    const { world } = getGameState();
    this.drawObjects();
    if (world.fogCleared[this.area.id] && this.fogImages[0]?.visible) {
      this.tweens.add({ targets: this.fogImages, alpha: 0, duration: 1600, onComplete: () => this.fogImages.forEach(f => f.setVisible(false)) });
      this.tweens.add({ targets: this.veil, alpha: 0.08, duration: 1600 });
    }
    if (world.pos.x !== this.pos.x || world.pos.y !== this.pos.y) this.placePlayer(world.pos);
  }

  // ── Input ──────────────────────────────────────────────────────────────
  onTap(pointer) {
    if (this.locked) return;
    const to = { x: Math.floor(pointer.worldX / T), y: Math.floor(pointer.worldY / T) };
    if (to.x === this.pos.x && to.y === this.pos.y) return;
    const res = findPath(this.area, getGameState().world, this.pos, to);
    if (!res) return;
    this.path = res.path;
    this.pendingInteract = res.interact ? to : null;
    EventBus.emit('activity');
    // Already standing next to the target: interact right away
    if (!this.path.length && this.pendingInteract) this.interactAt(this.pendingInteract);
  }

  update() {
    if (this.locked || this.moving) return;
    const k = this.keys;
    let dir = null;
    if (k.LEFT.isDown || k.A.isDown) dir = { x: -1, y: 0 };
    else if (k.RIGHT.isDown || k.D.isDown) dir = { x: 1, y: 0 };
    else if (k.UP.isDown || k.W.isDown) dir = { x: 0, y: -1 };
    else if (k.DOWN.isDown || k.S.isDown) dir = { x: 0, y: 1 };

    if (dir) {
      this.path = [];
      this.pendingInteract = null;
      const next = { x: this.pos.x + dir.x, y: this.pos.y + dir.y };
      if (occupantAt(this.area, getGameState().world, next.x, next.y)) return this.interactAt(next);
      if (isWalkable(this.area, getGameState().world, next.x, next.y)) this.step(next);
      return;
    }
    if (this.path.length) {
      this.step(this.path.shift());
    } else if (this.pendingInteract) {
      const target = this.pendingInteract;
      this.pendingInteract = null;
      this.interactAt(target);
    }
  }

  step(next) {
    this.moving = true;
    EventBus.emit('activity');
    this.tweens.add({
      targets: this.player,
      x: next.x * T + 8,
      y: next.y * T + 8,
      duration: STEP_MS,
      onComplete: () => {
        this.moving = false;
        this.pos = next;
        moveTo(next);
        this.arrive(next);
      },
    });
  }

  arrive(pos) {
    const pickup = this.area.pickups.find(p => p.x === pos.x && p.y === pos.y && !getGameState().world.picked[p.id]);
    if (pickup) {
      pickUp(pickup);
      const img = this.pickupImages.get(pickup.id);
      if (img) this.tweens.add({ targets: img, y: img.y - 10, alpha: 0, duration: 300, onComplete: () => img.destroy() });
      EventBus.emit('pickup', { item: ITEMS[pickup.itemId] });
    }
    if (tileAt(this.area, pos.x, pos.y) === TILE.DOOR) {
      this.path = [];
      this.locked = true; // React unlocks if the player stays
      EventBus.emit('door');
    }
  }

  interactAt(pos) {
    const occ = occupantAt(this.area, getGameState().world, pos.x, pos.y);
    if (!occ) return;
    this.path = [];
    this.locked = true; // React unlocks when the dialog/battle closes
    EventBus.emit('interact', occ);
  }
}
