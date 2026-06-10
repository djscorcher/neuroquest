import sharp from 'sharp';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src     = path.join(__dirname, '../public/branding/logo-dark.png');
const outDir  = path.join(__dirname, '../public');

// Dark navy background matching the app shell
const BG = { r: 2, g: 13, b: 31, alpha: 1 };

async function main() {
  // Standard PWA icons
  await sharp(src).resize(192, 192, { kernel: 'lanczos3' }).toFile(path.join(outDir, 'pwa-192x192.png'));
  await sharp(src).resize(512, 512, { kernel: 'lanczos3' }).toFile(path.join(outDir, 'pwa-512x512.png'));

  // Apple touch icon
  await sharp(src).resize(180, 180, { kernel: 'lanczos3' }).toFile(path.join(outDir, 'apple-touch-icon.png'));

  // favicon.ico (32×32 PNG saved with .ico extension — accepted by all modern browsers)
  const fav = await sharp(src).resize(32, 32, { kernel: 'lanczos3' }).png().toBuffer();
  fs.writeFileSync(path.join(outDir, 'favicon.ico'), fav);

  // Maskable icons: logo at 80% scale, centered on dark background
  for (const size of [192, 512]) {
    const logoSize = Math.round(size * 0.8);
    const offset   = Math.round((size - logoSize) / 2);
    const logo     = await sharp(src).resize(logoSize, logoSize, { kernel: 'lanczos3' }).toBuffer();

    await sharp({
      create: { width: size, height: size, channels: 4, background: BG },
    })
      .composite([{ input: logo, left: offset, top: offset }])
      .png()
      .toFile(path.join(outDir, `pwa-maskable-${size}.png`));
  }

  console.log('Icons generated:');
  ['pwa-192x192.png','pwa-512x512.png','apple-touch-icon.png','favicon.ico',
   'pwa-maskable-192.png','pwa-maskable-512.png'].forEach(f => {
    const p2 = path.join(outDir, f);
    const kb = (fs.statSync(p2).size / 1024).toFixed(1);
    console.log(`  ${f} — ${kb} kB`);
  });
}

main().catch(e => { console.error(e); process.exit(1); });
