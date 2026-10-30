// DotaMobral: recebe os dados do Dota 2 (Game State Integration), toca os avisos
// e serve a interface em http://127.0.0.1:<porta>/.
//
// Opções: --turbo / --normal (modo nesta execução), --record (grava os pacotes da GSI),
//         --mute (sem som, só texto), --no-ui (não abre o navegador)
import http from 'node:http';
import { spawn } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { appConfig } from './config.js';
import { DATA_DIR, ROOT, isSea, readAsset, soundPath } from './paths.js';
import { buildTimers, loadSettings, mergeSettings, saveSettings } from './settings.js';
import { TimerEngine, composeMessage, formatClock } from './timers.js';
import { createSpeaker } from './speaker.js';
import { LAUNCH_OPTION, clearGsiStatusCache, gsiStatus, installCfg } from './gsi-cfg.js';
import { queueTestSounds } from './sound-test.js';
import { LAST_CAPTURE_PNG } from './capture.js';
import { loadHeroes } from './heroes.js';
import { applyScenario, clearMatch, configureMatch, getMatchView, onGsi, scan, setMyPosition, setSlotHero } from './match.js';
import { ensureTemplates } from './templates.js';
import { getFarmView, updateFarm } from './farm.js';
import { readFileSync } from 'node:fs';

const VERSION = '0.3.0';
const args = new Set(process.argv.slice(2));
const mute = args.has('--mute');
const record = args.has('--record');
const openUi = !args.has('--no-ui') && !mute;
const { port } = appConfig;
const UI_URL = `http://127.0.0.1:${port}/`;

let settings = loadSettings();
if (args.has('--turbo')) settings.mode = 'turbo';
if (args.has('--normal')) settings.mode = 'normal';

const makeSpeaker = () => createSpeaker({ ...appConfig, volume: settings.volume, soundVolume: settings.soundVolume, mute });
let speaker = makeSpeaker();

const status = { lastPacket: 0, clock: null, gameState: null, lastAlert: null };

// --- Avisos -----------------------------------------------------------------

function existingSound(event) {
  const file = soundPath(event.sound);
  return file && existsSync(file) ? file : null;
}

function announce(alerts, clock) {
  const text = composeMessage(alerts);
  console.log(`[${formatClock(clock)}] ${text}`);
  status.lastAlert = { text, clock: formatClock(clock), at: Date.now() };
  // Cada evento: frase própria ('say'), som ('sound') ou, sem nenhum dos dois, a frase padrão.
  const withoutSound = [];
  for (const alert of alerts) {
    const file = existingSound(alert.event);
    if (alert.event.say) speaker.say(alert.event.say);
    else if (file) speaker.play(file);
    else withoutSound.push(alert);
  }
  if (withoutSound.length) speaker.say(composeMessage(withoutSound));
}

const engine = new TimerEngine(buildTimers(settings), announce);

configureMatch({ autoScan: () => settings.autoScan !== false, log: (msg) => console.log(msg) });

// --- GSI --------------------------------------------------------------------

let recorder = null;
if (record) {
  // No .exe grava em %APPDATA%\DotaMobral\logs; no projeto, em logs/ (fora do git).
  const dir = path.join(isSea ? DATA_DIR : ROOT, 'logs');
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `gsi-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`);
  recorder = createWriteStream(file);
  console.log(`Gravando pacotes em ${file}`);
}

function handleGsi(state) {
  if (state?.auth?.token !== appConfig.token) return;
  recorder?.write(`${JSON.stringify(state)}\n`);

  if (Date.now() - status.lastPacket > 40000) console.log('Dota 2 conectado.');
  status.lastPacket = Date.now();
  status.clock = typeof state.map?.clock_time === 'number' ? state.map.clock_time : null;
  const gameState = state.map?.game_state ?? null;
  const previousGameState = status.gameState;
  if (gameState !== status.gameState) {
    status.gameState = gameState;
    console.log(`Estado: ${gameState ?? 'fora de partida'}`);
  }
  engine.update(state);
  onGsi(state, previousGameState);
  updateFarm(state);
  getFarmView(settings.mode).then((v) => { farmView = v; }, () => {});
}

