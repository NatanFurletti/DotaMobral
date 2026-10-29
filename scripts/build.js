// Gera dist/DotaMobral.exe: o Node, o código, a interface e os sons num único arquivo.
// Usa o recurso oficial do Node "Single Executable Applications" (SEA).
// Uso: npm run build
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';
import { inject } from 'postject';
import { ROOT } from '../src/paths.js';

const DIST = path.join(ROOT, 'dist');
const EXE = path.join(DIST, 'DotaMobral.exe');
const rel = (p) => path.relative(ROOT, p);

// Arquivos embutidos no .exe (lidos em src/paths.js com readAsset).
const ASSETS = [
  'config/app.json',
  'config/timers.json',
  'config/timers-turbo.json',
  'ui/index.html',
  'sounds/bounty.wav',
  'sounds/power.wav',
  'sounds/water.wav',
  'sounds/wisdom.wav',
  'sounds/lotus.wav',
  'sounds/tormentor.wav',
];

// Remove a assinatura digital do node.exe copiado: ela deixa de valer depois da injeção,
// e um .exe com assinatura quebrada parece mais suspeito aos antivírus do que um sem assinatura.
function stripSignature(file) {
  const buf = readFileSync(file);
  const pe = buf.readUInt32LE(0x3c);
  const optional = pe + 24;
  const magic = buf.readUInt16LE(optional);
  const dataDirs = optional + (magic === 0x20b ? 112 : 96); // PE32+ ou PE32
  const securityEntry = dataDirs + 4 * 8; // IMAGE_DIRECTORY_ENTRY_SECURITY
  const offset = buf.readUInt32LE(securityEntry);
  const size = buf.readUInt32LE(securityEntry + 4);
  if (!offset || !size) return false;
  buf.writeUInt32LE(0, securityEntry);
  buf.writeUInt32LE(0, securityEntry + 4);
  const end = offset + size >= buf.length - 8 ? offset : buf.length; // certificado fica no fim do arquivo
  writeFileSync(file, buf.subarray(0, end));
  return true;
}

const major = Number(process.versions.node.split('.')[0]);
if (major < 22) {
  console.error(`Precisa do Node 22 ou mais novo para gerar o .exe (você tem ${process.version}).`);
  process.exit(1);
}

rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });

console.log('1/5 Juntando o código num arquivo só...');
const bundle = path.join(DIST, 'app.cjs');
await build({
  entryPoints: [path.join(ROOT, 'src', 'server.js')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: `node${major}`,
  outfile: bundle,
  logLevel: 'error',
  // import.meta.url só é usado fora do .exe (ver src/paths.js).
  logOverride: { 'empty-import-meta': 'silent' },
});

console.log('2/5 Preparando os arquivos embutidos...');
const seaConfig = path.join(DIST, 'sea-config.json');
const blob = path.join(DIST, 'sea-prep.blob');
writeFileSync(seaConfig, JSON.stringify({
  main: bundle,
  output: blob,
  disableExperimentalSEAWarning: true,
  useCodeCache: false,
  assets: Object.fromEntries(ASSETS.map((a) => [a, path.join(ROOT, a)])),
}, null, 2));
execFileSync(process.execPath, ['--experimental-sea-config', seaConfig], { stdio: 'inherit' });

console.log('3/5 Copiando o Node...');
copyFileSync(process.execPath, EXE);

console.log('4/5 Removendo a assinatura antiga...');
console.log(stripSignature(EXE) ? '    assinatura removida' : '    (não havia assinatura)');

console.log('5/5 Embutindo o app no executável...');
await inject(EXE, 'NODE_SEA_BLOB', readFileSync(blob), {
  sentinelFuse: 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2',
});

for (const f of [bundle, seaConfig, blob]) rmSync(f);
const mb = (statSync(EXE).size / 1024 / 1024).toFixed(1);
console.log(`\nPronto: ${rel(EXE)} (${mb} MB)`);
