// Estado da partida atual: quem são os 10 heróis, sua lane e as dicas.
//
// Regras de captura (fixas no código):
//  - automática: no tempo de estratégia (o draft já terminou e os 10 heróis estão na tela);
//    se não der certo, no pré-jogo (com uma nova tentativa). Nunca durante a escolha de heróis;
//  - manual: só quando você aperta "Ler heróis agora";
//  - sempre só a faixa da barra superior (nunca minimapa, nunca durante a luta).
import { analyzeLane } from './advice.js';
import { buildGuide } from './buildguide.js';
import { captureStrip } from './capture.js';
import { loadHeroes, matchups } from './heroes.js';
import { POSITION_NAMES, assignPositions, laneMatchup } from './lanes.js';
import { LAYOUTS, recognizeTopBar } from './recognize.js';
import { ensureTemplates } from './templates.js';

const HERO_SELECTION = 'DOTA_GAMERULES_STATE_HERO_SELECTION';
const STRATEGY = 'DOTA_GAMERULES_STATE_STRATEGY_TIME';
const PRE_GAME = 'DOTA_GAMERULES_STATE_PRE_GAME';
const STRATEGY_DELAY_MS = 2500; // espera a tela de estratégia aparecer
const PRE_GAME_DELAYS_MS = [4000, 15000]; // primeira tentativa e nova tentativa

const empty = () => ({
  matchId: null,
  myHeroName: null,
  myTeam: null,
  slots: Array(10).fill(null), // 0-4 Radiant, 5-9 Dire: { heroId, confidence, manual }
  myPos: null, // escolhida por você (null = automática)
  gameState: null,
  auto: { strategy: false, preGame: false },
  scan: { status: 'aguardando', message: 'Os heróis são lidos automaticamente no tempo de estratégia.' },
  analysis: null,
  version: 0,
});

let state = empty();
let timers = [];
let scanning = false;
// Captura do tempo de estratégia que não deu para ler (ainda sem calibração):
// usada para calibrar essa barra assim que a leitura do pré-jogo der certo.
let pendingStrategyStrip = null;
let options = { autoScan: () => true, log: () => {} };

export function configureMatch(opts) {
  options = { ...options, ...opts };
}

const bump = () => { state.version++; };

function resetMatch(matchId) {
  timers.forEach(clearTimeout);
  timers = [];
  const myPos = state.myPos;
  // Se a partida anterior não tinha id (a GSI pode mandar o id só depois), é a mesma partida.
  const sameMatch = state.matchId === null;
  if (!sameMatch) pendingStrategyStrip = null;
  const keep = sameMatch ? { auto: state.auto, slots: state.slots, scan: state.scan, myHeroName: state.myHeroName, myTeam: state.myTeam } : {};
  state = { ...empty(), ...keep, matchId, myPos, version: state.version + 1 };
}

// Chamado a cada pacote da GSI.
export function onGsi(gsi, previousGameState) {
  const matchId = gsi.map?.matchid ?? null;
  if (matchId && matchId !== state.matchId) resetMatch(matchId);

  const heroName = gsi.hero?.name || null;
  if (heroName && heroName !== state.myHeroName) {
    state.myHeroName = heroName;
    bump();
    // Heróis já lidos antes de a GSI informar o seu: agora dá para montar a análise.
    if (state.slots.every(Boolean)) analyze().catch(() => {});
  }
  const team = gsi.player?.team_name;
  if ((team === 'radiant' || team === 'dire') && team !== state.myTeam) {
    state.myTeam = team;
    bump();
  }

  const gameState = gsi.map?.game_state;
  state.gameState = gameState ?? null;
  const entered = (s) => gameState === s && previousGameState !== s;
  if (!options.autoScan()) return;

  if (entered(STRATEGY) && !state.auto.strategy) {
    state.auto.strategy = true;
    state.scan = { status: 'aguardando', message: 'Tempo de estratégia: lendo os heróis em instantes...' };
    bump();
    timers.push(setTimeout(() => scan('tempo de estratégia', 'strategy').catch(() => {}), STRATEGY_DELAY_MS));
  }

  // Reserva: se não leu no tempo de estratégia, tenta no pré-jogo.
  if (entered(PRE_GAME) && !state.auto.preGame && state.scan.status !== 'pronto') {
    state.auto.preGame = true;
    state.scan = { status: 'aguardando', message: 'Pré-jogo: lendo os heróis em instantes...' };
    bump();
    PRE_GAME_DELAYS_MS.forEach((delay) => timers.push(setTimeout(() => {
      if (state.scan.status === 'pronto') return;
      scan('pré-jogo', 'ingame').catch(() => {});
    }, delay)));
  }
}

// Calibra a barra de estratégia com uma captura guardada, usando os heróis já confirmados.
function calibrateStrategyLater(templates, myShort) {
  const strip = pendingStrategyStrip;
  pendingStrategyStrip = null;
  if (!strip || !myShort) return;
  const res = recognizeTopBar(strip, templates, { myHero: myShort, myTeam: state.myTeam, layout: 'strategy' });
  options.log(res.ok
    ? 'Barra do tempo de estratégia calibrada: nas próximas partidas os heróis serão lidos mais cedo.'
    : `Ainda não deu para calibrar a barra de estratégia: ${res.reason}`);
}

