// Instala o arquivo da Game State Integration na pasta do Dota e verifica a configuração.
// Só lê arquivos da Steam; nunca altera as configurações da Steam.
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const CFG_NAME = 'gamestate_integration_dota_assistente.cfg';
export const LAUNCH_OPTION = '-gamestateintegration';

// Pede todos os blocos; o que o jogo realmente envia depende do modo (jogador/espectador).
const DATA_BLOCKS = [
  'provider', 'map', 'player', 'hero', 'abilities', 'items', 'buildings', 'draft',
  'wearables', 'events', 'minimap', 'roshan', 'couriers', 'neutralitems', 'league',
];

export function buildCfg({ port, token }) {
  return `"Dota Assistente"
{
    "uri"        "http://127.0.0.1:${port}/"
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
        "token" "${token}"
    }
}
`;
}

export function steamRoot() {
  try {
    const out = execSync('reg query "HKCU\\Software\\Valve\\Steam" /v SteamPath', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
    });
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

const isDotaDir = (dir) => Boolean(dir) && existsSync(path.join(dir, 'game', 'dota'));

export function findDotaDir() {
  for (const lib of steamLibraries(steamRoot())) {
    const dir = path.join(lib, 'steamapps', 'common', 'dota 2 beta');
    if (isDotaDir(dir)) return dir;
  }
  return null;
}

const cfgFile = (dotaDir) => path.join(dotaDir, 'game', 'dota', 'cfg', 'gamestate_integration', CFG_NAME);

// Cria (ou atualiza) o arquivo. `dir` é opcional: a pasta "dota 2 beta" escolhida pelo usuário.
export function installCfg(appConfig, dir) {
  let dotaDir = dir ? path.normalize(dir.trim().replace(/^"|"$/g, '')) : findDotaDir();
  // Aceita também caminhos colados de dentro da pasta do jogo.
  if (dotaDir && !isDotaDir(dotaDir)) {
    const idx = dotaDir.toLowerCase().indexOf('dota 2 beta');
    if (idx >= 0) dotaDir = dotaDir.slice(0, idx + 'dota 2 beta'.length);
  }
  if (!isDotaDir(dotaDir)) {
    return { ok: false, error: 'Não encontrei a pasta do Dota 2.' };
  }
  const file = cfgFile(dotaDir);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, buildCfg(appConfig), 'utf8');
  return { ok: true, file, dotaDir };
}

// Procura "-gamestateintegration" nas opções de inicialização do Dota (app 570)
// nos arquivos localconfig.vdf de cada conta da Steam. true / false / null (não deu para saber).
function launchOptionSet(root) {
  let found = null;
  let accounts = [];
  try {
    accounts = readdirSync(path.join(root, 'userdata'));
  } catch {
    return null;
  }
  for (const account of accounts) {
    let text;
    try {
      text = readFileSync(path.join(root, 'userdata', account, 'config', 'localconfig.vdf'), 'utf8');
    } catch {
      continue;
    }
    for (const m of text.matchAll(/"570"\s*\{/g)) {
      // Recorta o bloco do app 570 contando chaves.
      let depth = 1;
      let i = m.index + m[0].length;
      const start = i;
      while (i < text.length && depth > 0) {
        if (text[i] === '{') depth++;
        else if (text[i] === '}') depth--;
        i++;
      }
      const block = text.slice(start, i);
      const opt = block.match(/"LaunchOptions"\s+"((?:[^"\\]|\\.)*)"/i);
      if (opt) {
        if (opt[1].toLowerCase().includes(LAUNCH_OPTION)) return true;
        found = false;
      }
    }
    if (found === null) found = false;
  }
  return found;
}

let cache = { at: 0, value: null };
export function gsiStatus() {
  if (Date.now() - cache.at < 5000) return cache.value;
  const dotaDir = findDotaDir();
  const value = {
    dotaDir,
    cfgInstalled: Boolean(dotaDir) && existsSync(cfgFile(dotaDir)),
    launchOption: launchOptionSet(steamRoot()),
  };
  cache = { at: Date.now(), value };
  return value;
}

export function clearGsiStatusCache() {
  cache = { at: 0, value: null };
}
