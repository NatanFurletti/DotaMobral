// Encontra a pasta do Dota 2 e cria o arquivo de configuração da GSI.
// Uso: npm run install-cfg              (procura sozinho)
//      npm run install-cfg -- --dir="D:\SteamLibrary\steamapps\common\dota 2 beta"
//      npm run install-cfg -- --print    (só mostra o conteúdo)
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { appConfig } from '../src/config.js';

const FILE_NAME = 'gamestate_integration_dota_assistente.cfg';

// Pede todos os blocos; o que o jogo realmente envia depende do modo (jogador/espectador).
const DATA_BLOCKS = [
  'provider', 'map', 'player', 'hero', 'abilities', 'items', 'buildings', 'draft',
  'wearables', 'events', 'minimap', 'roshan', 'couriers', 'neutralitems', 'league',
];

const cfg = `"Dota Assistente"
{
    "uri"        "http://127.0.0.1:${appConfig.port}/"
    "timeout"    "5.0"
    "buffer"     "0.1"
    "throttle"   "0.5"
    "heartbeat"  "30.0"
    "data"
    {
${DATA_BLOCKS.map((b) => `        "${b}" "1"`).join('\n')}
    }
    "auth"
    {
        "token" "${appConfig.token}"
    }
}
`;

function steamRoot() {
  try {
    const out = execSync('reg query "HKCU\\Software\\Valve\\Steam" /v SteamPath', { encoding: 'utf8' });
    const match = out.match(/SteamPath\s+REG_SZ\s+(.+)/);
    if (match) return path.normalize(match[1].trim());
  } catch { /* sem registro: usa o padrão */ }
  return 'C:\\Program Files (x86)\\Steam';
}

function steamLibraries(root) {
  const libs = [root];
  try {
    const vdf = readFileSync(path.join(root, 'steamapps', 'libraryfolders.vdf'), 'utf8');
    for (const m of vdf.matchAll(/"path"\s+"([^"]+)"/g)) libs.push(m[1].replace(/\\\\/g, '\\'));
  } catch { /* sem bibliotecas extras */ }
  return [...new Set(libs.map((p) => path.normalize(p)))];
}

function findDotaDir() {
  for (const lib of steamLibraries(steamRoot())) {
    const dir = path.join(lib, 'steamapps', 'common', 'dota 2 beta');
    if (existsSync(path.join(dir, 'game', 'dota'))) return dir;
  }
  return null;
}

const argv = process.argv.slice(2);
if (argv.includes('--print')) {
  console.log(cfg);
  process.exit(0);
}

const dirArg = argv.find((a) => a.startsWith('--dir='))?.slice('--dir='.length).replace(/^"|"$/g, '');
const dotaDir = dirArg || findDotaDir();
if (!dotaDir || !existsSync(path.join(dotaDir, 'game', 'dota'))) {
  console.error('Não encontrei a pasta do Dota 2. Rode de novo com --dir="...\\steamapps\\common\\dota 2 beta"');
  process.exit(1);
}

const target = path.join(dotaDir, 'game', 'dota', 'cfg', 'gamestate_integration');
mkdirSync(target, { recursive: true });
writeFileSync(path.join(target, FILE_NAME), cfg, 'utf8');

console.log(`Arquivo criado: ${path.join(target, FILE_NAME)}`);
console.log('\nÚltimo passo (uma vez só): na Steam, clique com o botão direito em Dota 2 > Propriedades >');
console.log('Opções de inicialização, e adicione:  -gamestateintegration');
console.log('Depois reinicie o Dota 2.');
