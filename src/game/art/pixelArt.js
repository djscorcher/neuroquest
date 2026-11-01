// Placeholder pixel art, drawn from character grids. Each sprite is 8×8; the key
// matches `sprite` in the data files. Swap in real art later by loading image
// files under the same keys — nothing else needs to change.

const ART = {
  player: { p: { h: '#3a5f8f', f: '#f0c9a0', e: '#1b1b1b', c: '#2c4a6e', b: '#2a1f17' }, rows: [
    '..hhhh..', '.hhhhhh.', '.heffeh.', '.hffffh.', '..cccc..', '.cccccc.', '..cccc..', '..b..b..'] },
  wren: { p: { h: '#4f7a4a', f: '#f0c9a0', e: '#1b1b1b', c: '#6b8f5a', b: '#2a1f17', l: '#ffd36b' }, rows: [
    '..hhhh..', '.hhhhhh.', '.heffeh.', '.hffffh.', '..cccc..', '.cccccl.', '..cccc..', '..b..b..'] },
  fogling: { p: { g: '#7d7a9c', e: '#ff5a6a' }, rows: [
    '..gggg..', '.gggggg.', '.geggeg.', '.gggggg.', 'gggggggg', 'gggggggg', 'g.gg.gg.', '........'] },
  fogwarden: { p: { d: '#3b3550', e: '#ff4d4d', m: '#8a90a8' }, rows: [
    '.dd..dd.', '.dddddd.', 'ddeddedd', 'dddddddd', '.dmmmmd.', '.dmmmmd.', '.dd..dd.', '.dd..dd.'] },

  ember: { p: { o: '#e8673a', y: '#ffd36b' }, rows: [
    '...o....', '...oo...', '..ooo...', '..oyoo..', '.ooyyoo.', '.oyyyyo.', '..oyyo..', '...oo...'] },
  feather: { p: { w: '#e9e4d8', q: '#8a7a63' }, rows: [
    '......ww', '.....www', '....www.', '...www..', '..www...', '.wwq....', '.q......', 'q.......'] },
  dewdrop: { p: { b: '#5fa8d3', l: '#d6f0ff' }, rows: [
    '...b....', '...b....', '..bbb...', '.bbbbb..', '.bblbb..', '.bbbbb..', '..bbb...', '........'] },
  pebble: { p: { s: '#9a9488', l: '#c9c3b6', d: '#5e5a52' }, rows: [
    '........', '........', '..ssss..', '.sslsss.', '.ssssss.', '.sssssd.', '..dddd..', '........'] },
  moonmoss: { p: { m: '#8fd1b0', l: '#e6fff3', d: '#3e6b56' }, rows: [
    '........', '..m..m..', '.mmm.mm.', 'mmlmmmmm', '.mmmmlm.', 'mmmmmmmm', '.dddddd.', '........'] },
  glowcap: { p: { c: '#d8b84a', l: '#fff3b0', t: '#e8e0cf' }, rows: [
    '..cccc..', '.clcccc.', 'cccccccc', '..tttt..', '...tt...', '...tt...', '..tttt..', '........'] },
  mothling: { p: { w: '#c7b3e6', a: '#7b6a99', e: '#1b1b1b' }, rows: [
    'w......w', 'ww.aa.ww', 'wwaaaaww', '.waeeaw.', 'wwaaaaww', 'ww.aa.ww', 'w......w', '........'] },
  cinderpup: { p: { o: '#b5562f', e: '#1b1b1b', y: '#ffb347' }, rows: [
    '........', 'o.o.....', 'ooo.....', 'oeoooooy', '.ooooooy', '.oooooo.', '.o..o.o.', '........'] },
  spark: { p: { y: '#ffe14d' }, rows: [
    '....yy..', '...yy...', '..yy....', '.yyyyy..', '....yy..', '...yy...', '..yy....', '.y......'] },
  mend: { p: { p: '#6ee39a', l: '#d9ffe8' }, rows: [
    '........', '.pp..pp.', 'plpppppp', 'pppppppp', '.pppppp.', '..pppp..', '...pp...', '........'] },
  gust: { p: { a: '#bfe8ff' }, rows: [
    '........', '.aaaa...', 'a....a..', '..aaaaa.', '.a.....a', '...aaaa.', '..a.....', '........'] },
  lanterncharm: { p: { k: '#b08d57', l: '#ffe9a3' }, rows: [
    '...kk...', '..k..k..', '.kkkkkk.', '.kllllk.', '.kllllk.', '.kkkkkk.', '...kk...', '........'] },
  feathercloak: { p: { c: '#6d8fb3', w: '#e9e4d8' }, rows: [
    '..cccc..', '.cccccc.', '.cwccwc.', 'cccccccc', 'cwccccwc', 'cccccccc', 'c.c..c.c', '........'] },
  fangring: { p: { r: '#c9c3b6', w: '#fff8e8' }, rows: [
    '........', '..rrrr..', '.r....r.', '.r....r.', '.r....r.', '..rrrr..', '...ww...', '...w....'] },
  original: { p: { q: '#b9a7ff' }, rows: [
    '..qqqq..', '.q....q.', '......q.', '....qq..', '...q....', '........', '...q....', '........'] },
};

