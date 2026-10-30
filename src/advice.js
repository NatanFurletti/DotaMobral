// Dicas simples do confronto da lane e itens úteis, sempre com o "porquê".
// Regras explicáveis + estatísticas públicas de confrontos (OpenDota). Nada de dados de jogadores.
import { readJsonAsset } from './paths.js';

const TRAITS = readJsonAsset('config/hero-traits.json');
const has = (trait, hero) => (TRAITS[trait] ?? []).includes(hero.short);
const isRole = (role, hero) => hero.roles.includes(role);
const names = (list) => list.map((h) => h.label).join(' e ');
const MIN_GAMES = 15;

function winrate(stats, enemy) {
  const s = stats?.get(enemy.id);
  if (!s || s.games < MIN_GAMES) return null;
  return { rate: s.wins / s.games, games: s.games };
}

/**
 * me: { hero, pos }, duo: { hero, pos } | null, opponents: [{ hero, pos }], enemies: [{ hero, pos }]
 * myMatchups: Map(heroId -> { games, wins }) do seu herói.
 */
export function analyzeLane({ me, duo, opponents, enemies, myMatchups }) {
  const reasons = [];
  let score = 0;
  let evidence = 0;

  // 1) Estatística pública de confrontos.
  const perEnemy = opponents.map(({ hero }) => {
    const wr = winrate(myMatchups, hero);
    if (wr) {
      score += wr.rate - 0.5;
      evidence++;
      const pct = Math.round(wr.rate * 100);
      reasons.push({
        tone: pct >= 52 ? 'good' : pct <= 48 ? 'bad' : 'neutral',
        text: `${me.hero.label} vence ${pct}% contra ${hero.label} (${wr.games.toLocaleString('pt-BR')} partidas, dados públicos do OpenDota).`,
      });
    }
    return { heroId: hero.id, winrate: wr && Math.round(wr.rate * 100), games: wr?.games ?? 0 };
  });
  if (evidence) score /= evidence;

  // 2) Regras simples da lane.
  const ranged = opponents.filter((o) => o.hero.attack === 'Ranged').map((o) => o.hero);
  if (me.hero.attack === 'Melee' && ranged.length) {
    score -= 0.015 * ranged.length;
    const plural = ranged.length > 1;
    reasons.push({ tone: 'bad', text: `${names(ranged)} ${plural ? 'atacam' : 'ataca'} à distância e ${plural ? 'podem' : 'pode'} te acertar sem levar troco na lane. Leve regeneração extra e não fique parado no alcance ${plural ? 'deles' : 'dele'}.` });
  }
  if (me.hero.attack === 'Ranged' && opponents.length && opponents.every((o) => o.hero.attack === 'Melee')) {
    score += 0.01;
    reasons.push({ tone: 'good', text: 'Você ataca à distância e eles não: aproveite para trocar golpes enquanto eles chegam perto dos creeps.' });
  }
  const nukers = opponents.filter((o) => isRole('Nuker', o.hero)).map((o) => o.hero);
  const disablers = opponents.filter((o) => isRole('Disabler', o.hero)).map((o) => o.hero);
  if (nukers.length && disablers.length) {
    score -= 0.01;
    reasons.push({ tone: 'bad', text: `${names([...new Set([...disablers, ...nukers])])}: controle + dano mágico. Cuidado a partir do nível 2–3, quando o combo já pode te matar.` });
  }
  const healers = opponents.filter((o) => has('healing', o.hero)).map((o) => o.hero);
  if (healers.length) {
    reasons.push({ tone: 'bad', text: `${names(healers)} ${healers.length > 1 ? 'curam' : 'cura'}: trocas longas tendem a favorecê-los. Prefira trocas curtas e decisivas.` });
  }
  const escapers = opponents.filter((o) => isRole('Escape', o.hero)).map((o) => o.hero);
  if (escapers.length) {
    reasons.push({ tone: 'neutral', text: `${names(escapers)} ${escapers.length > 1 ? 'escapam' : 'escapa'} fácil: não gaste muita mana perseguindo.` });
  }
  if (duo && isRole('Disabler', duo.hero) && !escapers.length && opponents.length) {
    score += 0.01;
    reasons.push({ tone: 'good', text: `Seu duo (${duo.hero.label}) tem controle e eles não escapam bem: dá para buscar abate cedo.` });
  }

  const verdict = !opponents.length ? 'sem dados'
    : score >= 0.02 ? 'favorável' : score <= -0.02 ? 'desfavorável' : 'equilibrado';
  return { verdict, reasons: reasons.slice(0, 5), perEnemy, basedOnStats: evidence > 0 };
}

