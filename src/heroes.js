// Dados públicos dos heróis (OpenDota) com cache local em %APPDATA%\DotaMobral\cache.
// Só estatísticas gerais por herói: nada sobre jogadores.
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './paths.js';

const API = 'https://api.opendota.com/api';
const CDN = 'https://cdn.cloudflare.steamstatic.com';
const DAY = 24 * 60 * 60 * 1000;

export const CACHE_DIR = path.join(DATA_DIR, 'cache');
export const PORTRAIT_DIR = path.join(CACHE_DIR, 'portraits');
mkdirSync(PORTRAIT_DIR, { recursive: true });

// Lê do cache se for recente; senão baixa. Sem internet, usa o cache antigo se existir.
async function cachedJson(name, url, maxAge) {
  const file = path.join(CACHE_DIR, name);
  try {
    if (Date.now() - statSync(file).mtimeMs < maxAge) return JSON.parse(readFileSync(file, 'utf8'));
  } catch { /* sem cache */ }
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    writeFileSync(file, JSON.stringify(data));
    return data;
  } catch (err) {
    if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));
    throw err;
  }
}

let heroesPromise = null;
export function loadHeroes() {
  heroesPromise ??= cachedJson('heroes.json', `${API}/constants/heroes`, 7 * DAY)
    .then((raw) => {
      const list = Object.values(raw)
        .map((h) => ({
          id: h.id,
          name: h.name,
          short: h.name.replace('npc_dota_hero_', ''),
          label: h.localized_name,
          roles: h.roles ?? [],
          attack: h.attack_type,
          range: h.attack_range,
          img: CDN + String(h.img).replace(/\?$/, ''),
          icon: CDN + String(h.icon).replace(/\?$/, ''),
        }))
        .sort((a, b) => a.label.localeCompare(b.label));
      return {
        list,
        byId: new Map(list.map((h) => [h.id, h])),
        byName: new Map(list.map((h) => [h.name, h])),
        byShort: new Map(list.map((h) => [h.short, h])),
      };
    })
    .catch((err) => {
      heroesPromise = null;
      throw err;
    });
  return heroesPromise;
}

// Em quais lanes o herói costuma jogar: { safe, mid, off } em proporção.
export async function laneShares(heroId) {
  const rows = await cachedJson(`lanes-${heroId}.json`, `${API}/scenarios/laneRoles?hero_id=${heroId}`, 7 * DAY);
  const games = { 1: 0, 2: 0, 3: 0 };
  for (const r of rows) if (games[r.lane_role] !== undefined) games[r.lane_role] += Number(r.games) || 0;
  const total = games[1] + games[2] + games[3] || 1;
  return { safe: games[1] / total, mid: games[2] / total, off: games[3] / total, sample: total };
}

// Resultados do herói contra cada outro herói: Map(heroId -> { games, wins }).
export async function matchups(heroId) {
  const rows = await cachedJson(`matchups-${heroId}.json`, `${API}/heroes/${heroId}/matchups`, 3 * DAY);
  return new Map(rows.map((r) => [r.hero_id, { games: r.games_played, wins: r.wins }]));
}

// Distribuição do ouro por minuto (GPM final) nas partidas do herói: [{ percentile, value }].
export async function gpmBenchmarks(heroId) {
  const raw = await cachedJson(`gpm-${heroId}.json`, `${API}/benchmarks?hero_id=${heroId}`, 7 * DAY);
  return (raw.result?.gold_per_min ?? []).map((r) => ({ p: Number(r.percentile), v: Number(r.value) })).sort((a, b) => a.p - b.p);
}

// --- Itens -------------------------------------------------------------------

let itemsPromise = null;
export function loadItems() {
  itemsPromise ??= cachedJson('items.json', `${API}/constants/items`, 7 * DAY)
    .then((raw) => {
      const byKey = new Map();
      const byId = new Map();
      for (const [key, it] of Object.entries(raw)) {
        if (!it?.id || !it.img) continue;
        const item = { key, id: it.id, name: it.dname ?? key, cost: it.cost ?? 0, img: CDN + String(it.img).replace(/\?.*$/, '') };
        byKey.set(key, item);
        byId.set(it.id, item);
      }
      return { byKey, byId };
    })
    .catch((err) => {
      itemsPromise = null;
      throw err;
    });
  return itemsPromise;
}

