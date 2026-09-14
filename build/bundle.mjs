#!/usr/bin/env node
/**
 * Zero-dependency bundler for Wipe Check.
 *
 * Modules share one scope in the output, so bundling is: walk the import graph
 * from src/main.js, emit each module after the ones it imports, strip the
 * import/export lines, concatenate, and inline the CSS and favicon.
 *
 * Two modules importing each other is allowed. They only call each other's
 * functions at runtime, and function declarations hoist within the shared
 * scope. What is NOT allowed is two modules declaring the same top-level name
 * -- the build fails loudly on that below.
 *
 *   node build/bundle.mjs             ->  dist/wipe-check.html
 *   node build/bundle.mjs --out FILE  ->  FILE
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENTRY = resolve(ROOT, 'src/main.js');
const argOut = process.argv.indexOf('--out');
const OUT = resolve(ROOT, argOut > -1 ? process.argv[argOut + 1] : 'dist/wipe-check.html');

/* import/export blocks may wrap across lines, so match on the joined source
   rather than line by line. */
const IMPORT_RE = /^import\s*\{([\s\S]*?)\}\s*from\s*['"]([^'"]+)['"];?[ \t]*$/;
const EXPORT_RE = /^export\s*\{[\s\S]*?\};?[ \t]*$/;

const modules = new Map();
const order = [];
const visiting = new Set();
const backEdges = [];

function load(file) {
  if (modules.has(file)) return;
  if (visiting.has(file)) { backEdges.push(relative(ROOT, file)); return; }
  visiting.add(file);

  const body = [];
  const deps = [];
  const lines = readFileSync(file, 'utf8').split('\n');
  for (let i = 0; i < lines.length; i++) {
    let stmt = lines[i];
    /* an import or export block that opens here but closes further down */
    if (/^\s*(import|export)\s*\{/.test(stmt) && !stmt.includes('}')) {
      let j = i;
      while (j + 1 < lines.length && !lines[j].includes('}')) stmt += '\n' + lines[++j];
      const imp = stmt.match(IMPORT_RE);
      if (imp) {
        const dep = resolve(dirname(file), imp[2]);
        deps.push(dep); load(dep); i = j; continue;
      }
      if (EXPORT_RE.test(stmt)) { i = j; continue; }
    }
    const imp = stmt.match(IMPORT_RE);
    if (imp) {
      const dep = resolve(dirname(file), imp[2]);
      deps.push(dep); load(dep); continue;
    }
    if (EXPORT_RE.test(stmt)) continue;
    body.push(stmt);
  }

  visiting.delete(file);
  modules.set(file, { code: body.join('\n').trim(), deps });
  order.push(file);                       // dependencies land before dependants
}
load(ENTRY);

/* one shared scope -> top-level names must be unique */
const DECL_RE = /^(?:function|var|let|const)\s+([A-Za-z_$][\w$]*)/;
const seen = new Map();
for (const file of order) {
  for (const line of modules.get(file).code.split('\n')) {
    const m = line.match(DECL_RE);
    if (!m) continue;
    if (seen.has(m[1])) {
      throw new Error(
        `"${m[1]}" is declared in both ${seen.get(m[1])} and ${relative(ROOT, file)}.\n` +
        `Bundled modules share one scope, so top-level names must be unique.`);
    }
    seen.set(m[1], relative(ROOT, file));
  }
}

const script = order
  .map((f) => `\n/* ---------- ${relative(ROOT, f)} ---------- */\n` + modules.get(f).code)
  .join('\n');

const css = readFileSync(resolve(ROOT, 'styles/game.css'), 'utf8').trim();
const favicon = 'data:image/svg+xml,' +
  encodeURIComponent(readFileSync(resolve(ROOT, 'assets/favicon.svg'), 'utf8'));

const html = readFileSync(resolve(ROOT, 'index.html'), 'utf8');
let markup = html.slice(html.indexOf('<body>') + 6, html.lastIndexOf('<script')).trim();
/* the one vendored library rides inline in the single file */
markup = markup.replace(/<script src="vendor\/peerjs\.min\.js"><\/script>\s*/g, '').trim();
/* a build stamp on the menu, so anyone can tell which version a page is running */
const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
markup = markup.replace('>dev build<', '>build ' + stamp + '<');
const vendor = readFileSync(resolve(ROOT, 'vendor/peerjs.min.js'), 'utf8').trim();

const out = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Wipe Check</title>
<meta name="description" content="A three-role party roguelite. Tank, DPS and healer against endless waves, with a real threat table.">
<meta name="theme-color" content="#0E1017">
<link rel="icon" href="${favicon}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Semi+Condensed:wght@400;500;600;700&family=Cinzel:wght@600;800&display=swap">
<style>
${css}
</style>
</head>
<body>
${markup}
<script>/* PeerJS 1.5.4 (MIT) -- vendor/peerjs.min.js */
${vendor}
</script>
<script>
(function(){
"use strict";
${script}
})();
</script>
</body>
</html>
`;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, out);

console.log(`bundled ${order.length} modules -> ${relative(ROOT, OUT)} (${(out.length / 1024).toFixed(1)} KB)`);
for (const f of order) {
  const n = modules.get(f).code.split('\n').length;
  console.log(`  ${relative(ROOT, f).padEnd(26)} ${String(n).padStart(4)} lines`);
}
if (backEdges.length) {
  console.log(`  (${new Set(backEdges).size} import cycle(s), resolved by hoisting: ${[...new Set(backEdges)].join(', ')})`);
}