// Itens contra ESTA partida, com o código oficial de cada item (para o ícone).
// when: 'lane' (baratos, início) ou 'partida' (mais caros, meio/fim). Ajustado para núcleo ou suporte.
export function counterItems({ me, opponents, enemies }) {
  const core = me.pos <= 3;
  const items = [];
  const add = (keys, why, when) => {
    for (const key of [].concat(keys)) if (!items.some((i) => i.key === key)) items.push({ key, why, when });
  };
  const all = enemies.map((e) => e.hero);
  const lane = opponents.map((o) => o.hero);

  // Lane (itens baratos)
  const laneNukers = lane.filter((h) => isRole('Nuker', h));
  if (laneNukers.length) add('magic_wand', `${names(laneNukers)} ${laneNukers.length > 1 ? 'usam' : 'usa'} muita magia: o Wand enche rápido e salva sua vida.`, 'lane');
  if (me.hero.attack === 'Melee' && lane.some((h) => h.attack === 'Ranged')) add('flask', 'Vai tomar dano à distância na lane: leve Healing Salve extra.', 'lane');
  const laneInvis = lane.filter((h) => has('invisibility', h));
  if (laneInvis.length) add('dust', `${names(laneInvis)} ${laneInvis.length > 1 ? 'ficam' : 'fica'} invisível: o Dust revela na hora do abate.`, 'lane');
  const invis = all.filter((h) => has('invisibility', h));
  if (invis.length && !core && !laneInvis.length) add('ward_sentry', `${names(invis)}: heróis com invisibilidade. Sentry para revelar.`, 'lane');

  // Meio/fim de jogo (itens mais caros)
  const healers = all.filter((h) => has('healing', h));
  if (healers.length) add(core ? 'skadi' : 'spirit_vessel', `${names(healers)}: muita cura no time inimigo, e esse item reduz a cura.`, 'partida');
  const magic = all.filter((h) => isRole('Nuker', h) || isRole('Disabler', h));
  if (magic.length >= 3) add(core ? 'black_king_bar' : 'glimmer_cape', `${magic.length} inimigos com magia ou controle forte.`, 'partida');
  const evasion = all.filter((h) => has('evasion', h));
  if (evasion.length && core) add('monkey_king_bar', `${names(evasion)} ${evasion.length > 1 ? 'desviam' : 'desvia'} de ataques: o MKB garante o acerto.`, 'partida');
  const multi = all.filter((h) => has('illusions', h) || has('summons', h));
  if (multi.length && core) add('mjollnir', `${names(multi)}: muitas ilusões ou unidades; dano em área ajuda.`, 'partida');
  const physical = all.filter((h) => isRole('Carry', h) && h.attack === 'Melee');
  if (physical.length >= 2 && !core) add('ghost', `${names(physical)}: dano físico corpo a corpo; o Ghost te salva deles.`, 'partida');
  const escapes = all.filter((h) => isRole('Escape', h));
  if (escapes.length >= 3) add(core ? 'orchid' : 'rod_of_atos', `${escapes.length} inimigos com fuga: segure-os no lugar antes do combo.`, 'partida');
  if (invis.length && core) add('dust', `${names(invis)}: heróis com invisibilidade.`, 'partida');

  return items;
}
