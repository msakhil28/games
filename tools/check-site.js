// Verifies that every file the app references exists in the site directory.
// Usage: node tools/check-site.js <siteDir>
const fs = require('fs'), path = require('path');
const dir = process.argv[2] || '.';
const read = f => fs.readFileSync(path.join(dir, f), 'utf8');
const want = new Set();

// files the service worker precaches
const sw = read('sw.js');
const list = sw.match(/const FILES = \[([\s\S]*?)\];/);
if (!list) { console.error('Could not find FILES in sw.js'); process.exit(1); }
for (const m of list[1].matchAll(/'([^']+)'/g)) if (m[1] !== './') want.add(m[1]);

// scripts, stylesheets, icons and preloads referenced by index.html
const html = read('index.html');
for (const m of html.matchAll(/(?:src|href)="([^"#:]+)"/g)) want.add(m[1]);

// fonts and images referenced by the stylesheet
for (const m of read('styles.css').matchAll(/url\((?!data:)['"]?([^'")]+)['"]?\)/g)) if (!/^(%23|#)/.test(m[1])) want.add(m[1]);

const missing = [...want].filter(f => !fs.existsSync(path.join(dir, f)));
if (missing.length) { console.error('Missing files:\n  ' + missing.join('\n  ')); process.exit(1); }
console.log(`All ${want.size} referenced files are present.`);