// Itens mais comprados com o herói em cada fase: { start, early, mid, late } -> [[itemId, vezes]]
export async function itemPopularity(heroId) {
  const raw = await cachedJson(`itens-${heroId}.json`, `${API}/heroes/${heroId}/itemPopularity`, 3 * DAY);
  const sorted = (obj) => Object.entries(obj ?? {}).map(([id, n]) => [Number(id), n]).sort((a, b) => b[1] - a[1]);
  return {
    start: sorted(raw.start_game_items),
    early: sorted(raw.early_game_items),
    mid: sorted(raw.mid_game_items),
    late: sorted(raw.late_game_items),
  };
}

// --- Habilidades e ordem de skills -------------------------------------------

let abilitiesPromise = null;
function loadAbilities() {
  abilitiesPromise ??= Promise.all([
    cachedJson('abilities.json', `${API}/constants/abilities`, 7 * DAY),
    cachedJson('ability_ids.json', `${API}/constants/ability_ids`, 7 * DAY),
    cachedJson('hero_abilities.json', `${API}/constants/hero_abilities`, 7 * DAY),
  ]).then(([abilities, ids, heroAbilities]) => ({ abilities, ids, heroAbilities }))
    .catch((err) => {
      abilitiesPromise = null;
      throw err;
    });
  return abilitiesPromise;
}

// Ordem de skills mais comum nas partidas recentes (base pública de partidas do OpenDota).
// Retorna { order: [{ level, letter, name, img }], legend: [...], max, sample } ou null.
export async function skillBuild(hero) {
  const { abilities, ids, heroAbilities } = await loadAbilities();
  const slots = (heroAbilities[hero.name]?.abilities ?? []).filter((a) => a && a !== 'generic_hidden');
  if (slots.length < 4) return null;
  const letters = new Map();
  slots.slice(0, 3).forEach((a, i) => letters.set(a, 'QWE'[i]));
  letters.set(slots[slots.length - 1], 'R');
  const info = (name) => ({
    name: abilities[name]?.dname ?? name,
    img: abilities[name]?.img ? CDN + String(abilities[name].img).replace(/\?.*$/, '') : null,
  });

  const sql = `SELECT ability_upgrades_arr FROM player_matches JOIN matches USING(match_id) WHERE hero_id=${Number(hero.id)} AND ability_upgrades_arr IS NOT NULL ORDER BY matches.start_time DESC LIMIT 40`;
  const raw = await cachedJson(`skills-${hero.id}.json`, `${API}/explorer?sql=${encodeURIComponent(sql)}`, 3 * DAY);
  const builds = (raw.rows ?? []).map((r) => r.ability_upgrades_arr).filter((a) => Array.isArray(a) && a.length >= 6);
  if (builds.length < 5) return null;

  const order = [];
  for (let lvl = 0; lvl < 12; lvl++) {
    const count = new Map();
    for (const b of builds) {
      const name = ids[String(b[lvl])];
      if (!name) continue;
      const key = name.startsWith('special_bonus') ? 'talento' : name;
      count.set(key, (count.get(key) ?? 0) + 1);
    }
    const top = [...count.entries()].sort((a, b) => b[1] - a[1])[0];
    if (!top) break;
    const [name] = top;
    order.push(name === 'talento'
      ? { level: lvl + 1, letter: 'T', name: 'Talento' }
      : { level: lvl + 1, letter: letters.get(name) ?? '•', ...info(name) });
  }
  // Qual habilidade básica chega primeiro a 4 pontos ("max").
  const points = new Map();
  let max = null;
  for (const s of order) {
    if (!'QWE'.includes(s.letter)) continue;
    points.set(s.letter, (points.get(s.letter) ?? 0) + 1);
    if (!max && points.get(s.letter) === 4) max = s.letter;
  }
  const legend = [...letters.entries()].map(([name, letter]) => ({ letter, ...info(name) }))
    .sort((a, b) => 'QWER'.indexOf(a.letter) - 'QWER'.indexOf(b.letter));
  return { order, legend, max, sample: builds.length };
}

// Baixa os retratos oficiais que ainda não estão no cache (usados para reconhecer a barra superior).
export async function downloadPortraits(list) {
  const missing = list.filter((h) => !existsSync(path.join(PORTRAIT_DIR, `${h.short}.png`)));
  let next = 0;
  const worker = async () => {
    while (next < missing.length) {
      const hero = missing[next++];
      try {
        const res = await fetch(hero.img, { signal: AbortSignal.timeout(20000) });
        if (res.ok) writeFileSync(path.join(PORTRAIT_DIR, `${hero.short}.png`), Buffer.from(await res.arrayBuffer()));
      } catch { /* tenta de novo na próxima vez */ }
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));
  return list.filter((h) => existsSync(path.join(PORTRAIT_DIR, `${h.short}.png`)));
}
