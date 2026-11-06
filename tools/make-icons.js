// Renders the app icons (Luxe Noir: gold spade on black) from one SVG design.
// Usage: node tools/make-icons.js   (needs Playwright with Chromium)
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const out = path.join(__dirname, '..', 'icons');

// rounded: transparent rounded corners (purpose "any"); scale: artwork size inside the safe zone
function svg({ rounded = false, scale = 1, frame = true }) {
  const r = rounded ? 112 : 0, s = scale, t = (1 - s) * 256;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="bg" cx="50%" cy="28%" r="80%"><stop offset="0" stop-color="#2a2318"/><stop offset=".55" stop-color="#110f0c"/><stop offset="1" stop-color="#070605"/></radialGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f7e4ad"/><stop offset=".45" stop-color="#dcb662"/><stop offset="1" stop-color="#a87b31"/></linearGradient>
    <linearGradient id="hair" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f3dc9e" stop-opacity=".9"/><stop offset="1" stop-color="#b0863a" stop-opacity=".6"/></linearGradient>
    <radialGradient id="glow" cx="50%" cy="46%" r="40%"><stop offset="0" stop-color="#e3c27a" stop-opacity=".28"/><stop offset="1" stop-color="#e3c27a" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="512" height="512" rx="${r}" fill="url(#bg)"/>
  <g transform="translate(${t} ${t}) scale(${s})">
    <circle cx="256" cy="240" r="200" fill="url(#glow)"/>
    ${frame ? `<rect x="78" y="78" width="356" height="356" rx="26" fill="none" stroke="url(#hair)" stroke-width="5"/>
    <rect x="94" y="94" width="324" height="324" rx="16" fill="none" stroke="url(#hair)" stroke-width="1.6" opacity=".7"/>
    <g fill="url(#gold)"><path d="M78 256l10-10 10 10-10 10z"/><path d="M414 256l10-10 10 10-10 10z"/><path d="M256 78l10 10-10 10-10-10z"/><path d="M256 414l10 10-10 10-10-10z"/></g>` : ''}
    <path fill="url(#gold)" d="M256 128c26 44 112 92 112 152 0 38-30 62-62 62-20 0-36-8-44-20 4 30 18 50 42 62H208c24-12 38-32 42-62-8 12-24 20-44 20-32 0-62-24-62-62 0-60 86-108 112-152z"/>
    <path fill="#fff" opacity=".18" d="M256 150c-20 32-70 66-86 104 22-26 58-52 86-78z"/>
  </g>
</svg>`;
}

(async () => {
  fs.writeFileSync(path.join(out, 'icon.svg'), svg({ rounded: true }));
  const b = await chromium.launch(), p = await b.newPage();
  const jobs = [
    ['icon-192.png', 192, { rounded: true }],
    ['icon-512.png', 512, { rounded: true }],
    ['icon-maskable-512.png', 512, { scale: .78 }],   // keeps the art inside the 80% safe circle
    ['apple-touch-icon.png', 180, { frame: true }],   // iOS rounds the corners itself; no transparency
    ['favicon-32.png', 32, { rounded: true, frame: false, scale: 1.25 }],
  ];
  for (const [name, size, opt] of jobs) {
    await p.setViewportSize({ width: size, height: size });
    await p.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg(opt)}`);
    await p.screenshot({ path: path.join(out, name), omitBackground: true });
    console.log('wrote', name);
  }
  await b.close();
})();
