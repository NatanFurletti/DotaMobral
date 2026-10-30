// Estima a posição (1 a 5) de cada herói e quem enfrenta quem na lane.
// Base: em qual lane cada herói costuma jogar (OpenDota) + se é núcleo ou suporte.
import { laneShares } from './heroes.js';

export const POSITION_NAMES = {
  1: 'pos 1 (safe lane)',
  2: 'pos 2 (mid)',
  3: 'pos 3 (offlane)',
  4: 'pos 4 (suporte da offlane)',
  5: 'pos 5 (suporte da safe lane)',
};
const LANE_OF = { 1: 'safe', 5: 'safe', 2: 'mid', 3: 'off', 4: 'off' };
const PARTNER = { 1: 5, 5: 1, 3: 4, 4: 3, 2: null };
// A safe lane de um time enfrenta a offlane do outro.
const ENEMY_POSITIONS = { safe: [3, 4], off: [1, 5], mid: [2] };

function permutations(items) {
  if (items.length <= 1) return [items];
  return items.flatMap((item, i) => permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((p) => [item, ...p]));
}

// Chance relativa de cada herói jogar em cada posição.
function positionWeights(hero, lanes) {
  const support = hero.roles.includes('Support');
  const carry = hero.roles.includes('Carry');
  const core = carry ? 1 : support ? 0.3 : 0.7;
  const sup = support ? 1 : carry ? 0.1 : 0.35;
  const e = 0.02;
  return {
    1: (lanes.safe + e) * core,
    2: (lanes.mid + e) * (support ? 0.25 : 1),
    3: (lanes.off + e) * core,
    4: (lanes.off + e) * sup,
    5: (lanes.safe + e) * sup,
  };
}

// Distribui as posições 1-5 entre 5 heróis da forma mais provável.
// fixed: { heroId: posição } para posições já conhecidas (ex.: a que você escolheu).
export async function assignPositions(team, fixed = {}) {
  const weights = await Promise.all(team.map(async (hero) => {
    try {
      return positionWeights(hero, await laneShares(hero.id));
    } catch {
      return positionWeights(hero, { safe: 0.34, mid: 0.33, off: 0.33 });
    }
  }));
  let best = { score: -Infinity, perm: [1, 2, 3, 4, 5] };
  for (const perm of permutations([1, 2, 3, 4, 5])) {
    if (team.some((h, i) => fixed[h.id] && fixed[h.id] !== perm[i])) continue;
    const score = perm.reduce((s, pos, i) => s + Math.log(weights[i][pos]), 0);
    if (score > best.score) best = { score, perm };
  }
  return team.map((hero, i) => ({ hero, pos: best.perm[i] }));
}

// Monta o confronto da sua lane: você, seu duo e os inimigos que devem estar lá.
export function laneMatchup(me, allies, enemies) {
  const lane = LANE_OF[me.pos];
  const duo = PARTNER[me.pos] ? allies.find((a) => a.pos === PARTNER[me.pos]) ?? null : null;
  const opponents = ENEMY_POSITIONS[lane].map((p) => enemies.find((e) => e.pos === p)).filter(Boolean);
  return { lane, duo, opponents };
}
