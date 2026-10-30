// Seu ouro por minuto comparado com as partidas do seu herói.
// GPM vem da GSI (dado seu, oficial). Referência: GPM final das partidas do herói (OpenDota).
import { gpmBenchmarks, loadHeroes } from './heroes.js';

const IN_PROGRESS = 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS';
const MIN_CLOCK = 5 * 60; // antes disso o GPM ainda não diz muito
const EARLY_CLOCK = 10 * 60; // até aqui o GPM é naturalmente mais baixo que o final

const benchmarks = new Map(); // heroId -> percentis | 'carregando' | null
let last = null;

export function updateFarm(gsi) {
  const gpm = gsi.player?.gpm;
  const heroName = gsi.hero?.name;
  if (typeof gpm !== 'number' || !heroName) return;
  last = { gpm, heroName, clock: gsi.map?.clock_time ?? 0, gameState: gsi.map?.game_state };
}

// Percentil (0-100) do valor dentro da distribuição, por interpolação linear.
function percentileOf(value, dist) {
  if (!dist.length) return null;
  if (value <= dist[0].v) return Math.round(dist[0].p * 100 * (value / dist[0].v));
  for (let i = 1; i < dist.length; i++) {
    if (value <= dist[i].v) {
      const a = dist[i - 1];
      const b = dist[i];
      return Math.round((a.p + ((value - a.v) / (b.v - a.v)) * (b.p - a.p)) * 100);
    }
  }
  return 99;
}

export async function getFarmView(mode) {
  if (!last || last.gameState !== IN_PROGRESS) return null;
  const heroes = await loadHeroes().catch(() => null);
  const hero = heroes?.byName.get(last.heroName);
  if (!hero) return null;

  if (!benchmarks.has(hero.id)) {
    benchmarks.set(hero.id, 'carregando');
    gpmBenchmarks(hero.id).then((d) => benchmarks.set(hero.id, d), () => benchmarks.set(hero.id, null));
  }
  const dist = benchmarks.get(hero.id);
  const view = { gpm: last.gpm, hero: hero.label, minute: Math.floor(last.clock / 60) };

  if (mode === 'turbo') return { ...view, note: 'Turbo: a referência do herói é de partidas normais, então não dá para comparar (o Turbo dá bem mais ouro).' };
  if (last.clock < MIN_CLOCK) return { ...view, note: 'A comparação com a média aparece a partir dos 5 minutos.' };
  if (!Array.isArray(dist) || !dist.length) return { ...view, note: 'Carregando a média do herói...' };

  const pct = percentileOf(last.gpm, dist);
  const median = dist.find((d) => d.p === 0.5)?.v ?? null;
  const verdict = pct < 30 ? 'farmando pouco' : pct > 70 ? 'farmando bem' : 'na média';
  return {
    ...view,
    percentile: pct,
    median,
    verdict,
    tone: pct < 30 ? 'bad' : pct > 70 ? 'good' : 'neutral',
    note: last.clock < EARLY_CLOCK ? 'Início de jogo: o GPM ainda vai subir; a comparação fica mais justa depois dos 10 minutos.' : null,
  };
}
