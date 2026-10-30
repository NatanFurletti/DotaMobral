// Estado da partida atual: quem são os 10 heróis, sua lane e as dicas.
//
// Regras de captura (fixas no código):
//  - automática: UMA vez por partida, no pré-jogo (com uma nova tentativa se falhar);
//  - manual: só quando você aperta "Ler heróis agora";
//  - sempre só a faixa da barra superior (nunca minimapa, nunca durante a luta).
import { analyzeLane, suggestItems } from './advice.js';
import { captureStrip } from './capture.js';
import { loadHeroes, matchups } from './heroes.js';
import { POSITION_NAMES, assignPositions, laneMatchup } from './lanes.js';
import { recognizeTopBar } from './recognize.js';
import { ensureTemplates } from './templates.js';

const PRE_GAME = 'DOTA_GAMERULES_STATE_PRE_GAME';
const AUTO_DELAYS_MS = [4000, 15000]; // primeira tentativa e nova tentativa

const empty = () => ({
  matchId: null,
  myHeroName: null,
  myTeam: null,
  slots: Array(10).fill(null), // 0-4 Radiant, 5-9 Dire: { heroId, confidence, manual }
  myPos: null, // escolhida por você (null = automática)
  autoAttempts: 0,
  scan: { status: 'aguardando', message: 'Os heróis são lidos automaticamente no pré-jogo.' },
  analysis: null,
  version: 0,
});

let state = empty();
let timers = [];
let scanning = false;
let options = { autoScan: () => true, log: () => {} };

export function configureMatch(opts) {
  options = { ...options, ...opts };
}

const bump = () => { state.version++; };

function resetMatch(matchId) {
  timers.forEach(clearTimeout);
  timers = [];
  const myPos = state.myPos;
  state = { ...empty(), matchId, myPos, version: state.version + 1 };
}

// Chamado a cada pacote da GSI.
export function onGsi(gsi, previousGameState) {
  const matchId = gsi.map?.matchid ?? null;
  if (matchId && matchId !== state.matchId) resetMatch(matchId);

  const heroName = gsi.hero?.name || null;
  if (heroName && heroName !== state.myHeroName) {
    state.myHeroName = heroName;
    bump();
  }
  const team = gsi.player?.team_name;
  if ((team === 'radiant' || team === 'dire') && team !== state.myTeam) {
    state.myTeam = team;
    bump();
  }

  const gameState = gsi.map?.game_state;
  if (gameState === PRE_GAME && previousGameState !== PRE_GAME && state.autoAttempts === 0 && options.autoScan()) {
    state.scan = { status: 'aguardando', message: 'Pré-jogo: lendo os heróis em instantes...' };
    bump();
    timers = AUTO_DELAYS_MS.map((delay, i) => setTimeout(() => {
      if (i > 0 && state.scan.status === 'pronto') return; // a primeira deu certo
      state.autoAttempts++;
      scan('automática').catch(() => {});
    }, delay));
  }
}

export async function scan(kind = 'manual') {
  if (scanning) return getMatchView();
  scanning = true;
  state.scan = { status: 'lendo', message: 'Lendo a barra superior...' };
  bump();
  try {
    const [heroes, templates] = await Promise.all([loadHeroes(), ensureTemplates({ log: options.log })]);
    const myShort = state.myHeroName ? heroes.byName.get(state.myHeroName)?.short : null;
    const strip = await captureStrip();
    const result = recognizeTopBar(strip, templates, { myHero: myShort, myTeam: state.myTeam });
    if (!result.ok) {
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
    state.analysis = {
      lane,
      me: { heroId: me.hero.id, pos: me.pos, posName: POSITION_NAMES[me.pos] },
      duo: duo && { heroId: duo.hero.id, pos: duo.pos },
      opponents: opponents.map((o) => ({ heroId: o.hero.id, pos: o.pos })),
      allies: allies.map((a) => ({ heroId: a.hero.id, pos: a.pos })),
      enemies: enemies.map((e) => ({ heroId: e.hero.id, pos: e.pos })),
      ...analyzeLane({ me, duo, opponents, enemies, myMatchups }),
      items: suggestItems({ me, opponents, enemies }),
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