// --- Interface (API) ----------------------------------------------------------

const GAME_STATES = {
  DOTA_GAMERULES_STATE_HERO_SELECTION: 'Escolha de heróis',
  DOTA_GAMERULES_STATE_STRATEGY_TIME: 'Tempo de estratégia',
  DOTA_GAMERULES_STATE_PRE_GAME: 'Pré-jogo',
  DOTA_GAMERULES_STATE_GAME_IN_PROGRESS: 'Partida em andamento',
  DOTA_GAMERULES_STATE_POST_GAME: 'Fim de jogo',
};

let farmView = null;

function stateForUi() {
  const timers = buildTimers(settings);
  return {
    version: VERSION,
    status: {
      connected: Date.now() - status.lastPacket < 40000,
      clock: status.clock === null ? null : formatClock(status.clock),
      gameState: status.gameState ? (GAME_STATES[status.gameState] ?? status.gameState) : null,
      lastAlert: status.lastAlert,
    },
    settings: { mode: settings.mode, volume: settings.volume, soundVolume: settings.soundVolume, autoScan: settings.autoScan !== false },
    match: getMatchView(),
    farm: farmView,
    events: timers.events.map((e) => ({
      id: e.id,
      label: e.label,
      enabled: Boolean(e.enabled),
      lead: e.lead ?? timers.defaultLead,
      kind: e.say ? `voz: "${e.say}"` : e.sound ? 'som' : 'voz',
    })),
    gsi: { ...gsiStatus(), launchOptionText: LAUNCH_OPTION },
  };
}

function updateSettings(patch) {
  const before = settings;
  settings = mergeSettings(settings, patch);
  saveSettings(settings);
  engine.config = buildTimers(settings);
  if (settings.volume !== before.volume || settings.soundVolume !== before.soundVolume) {
    speaker.close();
    speaker = makeSpeaker();
  }
}

// --- HTTP -------------------------------------------------------------------

const ALLOWED_HOSTS = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
const ALLOWED_ORIGINS = new Set([`http://127.0.0.1:${port}`, `http://localhost:${port}`]);

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 2_000_000) req.destroy();
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function send(res, code, data, type = 'application/json; charset=utf-8') {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof data === 'string' || Buffer.isBuffer(data) ? data : JSON.stringify(data));
}

async function handleApi(req, res, route) {
  // Só a própria página pode chamar a API (bloqueia outros sites abertos no navegador).
  const origin = req.headers.origin;
  if (req.method === 'POST' && origin && !ALLOWED_ORIGINS.has(origin)) return send(res, 403, { error: 'origem' });

  if (req.method === 'GET' && route === '/api/state') return send(res, 200, stateForUi());
  if (req.method === 'GET' && route === '/api/heroes') {
    const heroes = await loadHeroes();
    return send(res, 200, heroes.list.map((h) => ({ id: h.id, label: h.label, icon: h.icon, img: h.img })));
  }
  if (req.method === 'GET' && route === '/api/match/capture.png') {
    try {
      return send(res, 200, readFileSync(LAST_CAPTURE_PNG), 'image/png');
    } catch {
      return send(res, 404, { error: 'ainda não há captura' });
    }
  }
  if (req.method !== 'POST') return send(res, 405, { error: 'método' });

  let body = {};
  try {
    const raw = await readBody(req);
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return send(res, 400, { error: 'json' });
  }

  switch (route) {
    case '/api/settings':
      updateSettings(body);
      return send(res, 200, stateForUi());
    case '/api/install-cfg': {
      const result = installCfg(appConfig, body.dir);
      clearGsiStatusCache();
      return send(res, 200, result);
    }
    case '/api/match/scan':
      return send(res, 200, await scan('manual'));
    case '/api/match/slot':
      return send(res, 200, await setSlotHero(Number(body.slot), body.heroId ? Number(body.heroId) : null));
    case '/api/match/position':
      return send(res, 200, await setMyPosition(body.pos ? Number(body.pos) : null));
    case '/api/match/scenario':
      return send(res, 200, await applyScenario(Number(body.index)));
    case '/api/match/clear':
      return send(res, 200, clearMatch());
    case '/api/test-sounds':
      queueTestSounds(speaker, buildTimers(settings));
      return send(res, 200, { ok: true });
    case '/api/quit':
      send(res, 200, { ok: true });
      setTimeout(shutdown, 200);
      return undefined;
    default:
      return send(res, 404, { error: 'rota' });
  }
}

