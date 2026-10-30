// Monta a "BUILD" da partida: itens da fase de lane, itens de meio/fim e ordem de skills.
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
// Melhoram habilidades do herói: entram sempre que o herói costuma comprá-los.
const AGHANIMS = new Set(['aghanims_shard', 'ultimate_scepter']);
// Peças de outros itens que mesmo assim valem como item na build.
const KEEP_COMPONENTS = new Set([
  'boots', 'wind_lace', 'magic_stick', 'blink', 'force_staff', 'ghost', 'arcane_boots', 'glimmer_cape',
  'urn_of_shadows', 'maelstrom', 'orchid', 'dragon_lance', 'mekansm', 'vanguard', 'diffusal_blade',
  'aghanims_shard', 'ultimate_scepter', 'blade_mail', 'echo_sabre', 'kaya', 'power_treads', 'phase_boots',
  'tranquil_boots', 'medallion_of_courage', 'veil_of_discord', 'pavise', 'bracer', 'wraith_band', 'null_talisman',
]);
const LANE_COST = [400, 2600]; // fase de lane: itens baratos
const LATE_MIN_COST = 1200; // meio/fim: itens completos (abaixo disso, quase sempre componentes)
const LANE_MAX = 6;
const LATE_MAX = 7;

export async function buildGuide({ me, opponents, enemies }) {
  const items = await loadItems();
  const heroName = me.hero.label;
  const toItem = (key, why = null, kind = 'popular') => {
    const it = items.byKey.get(key);
    return it ? { key, name: it.name, img: it.img, cost: it.cost, why, kind, counter: kind === 'counter' } : null;
  };
  const counters = counterItems({ me, opponents, enemies });
  let popular = null;
  try {
    popular = await itemPopularity(me.hero.id);
  } catch { /* sem internet: só as regras */ }

  // Soma as compras de várias fases e ordena do mais comprado para o menos.
  const ranked = (lists) => {
    const total = new Map();
    for (const list of lists) for (const [id, n] of list) total.set(id, (total.get(id) ?? 0) + n);
    return [...total.entries()]
      .map(([id, n]) => ({ it: items.byId.get(id), n }))
      .filter((x) => x.it && !SKIP.has(x.it.key))
      // Peças soltas (ex.: Void Stone, Yasha) só atrapalham: fica o item completo.
      .filter((x) => !items.components.has(x.it.key) || KEEP_COMPONENTS.has(x.it.key))
      .sort((a, b) => b.n - a.n);
  };
  const popularWhy = `Muito comprado com ${heroName} nas partidas recentes.`;

  // Fase de lane: rota mais comum do herói + itens baratos contra a sua lane.
  const laneCounters = counters.filter((c) => c.when === 'lane').slice(0, 2);
  const lane = laneCounters.map((c) => toItem(c.key, c.why, 'counter'));
  if (popular) {
    for (const { it } of ranked([popular.early, popular.start])) {
      if (lane.length >= LANE_MAX) break;
      if (it.cost < LANE_COST[0] || it.cost > LANE_COST[1] || lane.some((x) => x?.key === it.key)) continue;
      lane.splice(lane.length - laneCounters.length, 0, toItem(it.key, popularWhy)); // rota antes dos itens de resposta
    }
  }

  // Meio/fim: itens contra o time inimigo, Shard/Scepter do herói e os mais comprados.
  const used = new Set(lane.filter(Boolean).map((x) => x.key));
  const late = counters.filter((c) => c.when === 'partida' && !used.has(c.key)).slice(0, 2).map((c) => toItem(c.key, c.why, 'counter'));
  if (popular) {
    const pop = ranked([popular.mid, popular.late]);
    const top = pop[0]?.n ?? 0;
    for (const { it, n } of pop) {
      if (AGHANIMS.has(it.key) && n >= top * 0.2 && !late.some((x) => x?.key === it.key)) {
        late.push(toItem(it.key, `${it.name}: melhora habilidades do ${heroName}; muito usado com ele.`, 'aghanim'));
      }
    }
    for (const { it } of pop) {
      if (late.length >= LATE_MAX) break;
      if (it.cost < LATE_MIN_COST || used.has(it.key) || late.some((x) => x?.key === it.key)) continue;
      late.push(toItem(it.key, popularWhy));
    }
  }

  let skills = null;
  try {
    skills = await skillBuild(me.hero);
  } catch { /* sem dados de skills agora */ }

  return { lane: lane.filter(Boolean), late: late.filter(Boolean).slice(0, LATE_MAX), skills, basedOnPopular: Boolean(popular) };
}
