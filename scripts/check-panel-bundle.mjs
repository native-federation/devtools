// T1-AC-03: the built extension must be MV3-CSP-safe and zoneless.
// JS files must not contain eval, new Function, or zone.js; HTML pages
// must not carry inline scripts or inline event handlers (MV3 CSP
// script-src 'self' blocks both). Exits non-zero on any hit.
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const extensionDirs = ['../dist/extension', '../dist/extension-firefox'].map((dir) =>
  fileURLToPath(new URL(dir, import.meta.url)),
);

const jsChecks = [
  // `inspectedWindow.eval(` is the one sanctioned DevTools API call
  // (Task 8, the bridge's probe channel); any other `eval(` — bare or
  // via another object — still fails the build.
  { label: 'eval(', pattern: /(?<!inspectedWindow\.)\beval\(/ },
  { label: 'new Function(', pattern: /new Function\(/ },
  { label: 'zone.js', pattern: /zone\.js|__zone_symbol__/ },
];

const htmlChecks = [
  { label: 'inline <script>', pattern: /<script(?![^>]*\bsrc\s*=)[^>]*>/i },
  { label: 'inline event handler', pattern: /\son[a-z]+\s*=\s*["']/i },
];

let failed = false;

for (const extensionDir of extensionDirs) {
  const files = readdirSync(extensionDir, { recursive: true }).filter(
    (file) => typeof file === 'string',
  );
  const jsFiles = files.filter((file) => file.endsWith('.js'));
  const htmlFiles = files.filter((file) => file.endsWith('.html'));

  if (jsFiles.length === 0 || htmlFiles.length === 0) {
    console.error(`FAIL: no JS or HTML files found under ${extensionDir} — did the build run?`);
    failed = true;
  }

  for (const [candidates, checks] of [
    [jsFiles, jsChecks],
    [htmlFiles, htmlChecks],
  ]) {
    for (const file of candidates) {
      const content = readFileSync(join(extensionDir, file), 'utf8');
      for (const { label, pattern } of checks) {
        if (pattern.test(content)) {
          console.error(`FAIL ${extensionDir}/${file}: contains ${label}`);
          failed = true;
        }
      }
    }
  }

  console.log(`Scanned ${extensionDir} (${jsFiles.length} JS, ${htmlFiles.length} HTML files).`);
}

if (failed) {
  process.exit(1);
}
console.log('Extension bundle check passed.');
