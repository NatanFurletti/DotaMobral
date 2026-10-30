// Monta a "BUILD" da partida: itens de lane (baratos), itens de meio/fim (caros) e ordem de skills.
// Junta o que é mais comprado com o seu herói (dados públicos do OpenDota) com os itens
// que respondem a ESTA partida (regras em advice.js).
import { counterItems } from './advice.js';
import { itemPopularity, loadItems, skillBuild } from './heroes.js';

// Consumíveis e itens que não fazem sentido numa "rota" de build.
const SKIP = new Set([
  'tango', 'flask', 'clarity', 'enchanted_mango', 'faerie_fire', 'ward_observer', 'ward_sentry',
  'ward_dispenser', 'smoke_of_deceit', 'tpscroll', 'branches', 'blood_grenade', 'dust',
  'tome_of_knowledge', 'famango', 'great_famango', 'greater_famango', 'aegis', 'cheese', 'refresher_shard',
]);
const LANE_COST = [400, 2600]; // itens de começo: baratos
const LATE_MIN_COST = 1500; // itens de meio/fim: mais caros

export async function buildGuide({ me, opponents, enemies }) {
  const items = await loadItems();
  const toItem = (key, why = null, counter = false) => {
    const it = items.byKey.get(key);
    return it ? { key, name: it.name, img: it.img, cost: it.cost, why, counter } : null;
  };
  const counters = counterItems({ me, opponents, enemies });
  let popular = null;
  try {
    popular = await itemPopularity(me.hero.id);
  } catch { /* sem internet: só as regras */ }

  const pick = (lists, accept, limit, exclude) => {
    const keys = [];
    for (const [id] of lists.flat()) {
      const it = items.byId.get(id);
      if (!it || SKIP.has(it.key) || !accept(it) || keys.includes(it.key) || exclude.has(it.key)) continue;
      keys.push(it.key);
      if (keys.length >= limit) break;
    }
    return keys;
  };

  // Lane: rota mais comum do herói + itens contra a sua lane.
  const laneCounters = counters.filter((c) => c.when === 'lane').slice(0, 2);
  const laneKeys = popular
    ? pick([popular.early, popular.start], (it) => it.cost >= LANE_COST[0] && it.cost <= LANE_COST[1], 3, new Set(laneCounters.map((c) => c.key)))
    : [];
  const lane = [...laneKeys.map((k) => toItem(k)), ...laneCounters.map((c) => toItem(c.key, c.why, true))].filter(Boolean);

  // Meio/fim: até 2 itens contra o time inimigo + os mais comprados com o herói.
  const lateCounters = counters.filter((c) => c.when === 'partida').slice(0, 2);
  const lateKeys = popular
    ? pick([popular.mid, popular.late], (it) => it.cost >= LATE_MIN_COST, 4 - lateCounters.length, new Set([...lateCounters.map((c) => c.key), ...laneKeys]))
    : [];
  const late = [...lateCounters.map((c) => toItem(c.key, c.why, true)), ...lateKeys.map((k) => toItem(k))].filter(Boolean);

  let skills = null;
  try {
    skills = await skillBuild(me.hero);
  } catch { /* sem dados de skills agora */ }

  return { lane, late, skills, basedOnPopular: Boolean(popular) };
}