export async function scan(kind = 'manual', layoutName = null) {
  // Durante a escolha de heróis o draft ainda não terminou: nunca lê.
  if (state.gameState === HERO_SELECTION) {
    state.scan = { status: 'aguardando', message: 'A escolha de heróis ainda não terminou. A leitura acontece no tempo de estratégia.' };
    bump();
    return getMatchView();
  }
  // Manual: usa a barra da tela atual.
  const layout = layoutName ?? (state.gameState === STRATEGY ? 'strategy' : 'ingame');
  if (scanning) return getMatchView();
  scanning = true;
  state.scan = { status: 'lendo', message: 'Lendo a barra superior...' };
  bump();
  try {
    const [heroes, templates] = await Promise.all([loadHeroes(), ensureTemplates({ log: options.log })]);
    const myShort = state.myHeroName ? heroes.byName.get(state.myHeroName)?.short : null;
    // DOTAMOBRAL_TEST_IMAGE(_STRATEGY): imagem no lugar da tela, só para testes de desenvolvimento.
    const testImage = process.env[`DOTAMOBRAL_TEST_IMAGE${layout === 'strategy' ? '_STRATEGY' : ''}`];
    const strip = await captureStrip({ fraction: LAYOUTS[layout].strip, ...(testImage && { file: testImage }) });
    const result = recognizeTopBar(strip, templates, { myHero: myShort, myTeam: state.myTeam, layout });
    if (!result.ok) {
      if (layout === 'strategy') {
        pendingStrategyStrip = strip;
        state.scan = { status: 'aguardando', message: 'No tempo de estratégia ainda não deu; vou ler no pré-jogo.', at: Date.now(), kind };
        options.log(`Leitura no tempo de estratégia falhou (${result.reason}); tentando no pré-jogo.`);
        return getMatchView();
      }
      state.scan = { status: 'erro', message: result.reason, at: Date.now(), kind };
      options.log(`Leitura de heróis (${kind}) falhou: ${result.reason}`);
      return getMatchView();
    }
    result.slots.forEach((s, i) => {
      if (state.slots[i]?.manual) return; // não sobrescreve correções suas
      const hero = s && heroes.byShort.get(s.short);
      state.slots[i] = hero ? { heroId: hero.id, confidence: s.confidence, manual: false } : null;
    });
    state.scan = { status: 'pronto', message: `Heróis lidos (${kind}, ${result.how}).`, at: Date.now(), kind };
    options.log(`Heróis lidos (${kind}): ${result.slots.map((s) => s?.short ?? '?').join(', ')}`);
    if (layout === 'ingame') calibrateStrategyLater(templates, myShort);
    await analyze();
  } catch (err) {
    state.scan = { status: 'erro', message: `Não deu para ler os heróis: ${err.message}`, at: Date.now(), kind };
    options.log(state.scan.message);
  } finally {
    scanning = false;
    bump();
  }
  return getMatchView();
}

export async function setSlotHero(slot, heroId) {
  if (!(slot >= 0 && slot < 10)) return getMatchView();
  state.slots[slot] = heroId ? { heroId: Number(heroId), confidence: 'manual', manual: true } : null;
  bump();
  await analyze();
  return getMatchView();
}

export async function setMyPosition(pos) {
  state.myPos = pos >= 1 && pos <= 5 ? Number(pos) : null;
  bump();
  await analyze();
  return getMatchView();
}

export function clearMatch() {
  resetMatch(state.matchId);
  return getMatchView();
}

async function analyze() {
  const heroes = await loadHeroes();
  const filled = state.slots.map((s) => (s ? heroes.byId.get(s.heroId) : null));
  const myHero = state.myHeroName ? heroes.byName.get(state.myHeroName) : null;
  let myTeamIdx = state.myTeam === 'radiant' ? 0 : state.myTeam === 'dire' ? 1 : null;
  if (myTeamIdx === null && myHero) {
    const at = filled.findIndex((h) => h?.id === myHero.id);
    if (at >= 0) myTeamIdx = at < 5 ? 0 : 1;
  }
  const teams = [filled.slice(0, 5), filled.slice(5, 10)];
  if (myTeamIdx === null || !myHero || teams.some((t) => t.some((h) => !h))) {
    state.analysis = null;
    return;
  }
  try {
    const fixed = state.myPos ? { [myHero.id]: state.myPos } : {};
    const [allies, enemies] = await Promise.all([
      assignPositions(teams[myTeamIdx], fixed),
      assignPositions(teams[1 - myTeamIdx]),
    ]);
    const me = allies.find((a) => a.hero.id === myHero.id);
    if (!me) {
      state.analysis = null;
      return;
    }
    const { lane, duo, opponents } = laneMatchup(me, allies, enemies);
    let myMatchups = null;
    try {
      myMatchups = await matchups(myHero.id);
    } catch { /* sem internet: segue só com as regras */ }
    let build = null;
    try {
      build = await buildGuide({ me, opponents, enemies });
    } catch (err) {
      options.log(`Build indisponível agora: ${err.message}`);
    }
    state.analysis = {
      lane,
      me: { heroId: me.hero.id, pos: me.pos, posName: POSITION_NAMES[me.pos] },
      duo: duo && { heroId: duo.hero.id, pos: duo.pos },
      opponents: opponents.map((o) => ({ heroId: o.hero.id, pos: o.pos })),
      allies: allies.map((a) => ({ heroId: a.hero.id, pos: a.pos })),
      enemies: enemies.map((e) => ({ heroId: e.hero.id, pos: e.pos })),
      ...analyzeLane({ me, duo, opponents, enemies, myMatchups }),
      build,
      side: myTeamIdx === 0 ? 'Radiant' : 'Dire',
    };
  } catch (err) {
    options.log(`Análise da lane falhou: ${err.message}`);
    state.analysis = null;
  } finally {
    bump();
  }
}

export function getMatchView() {
  return {
    version: state.version,
    myHeroName: state.myHeroName,
    myTeam: state.myTeam,
    myPos: state.myPos,
    scan: state.scan,
    slots: state.slots,
    analysis: state.analysis,
  };
}
