// Assembles the MV3 extension from the extension shell (extension/) and the
// Angular AOT production build: dist/extension/ for Chrome and
// dist/extension-firefox/ for Firefox, which differ only in the manifest.
// Pure copy — no shell or panel file is modified during assembly.
import { execSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const browserOut = join(root, 'dist/devtools-ui/browser');
const chromeOut = join(root, 'dist/extension');
const firefoxOut = join(root, 'dist/extension-firefox');

// Kept out of extension/manifest.json so Chrome shows no unknown-key warning.
const gecko = {
  id: 'devtools@native-federation.com',
  strict_min_version: '140.0',
  data_collection_permissions: { required: ['none'] },
};

// baseHref "./" so the panel's assets resolve relative to panel/index.html
// on the extension origin.
execSync('npx ng build devtools-ui --base-href ./', { cwd: root, stdio: 'inherit' });

function assemble(out) {
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  for (const file of ['manifest.json', 'devtools.html', 'devtools.js']) {
    cpSync(join(root, 'extension', file), join(out, file));
  }
  cpSync(join(root, 'extension/icons'), join(out, 'icons'), { recursive: true });
  cpSync(browserOut, join(out, 'panel'), { recursive: true });
}

assemble(chromeOut);
assemble(firefoxOut);

const manifest = JSON.parse(readFileSync(join(root, 'extension/manifest.json'), 'utf8'));
manifest.browser_specific_settings = { gecko };
writeFileSync(join(firefoxOut, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

execSync(`node ${JSON.stringify(join(root, 'scripts/check-panel-bundle.mjs'))}`, {
  cwd: root,
  stdio: 'inherit',
});

console.log(`\nExtension assembled at ${chromeOut} (Chrome) and ${firefoxOut} (Firefox)`);
