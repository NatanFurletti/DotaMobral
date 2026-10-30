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
export const LANE_OF = { 1: 'safe', 5: 'safe', 2: 'mid', 3: 'off', 4: 'off' };
const PARTNER = { 1: 5, 5: 1, 3: 4, 4: 3, 2: null };
// A safe lane de um time enfrenta a offlane do outro.
export const ENEMY_POSITIONS = { safe: [3, 4], off: [1, 5], mid: [2] };

const ALL_PERMS = (function permutations(items) {
  if (items.length <= 1) return [items];
  return items.flatMap((item, i) => permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((p) => [item, ...p]));
})([1, 2, 3, 4, 5]);

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

/**
 * Todas as formas de distribuir as posições 1-5 no time, da mais provável para a menos.
 * fixed: { heroId: posição } para posições já definidas (ex.: a que você escolheu).
 * Retorna [{ positions: { heroId: pos }, p }] com p somando 1.
 */
export async function rankAssignments(team, fixed = {}) {
  const weights = await Promise.all(team.map(async (hero) => {
    try {
      return positionWeights(hero, await laneShares(hero.id));
    } catch {
      return positionWeights(hero, { safe: 0.34, mid: 0.33, off: 0.33 });
    }
  }));
  const ranked = [];
  for (const perm of ALL_PERMS) {
    if (team.some((h, i) => fixed[h.id] && fixed[h.id] !== perm[i])) continue;
    const logp = perm.reduce((s, pos, i) => s + Math.log(weights[i][pos]), 0);
    ranked.push({ positions: Object.fromEntries(team.map((h, i) => [h.id, perm[i]])), logp });
  }
  const top = Math.max(...ranked.map((r) => r.logp));
  const total = ranked.reduce((s, r) => s + Math.exp(r.logp - top), 0);
  return ranked
    .map((r) => ({ positions: r.positions, p: Math.exp(r.logp - top) / total }))
    .sort((a, b) => b.p - a.p);
}

// Chance de um herói estar em cada posição, somando todas as distribuições.
export function positionChances(ranking, heroId) {
  const chances = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const r of ranking) chances[r.positions[heroId]] += r.p;
  return chances;
}

// Você, seu duo e os inimigos da sua lane, dadas as posições de cada time.
export function laneMatchup(myHeroId, myPos, allyPositions, enemyPositions) {
  const lane = LANE_OF[myPos];
  const partner = PARTNER[myPos];
  const duoId = partner ? Number(Object.keys(allyPositions).find((id) => allyPositions[id] === partner)) : null;
  const opponents = ENEMY_POSITIONS[lane]
    .map((p) => Number(Object.keys(enemyPositions).find((id) => enemyPositions[id] === p)))
    .filter(Boolean);
  return { lane, duoId: duoId || null, opponents };
}

/**
 * Cenários alternativos da sua lane, do mais provável ao menos:
 * combina as suas posições possíveis com as duplas inimigas possíveis naquela lane.
 * Cada cenário traz as posições completas dos dois times, prontas para aplicar com um clique.
 */
export function laneScenarios({ myHeroId, myPosOptions, allyRankByPos, enemyRanking, limit = 6 }) {
  const scenarios = [];
  for (const { pos: myPos, p: pMe } of myPosOptions) {
    const allyBest = allyRankByPos[myPos]?.[0];
    if (!allyBest) continue;
    const lanePositions = ENEMY_POSITIONS[LANE_OF[myPos]];
    // Agrupa as distribuições inimigas pela dupla (ou herói, no mid) que cai na sua lane.
    const groups = new Map();
    for (const r of enemyRanking) {
      const ids = lanePositions.map((p) => Number(Object.keys(r.positions).find((id) => r.positions[id] === p)));
      const key = [...ids].sort((a, b) => a - b).join(',');
      const g = groups.get(key) ?? { p: 0, best: r };
      g.p += r.p;
      groups.set(key, g);
    }
    for (const g of groups.values()) {
      const { duoId, opponents } = laneMatchup(myHeroId, myPos, allyBest.positions, g.best.positions);
      scenarios.push({
        myPos,
        duoId,
        opponents,
        chance: pMe * g.p,
        allyPositions: allyBest.positions,
        enemyPositions: g.best.positions,
      });
    }
  }
  return scenarios.sort((a, b) => b.chance - a.chance).slice(0, limit);
}
