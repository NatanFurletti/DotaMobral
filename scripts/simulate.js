// Simula o Dota 2 enviando pacotes GSI, para testar sem abrir o jogo.
// Uso: npm run simulate -- --from=-20 --to=480 --speed=10
//      (speed = segundos de jogo por segundo real)
//      --hero=juggernaut --team=radiant  (opcional: seu herói e time, como a GSI envia)
//      --strategy=8  (opcional: segundos de tempo de estratégia antes do pré-jogo)
//      --heroLate=1  (opcional: só manda o herói depois do tempo de estratégia)
import { appConfig } from '../src/config.js';

const opt = Object.fromEntries(
  process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => {
    const [k, v] = a.slice(2).split('=');
    return [k, Number.isNaN(Number(v)) ? v : Number(v)];
  }),
);
const from = opt.from ?? -20;
const to = opt.to ?? 480;
const speed = opt.speed ?? 10;
const extra = {
  ...(opt.hero && { hero: { name: `npc_dota_hero_${opt.hero}`, level: 1, alive: true } }),
  ...((opt.team || opt.gpm) && { player: { team_name: opt.team, gpm: opt.gpm } }),
};
const url = `http://127.0.0.1:${appConfig.port}/`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

console.log(`Simulando de ${from}s até ${to}s em ${speed}x -> ${url}`);
for (let i = 0; i < (opt.strategy ?? 0); i++) {
  const { hero, ...rest } = extra;
  const state = {
    map: { name: 'start', matchid: 'simulacao-1', clock_time: from, game_state: 'DOTA_GAMERULES_STATE_STRATEGY_TIME', paused: false },
    ...(opt.heroLate ? rest : extra),
    auth: { token: appConfig.token },
  };
  await fetch(url, { method: 'POST', body: JSON.stringify(state), headers: { 'Content-Type': 'application/json' } }).catch(() => process.exit(1));
  await sleep(1000);
}
for (let clock = from; clock <= to; clock++) {
  const state = {
    provider: { name: 'Dota 2', appid: 570, version: 47, timestamp: Math.floor(Date.now() / 1000) },
    map: {
      name: 'start',
      matchid: 'simulacao-1',
      game_time: clock + 90,
      clock_time: clock,
      daytime: Math.floor(Math.max(clock, 0) / 300) % 2 === 0,
      game_state: clock < 0 ? 'DOTA_GAMERULES_STATE_PRE_GAME' : 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS',
      paused: false,
    },
    ...extra,
    auth: { token: appConfig.token },
  };
  try {
    await fetch(url, { method: 'POST', body: JSON.stringify(state), headers: { 'Content-Type': 'application/json' } });
  } catch {
    console.error('Servidor não está rodando. Abra outro terminal e rode: npm start');
    process.exit(1);
  }
  await sleep(1000 / speed);
}
console.log('Simulação terminou.');