const server = http.createServer(async (req, res) => {
  if (!ALLOWED_HOSTS.has(req.headers.host)) return send(res, 403, 'Acesso negado', 'text/plain; charset=utf-8');
  const route = new URL(req.url, UI_URL).pathname;

  try {
    if (route.startsWith('/api/')) return await handleApi(req, res, route);

    if (req.method === 'GET') {
      if (route === '/') return send(res, 200, readAsset('ui/index.html'), 'text/html; charset=utf-8');
      return send(res, 404, 'Não encontrado', 'text/plain; charset=utf-8');
    }

    // Qualquer outro POST é um pacote da GSI vindo do Dota.
    const raw = await readBody(req);
    send(res, 200, '', 'text/plain');
    try {
      handleGsi(JSON.parse(raw));
    } catch (err) {
      console.error('Pacote inválido:', err.message);
    }
  } catch (err) {
    console.error('Erro:', err.message);
    if (!res.headersSent) send(res, 500, { error: 'interno' });
  }
  return undefined;
});

function openBrowser() {
  if (!openUi || process.platform !== 'win32') return;
  spawn('rundll32', ['url.dll,FileProtocolHandler', UI_URL], { detached: true, stdio: 'ignore' }).unref();
}

let replacingOld = false;
server.on('error', async (err) => {
  if (err.code === 'EADDRINUSE') {
    // Já existe um DotaMobral aberto? Então só mostra a interface dele.
    try {
      const r = await fetch(`${UI_URL}api/state`);
      const other = r.ok ? await r.json().catch(() => null) : null;
      // Uma versão diferente está aberta (ex.: a antiga): fecha ela e assume o lugar.
      if (other?.version && other.version !== VERSION && !replacingOld) {
        replacingOld = true;
        console.log(`Fechando o DotaMobral ${other.version} que estava aberto...`);
        await fetch(`${UI_URL}api/quit`, { method: 'POST', body: '{}' }).catch(() => {});
        for (let i = 0; i < 20; i++) {
          await new Promise((resolve) => setTimeout(resolve, 250));
          const stillOpen = await fetch(`${UI_URL}api/state`).then(() => true, () => false);
          if (!stillOpen) break;
        }
        server.listen(port, '127.0.0.1');
        return;
      }
      if (other?.version) {
        console.log('O DotaMobral já está aberto. Abrindo a interface...');
        openBrowser();
        setTimeout(() => process.exit(0), 500);
        return;
      }
    } catch { /* não é o DotaMobral */ }
    console.error(`A porta ${port} já está em uso por outro programa.`);
    console.error('Feche-o ou mude "port" em config/app.json (e configure o Dota de novo).');
  } else {
    console.error('Erro no servidor:', err.message);
  }
  speaker.close();
  setTimeout(() => process.exit(1), isSea ? 8000 : 0);
});

server.listen(port, '127.0.0.1', () => {
  console.log('');
  console.log('  ==============================================');
  console.log(`   DotaMobral ${VERSION} - assistente de som para Dota 2`);
  console.log('  ==============================================');
  console.log(`   Modo: ${settings.mode.toUpperCase()}`);
  console.log(`   Interface: ${UI_URL}`);
  console.log('');
  console.log('   Mantenha esta janela aberta enquanto joga (pode minimizar).');
  console.log('   Para sair, feche esta janela ou use o botão "Sair" na interface.');
  console.log('');
  speaker.say(`Assistente de Dota pronto, modo ${settings.mode}`);
  openBrowser();
  // Deixa os retratos de referência prontos antes da partida (baixa só na primeira vez).
  ensureTemplates({ log: (msg) => console.log(`   ${msg}`) })
    .then((t) => console.log(`   Reconhecimento de heróis pronto (${t.length} retratos).`))
    .catch((err) => console.log(`   Reconhecimento de heróis indisponível agora: ${err.message}`));
});

function shutdown() {
  speaker.close();
  recorder?.end();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
