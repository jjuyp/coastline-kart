import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
let esbuild;
try {
  esbuild = require('esbuild');
} catch {
  esbuild = require('../../tidepool-jelly/node_modules/esbuild');
}
const result = await esbuild.build({
  entryPoints: [path.join(root, 'src/main.js')],
  nodePaths: [
    path.join(root, 'node_modules'),
    path.resolve(root, '../tidepool-jelly/node_modules'),
  ],
  bundle: true,
  write: false,
  format: 'iife',
  target: 'es2020',
  minify: true,
  legalComments: 'inline',
});
let html = readFileSync(path.join(root, 'index.html'), 'utf8');
const css = ['style.css', 'controls.css']
  .map((name) => readFileSync(path.join(root, 'src', name), 'utf8'))
  .join('\n');
html = html
  .replace('<!--STYLE-->', () => '<style>' + css + '</style>')
  .replace(
    '<!--SCRIPT-->',
    () =>
      '<script>' + result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script') + '</script>',
  );
mkdirSync(path.join(root, 'dist'), { recursive: true });
writeFileSync(path.join(root, 'dist/index.html'), html);
mkdirSync(path.join(root, 'docs'), { recursive: true });
writeFileSync(path.join(root, 'docs/index.html'), html);
writeFileSync(path.join(root, 'docs/.nojekyll'), '');
writeFileSync(path.join(root, 'Coastline-Kart.html'), html);
console.log(JSON.stringify({ built: true, bytes: Buffer.byteLength(html), externalAssets: 0 }));
