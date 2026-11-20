// Copies the Stockfish web-worker build from node_modules into public/stockfish,
// patching the wasm loader so it does not depend on the server's MIME type.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'node_modules', 'stockfish', 'bin');
const out = path.join(root, 'public', 'stockfish');

const STREAMING = '.then(function(t){return WebAssembly.instantiateStreaming(t,e)})';
const BUFFERED =
  '.then(function(t){return t.arrayBuffer()}).then(function(b){return WebAssembly.instantiate(b,e)})';

fs.mkdirSync(out, { recursive: true });

const lite = fs.readFileSync(path.join(src, 'stockfish-19-lite-single.js'), 'utf8');
if (!lite.includes(STREAMING)) {
  throw new Error('copy-stockfish: patch target not found, check the stockfish package version.');
}
fs.writeFileSync(path.join(out, 'sf.js'), lite.replace(STREAMING, BUFFERED));
fs.copyFileSync(path.join(src, 'stockfish-19-lite-single.wasm'), path.join(out, 'sf.wasm'));
fs.copyFileSync(path.join(src, 'stockfish-19-asm.js'), path.join(out, 'sf-asm.js'));

console.log('copy-stockfish: engine files ready in public/stockfish');
