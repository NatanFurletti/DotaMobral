// Recebe os dados que o Dota 2 envia via Game State Integration e dispara os alertas.
import http from 'node:http';
import { createWriteStream, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { ROOT, appConfig, gameMode, timersConfig } from './config.js';
import { TimerEngine, composeMessage, formatClock } from './timers.js';
import { createSpeaker } from './speaker.js';

const args = new Set(process.argv.slice(2));
const mute = args.has('--mute');
const record = args.has('--record');

const speaker = createSpeaker({ ...appConfig, mute });
// Caminho absoluto do som do evento, ou null se não houver arquivo.
function soundFile(event) {
  if (!event.sound) return null;
  const file = path.resolve(ROOT, event.sound);
  return existsSync(file) ? file : null;
}

const engine = new TimerEngine(timersConfig, (alerts, clock) => {
  console.log(`[${formatClock(clock)}] ${composeMessage(alerts)}`);
  // Cada evento: frase própria ('say'), som ('sound') ou, sem nenhum dos dois, a frase padrão.
  const withoutSound = [];
  for (const alert of alerts) {
    const file = soundFile(alert.event);
    if (alert.event.say) speaker.say(alert.event.say);
    else if (file) speaker.play(file);
    else withoutSound.push(alert);
  }
  if (withoutSound.length) speaker.say(composeMessage(withoutSound));
});

for (const event of timersConfig.events) {
  if (event.enabled && !event.say && event.sound && !soundFile(event)) {
    console.warn(`Som não encontrado para "${event.label}" (${event.sound}): vai usar a voz.`);
  }
}

// --record grava cada pacote recebido, para ver o que a GSI realmente manda.
let recorder = null;
if (record) {
  const dir = path.join(ROOT, 'logs');
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `gsi-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`);
  recorder = createWriteStream(file);
  console.log(`Gravando pacotes em ${file}`);
}

let connected = false;
let lastGameState = null;

function handleState(state) {
  if (state?.auth?.token !== appConfig.token) return;
  recorder?.write(`${JSON.stringify(state)}\n`);

  if (!connected) {
    connected = true;
    console.log('Dota 2 conectado.');
  }
  const gameState = state.map?.game_state ?? 'fora de partida';
  if (gameState !== lastGameState) {
    lastGameState = gameState;
    console.log(`Estado: ${gameState}`);
  }
  engine.update(state);
}

const server = http.createServer((req, res) => {
  if (req.method !== 'POST') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Assistente de Dota rodando.');
    return;
  }
  let body = '';
  req.setEncoding('utf8');
  req.on('data', (chunk) => { body += chunk; });
  req.on('end', () => {
    res.writeHead(200);
    res.end();
    try {
      handleState(JSON.parse(body));
    } catch (err) {
      console.error('Pacote inválido:', err.message);
    }
  });
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`A porta ${appConfig.port} já está em uso: provavelmente o assistente já está aberto em outro terminal.`);
    console.error('Feche o outro (Ctrl+C) ou mude "port" em config/app.json (e rode npm run install-cfg de novo).');
  } else {
    console.error('Erro no servidor:', err.message);
  }
  speaker.close();
  process.exit(1);
});

server.listen(appConfig.port, '127.0.0.1', () => {
  console.log(`Modo: ${gameMode.toUpperCase()}`);
  console.log(`Ouvindo a GSI em http://127.0.0.1:${appConfig.port}/  (Ctrl+C para sair)`);
  speaker.say(`Assistente de Dota pronto, modo ${gameMode}`);
});

function shutdown() {
  speaker.close();
  recorder?.end();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
