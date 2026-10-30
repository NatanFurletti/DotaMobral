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
