import { useState, useRef } from 'react';
import { ORIGINAL_PALETTE } from '../art/pixelArt.js';
import { updateOriginal } from '../store.js';

const SIZE = 32;

// Tiny pixel editor for originals: 32×32, pencil / eraser / fill.
export default function SpriteMaker({ original, onClose, onActivity }) {
  const [pixels, setPixels] = useState(() => original.pixels ?? Array(SIZE * SIZE).fill(0));
  const [color, setColor] = useState(1);
  const [tool, setTool] = useState('pencil');
  const drawing = useRef(false);

  const paint = (i) => {
    onActivity();
    if (tool === 'fill') return setPixels(p => flood(p, i, color));
    const c = tool === 'eraser' ? 0 : color;
    setPixels(p => (p[i] === c ? p : Object.assign([...p], { [i]: c })));
  };

  // Pointer events cover mouse, touch and pen; find the cell under the pointer while dragging
  const cellFromEvent = (e) => {
    const i = document.elementFromPoint(e.clientX, e.clientY)?.dataset?.i;
    return i === undefined ? null : Number(i);
  };

  const save = () => { updateOriginal(original.id, { pixels }); onClose(); };

  return (
    <div className="nqw-modal">
      <div className="nqw-card">
        <h2>Draw {original.name}</h2>
        <div
          className="nqw-sprite"
          onPointerDown={e => { drawing.current = true; const i = cellFromEvent(e); if (i !== null) paint(i); }}
          onPointerMove={e => { if (!drawing.current || tool === 'fill') return; const i = cellFromEvent(e); if (i !== null) paint(i); }}
          onPointerUp={() => { drawing.current = false; }}
          onPointerLeave={() => { drawing.current = false; }}
        >
          {pixels.map((c, i) => <div key={i} data-i={i} style={{ background: ORIGINAL_PALETTE[c] ?? 'transparent' }} />)}
        </div>
        <div className="nqw-palette" role="radiogroup" aria-label="Color">
          {ORIGINAL_PALETTE.slice(1).map((hex, idx) => (
            <button key={hex} className={`nqw-swatch ${color === idx + 1 && tool !== 'eraser' ? 'on' : ''}`} style={{ background: hex }}
              aria-label={`Color ${idx + 1}`} onClick={() => { setColor(idx + 1); if (tool === 'eraser') setTool('pencil'); }} />
          ))}
        </div>
        <div className="nqw-row" style={{ marginBottom: 12 }}>
          {['pencil', 'eraser', 'fill'].map(t => (
            <button key={t} className={`nqw-btn ${tool === t ? 'primary' : ''}`} onClick={() => setTool(t)}>{t}</button>
          ))}
          <button className="nqw-btn" onClick={() => setPixels(Array(SIZE * SIZE).fill(0))}>clear</button>
        </div>
        <div className="nqw-row">
          <button className="nqw-btn primary" onClick={save}>Save</button>
          <button className="nqw-btn" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function flood(pixels, start, color) {
  const target = pixels[start];
  if (target === color) return pixels;
  const out = [...pixels];
  const stack = [start];
  while (stack.length) {
    const i = stack.pop();
    if (out[i] !== target) continue;
    out[i] = color;
    const x = i % SIZE, y = Math.floor(i / SIZE);
    if (x > 0) stack.push(i - 1);
    if (x < SIZE - 1) stack.push(i + 1);
    if (y > 0) stack.push(i - SIZE);
    if (y < SIZE - 1) stack.push(i + SIZE);
  }
  return out;
}
