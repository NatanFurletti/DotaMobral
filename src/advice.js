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

// Itens úteis para ESTA partida, considerando o seu papel (núcleo ou suporte).
export function suggestItems({ me, opponents, enemies }) {
  const core = me.pos <= 3;
  const items = [];
  const add = (item, why, when) => {
    if (!items.some((i) => i.item === item)) items.push({ item, why, when });
  };
  const all = enemies.map((e) => e.hero);
  const lane = opponents.map((o) => o.hero);

  // Lane
  const laneNukers = lane.filter((h) => isRole('Nuker', h));
  if (laneNukers.length) add('Magic Stick / Magic Wand', `${names(laneNukers)} ${laneNukers.length > 1 ? 'usam' : 'usa'} muita magia: o Stick enche rápido e salva sua vida.`, 'lane');
  if (me.hero.attack === 'Melee' && lane.some((h) => h.attack === 'Ranged')) add('Tango + Healing Salve extra', 'Vai tomar dano à distância na lane; regeneração extra evita voltar para a base.', 'lane');
  const laneInvis = lane.filter((h) => has('invisibility', h));
  if (laneInvis.length) add('Dust of Appearance', `${names(laneInvis)} ${laneInvis.length > 1 ? 'ficam' : 'fica'} invisível: o Dust revela na hora do abate.`, 'lane');

  // Partida
  const invis = all.filter((h) => has('invisibility', h));
  if (invis.length) add(core ? 'Dust of Appearance' : 'Sentry Ward + Dust of Appearance', `${names(invis)}: heróis com invisibilidade.`, 'partida');
  const healers = all.filter((h) => has('healing', h));
  if (healers.length) add(core ? 'Eye of Skadi ou Shiva\'s Guard' : 'Spirit Vessel', `${names(healers)}: muita cura no time inimigo, e esse item reduz a cura.`, 'partida');
  const magic = all.filter((h) => isRole('Nuker', h) || isRole('Disabler', h));
  if (magic.length >= 3) add(core ? 'Black King Bar' : 'Glimmer Cape ou Pipe of Insight', `${magic.length} inimigos com magia ou controle forte.`, 'partida');
  const evasion = all.filter((h) => has('evasion', h));
  if (evasion.length && core) add('Monkey King Bar', `${names(evasion)} ${evasion.length > 1 ? 'desviam' : 'desvia'} de ataques: o MKB garante o acerto.`, 'partida');
  const multi = all.filter((h) => has('illusions', h) || has('summons', h));
  if (multi.length) add(core ? 'Mjollnir ou outro dano em área' : 'Itens de dano em área', `${names(multi)}: muitas ilusões ou unidades.`, 'partida');
  const physical = all.filter((h) => isRole('Carry', h) && h.attack === 'Melee');
  if (physical.length >= 2 && !core) add('Ghost Scepter ou Force Staff', `${names(physical)}: dano físico corpo a corpo, e você precisa sair do alcance deles.`, 'partida');
  const escapes = all.filter((h) => isRole('Escape', h));
  if (escapes.length >= 3) add(core ? 'Orchid Malevolence ou Scythe of Vyse' : 'Rod of Atos', `${escapes.length} inimigos com fuga: segure-os no lugar antes do combo.`, 'partida');

  return items.slice(0, 6);
}
