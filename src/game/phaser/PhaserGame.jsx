import { useLayoutEffect, useRef } from 'react';
import Phaser from 'phaser';
import { Boot } from './scenes/Boot.js';
import { World } from './scenes/World.js';

// Mounts one Phaser game into a div and tears it down on unmount.
export default function PhaserGame() {
  const parentRef = useRef(null);

  useLayoutEffect(() => {
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: parentRef.current,
      backgroundColor: '#05070f',
      pixelArt: true,
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: 320,
        height: 240,
      },
      scene: [Boot, World],
    });
    return () => game.destroy(true);
  }, []);

  return <div ref={parentRef} className="nqw-canvas" />;
}