export const ART_KEYS = Object.keys(ART);

export function drawArt(key, scale = 2) {
  const art = ART[key] ?? ART.original;
  const c = document.createElement('canvas');
  c.width = 8 * scale; c.height = 8 * scale;
  const ctx = c.getContext('2d');
  art.rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      const color = art.p[ch];
      if (!color) return;
      ctx.fillStyle = color;
      ctx.fillRect(x * scale, y * scale, scale, scale);
    });
  });
  return c;
}

const _urlCache = new Map();
export function artUrl(key, scale = 4) {
  const k = `${key}@${scale}`;
  if (!_urlCache.has(k)) _urlCache.set(k, drawArt(key, scale).toDataURL());
  return _urlCache.get(k);
}

// Draw a player-made original (32×32 palette indices) to a data URL.
export const ORIGINAL_PALETTE = [
  null, '#1b1b1b', '#f4f1ea', '#e8673a', '#ffd36b', '#6ee39a', '#5fa8d3', '#7b6a99',
  '#c7b3e6', '#b5562f', '#9a9488', '#3b3550', '#ff5a6a', '#8fd1b0', '#d8b84a', '#2c4a6e',
];
export function originalUrl(pixels, size = 32, scale = 2) {
  if (!pixels) return artUrl('original', 4);
  const c = document.createElement('canvas');
  c.width = size * scale; c.height = size * scale;
  const ctx = c.getContext('2d');
  pixels.forEach((idx, i) => {
    const color = ORIGINAL_PALETTE[idx];
    if (!color) return;
    ctx.fillStyle = color;
    ctx.fillRect((i % size) * scale, Math.floor(i / size) * scale, scale, scale);
  });
  return c.toDataURL();
}

// ── 16×16 map tiles, drawn procedurally with a fixed pattern ──
const TILE_COLORS = {
  '.': ['#2f4a3a', '#26402f'],
  ',': ['#2f4a3a', '#c9a3e8'],
  P:   ['#6b5a46', '#5a4a39'],
  '~': ['#24435e', '#3b6b8c'],
  '#': ['#1d3324', '#4a3426'],
  H:   ['#5b4636', '#7a3b3b'],
  D:   ['#3a2a1e', '#d8b84a'],
  F:   ['#4d5160', '#6e7380'],
};

export function drawTile(ch) {
  const [base, accent] = TILE_COLORS[ch] ?? TILE_COLORS['.'];
  const c = document.createElement('canvas');
  c.width = 16; c.height = 16;
  const ctx = c.getContext('2d');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 16, 16);
  ctx.fillStyle = accent;
  if (ch === '#') {            // tree: canopy blob + trunk
    ctx.fillStyle = '#16291c'; ctx.fillRect(2, 1, 12, 10);
    ctx.fillStyle = '#25412c'; ctx.fillRect(4, 2, 6, 4);
    ctx.fillStyle = accent;    ctx.fillRect(7, 11, 2, 5);
  } else if (ch === 'H') {     // roof stripes over wall
    ctx.fillRect(0, 0, 16, 7);
    ctx.fillStyle = '#5e2c2c'; for (let x = 0; x < 16; x += 4) ctx.fillRect(x, 0, 2, 7);
  } else if (ch === 'D') {     // door with knob
    ctx.fillStyle = '#7a3b3b'; ctx.fillRect(0, 0, 16, 4);
    ctx.fillStyle = '#2a1d14'; ctx.fillRect(4, 5, 8, 11);
    ctx.fillStyle = accent;    ctx.fillRect(10, 10, 1, 1);
  } else if (ch === '~') {     // ripples
    ctx.fillRect(2, 4, 4, 1); ctx.fillRect(9, 9, 5, 1); ctx.fillRect(3, 13, 3, 1);
  } else if (ch === 'F') {     // fog swirl
    ctx.globalAlpha = 0.7;
    ctx.fillRect(1, 3, 6, 2); ctx.fillRect(8, 8, 7, 2); ctx.fillRect(3, 12, 6, 2);
  } else if (ch === ',') {     // flowers
    ctx.fillStyle = '#26402f'; ctx.fillRect(5, 11, 1, 1);
    ctx.fillStyle = accent; ctx.fillRect(3, 4, 2, 2); ctx.fillRect(10, 9, 2, 2); ctx.fillRect(12, 3, 1, 1);
  } else {                     // grass / path speckle
    ctx.fillRect(3, 4, 1, 1); ctx.fillRect(11, 6, 1, 1); ctx.fillRect(6, 12, 1, 1); ctx.fillRect(13, 13, 1, 1);
  }
  return c;
}
