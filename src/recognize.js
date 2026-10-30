// Reconhece os 10 retratos da barra superior comparando com os retratos oficiais.
//
// Como acha a barra sem saber a resolução/HUD: a GSI informa o SEU herói, então primeiro
// procuramos o retrato dele (tamanho e posição) e, com essas medidas, varremos a faixa
// para achar os outros 9. A geometria encontrada é guardada para as próximas partidas.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './paths.js';

// Parte central do retrato usada na comparação (as bordas da barra do jogo são inclinadas).
export const CROP = { x0: 0.15, x1: 0.85, y0: 0.12, y1: 0.88 };
export const TEMPLATE_W = 96;
export const TEMPLATE_H = 54;
// Duas barras diferentes: a do jogo (HUD) e a do tempo de estratégia (retratos maiores, com nomes).
// Cada uma tem a faixa capturada (fração da altura), o tamanho possível do retrato e a calibração salva.
export const LAYOUTS = {
  ingame: { strip: 0.09, hMin: 0.02, hMax: 0.055, file: path.join(DATA_DIR, 'barra-geometria.json') },
  strategy: { strip: 0.14, hMin: 0.03, hMax: 0.11, file: path.join(DATA_DIR, 'barra-estrategia.json') },
};

// --- Imagem integral: média de qualquer retângulo em tempo constante ----------

class Integral {
  constructor(rgb, w, h) {
    this.w = w;
    this.h = h;
    const W = w + 1;
    this.sums = [0, 1, 2].map(() => new Float64Array(W * (h + 1)));
    for (let y = 0; y < h; y++) {
      const row = [0, 0, 0];
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 3;
        for (let c = 0; c < 3; c++) {
          row[c] += rgb[i + c];
          this.sums[c][(y + 1) * W + x + 1] = this.sums[c][y * W + x + 1] + row[c];
        }
      }
    }
  }

  mean(c, x0, y0, x1, y1) {
    const W = this.w + 1;
    const s = this.sums[c];
    return (s[y1 * W + x1] - s[y0 * W + x1] - s[y1 * W + x0] + s[y0 * W + x0]) / ((x1 - x0) * (y1 - y0));
  }
}

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
const MIN_CONTRAST = 8; // desvio padrão mínimo das cores (0-255) para ser um retrato

// Vetor de cores (fw x fh células) do retângulo, normalizado: média zero e norma 1.
// Assim a comparação ignora diferenças de brilho e contraste.
function features(I, bx, by, bw, bh, fw, fh, crop) {
  const x0 = bx + (crop ? CROP.x0 * bw : 0);
  const y0 = by + (crop ? CROP.y0 * bh : 0);
  const cw = (crop ? (CROP.x1 - CROP.x0) * bw : bw) / fw;
  const ch = (crop ? (CROP.y1 - CROP.y0) * bh : bh) / fh;
  const v = new Float32Array(fw * fh * 3);
  let k = 0;
  for (let j = 0; j < fh; j++) {
    const ya = clamp(Math.floor(y0 + j * ch), 0, I.h - 1);
    const yb = clamp(Math.max(ya + 1, Math.floor(y0 + (j + 1) * ch)), 1, I.h);
    for (let i = 0; i < fw; i++) {
      const xa = clamp(Math.floor(x0 + i * cw), 0, I.w - 1);
      const xb = clamp(Math.max(xa + 1, Math.floor(x0 + (i + 1) * cw)), 1, I.w);
      for (let c = 0; c < 3; c++) v[k++] = I.mean(c, xa, ya, xb, yb);
    }
  }
  let mean = 0;
  for (const x of v) mean += x;
  mean /= v.length;
  let norm = 0;
  for (let n = 0; n < v.length; n++) {
    v[n] -= mean;
    norm += v[n] * v[n];
  }
  norm = Math.sqrt(norm);
  // Região quase lisa (tela preta, retrato vazio): não é um herói. Sem esta trava,
  // a normalização "esticaria" pequenas variações até parecerem um retrato.
  if (norm / Math.sqrt(v.length) < MIN_CONTRAST) return null;
  for (let n = 0; n < v.length; n++) v[n] /= norm;
  return v;
}

function dot(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

// Tamanhos de vetor: grosso (busca rápida), médio (varredura) e fino (decisão).
const SIZES = { coarse: [8, 4], mid: [12, 6], fine: [24, 12] };

// --- Retratos de referência -------------------------------------------------

export function loadTemplates(binFile, names) {
  const bytes = readFileSync(binFile);
  const per = TEMPLATE_W * TEMPLATE_H * 3;
  return names.map((short, idx) => {
    const I = new Integral(bytes.subarray(idx * per, (idx + 1) * per), TEMPLATE_W, TEMPLATE_H);
    const f = {};
    for (const [key, [fw, fh]] of Object.entries(SIZES)) f[key] = features(I, 0, 0, TEMPLATE_W, TEMPLATE_H, fw, fh, false);
    return { short, f };
  });
}

// --- Busca ------------------------------------------------------------------

function scoreBox(I, box, tpl, size) {
  const [fw, fh] = SIZES[size];
  const v = features(I, box.x, box.y, box.w, box.h, fw, fh, true);
  return v && tpl.f[size] ? dot(v, tpl.f[size]) : -1;
}

// Procura o retrato do próprio herói (tamanho, proporção e posição desconhecidos).
function findPortrait(I, tpl, H, xRange, layout) {
  const hMin = Math.round(layout.hMin * H);
  const hMax = Math.min(Math.round(layout.hMax * H), I.h);
  const hStep = Math.max(1, Math.round(0.003 * H));
  const candidates = [];
  for (let h = hMin; h <= hMax; h += hStep) {
    // Passos proporcionais ao tamanho: retratos grandes não precisam de busca pixel a pixel.
    const yStep = Math.max(1, Math.round(h * 0.06));
    const xStep = Math.max(2, Math.round(h * 0.07));
    for (const aspect of [1.35, 1.5, 1.65, 1.8]) {
      const w = Math.round(h * aspect);
      for (let y = 0; y + h <= I.h; y += yStep) {
        for (let x = Math.max(0, xRange[0]); x + w <= Math.min(I.w, xRange[1]); x += xStep) {
          const s = scoreBox(I, { x, y, w, h }, tpl, 'coarse');
          if (candidates.length < 12 || s > candidates[candidates.length - 1].s) {
            candidates.push({ s, box: { x, y, w, h } });
            candidates.sort((a, b) => b.s - a.s);
            if (candidates.length > 12) candidates.pop();
          }
        }
      }
    }
  }
  // Refina cada candidato com o vetor fino.
  let best = { s: -1, box: null };
  for (const cand of candidates) {
    const b0 = cand.box;
    const yStep = Math.max(1, Math.round(b0.h * 0.06));
    const xStep = Math.max(2, Math.round(b0.h * 0.07));
    const inc = Math.max(1, Math.round(xStep / 5));
    for (let dh = -hStep; dh <= hStep; dh++) {
      for (const da of [-0.06, -0.03, 0, 0.03, 0.06]) {
        const h = b0.h + dh;
        const w = Math.round(h * (b0.w / b0.h + da));
        for (let dy = -yStep; dy <= yStep; dy += inc) {
          for (let dx = -xStep; dx <= xStep; dx += inc) {
            const box = { x: b0.x + dx, y: b0.y + dy, w, h };
            if (box.x < 0 || box.y < 0 || box.x + w > I.w || box.y + h > I.h) continue;
            const s = scoreBox(I, box, tpl, 'fine');
            if (s > best.s) best = { s, box };
          }
        }
      }
    }
  }
  return best;
}

// Com o tamanho do retrato conhecido, acha os 10 retratos ao longo da faixa.
function findSlots(I, geo, templates) {
  const { y, w, h } = geo;
  const step = Math.max(1, Math.round(w / 30));
  const scores = [];
  for (let x = 0; x + w <= I.w; x += step) {
    const v = features(I, x, y, w, h, ...SIZES.mid, true);
    if (!v) continue;
    let best = -1;
    for (const t of templates) {
      const s = dot(v, t.f.mid);
      if (s > best) best = s;
    }
    scores.push({ x, s: best });
  }
  scores.sort((a, b) => b.s - a.s);
  const center = I.w / 2;
  const picked = { left: [], right: [] };
  for (const c of scores) {
    const side = c.x + w / 2 < center ? 'left' : 'right';
    if (picked[side].length >= 5) continue;
    if ([...picked.left, ...picked.right].some((p) => Math.abs(p.x - c.x) < w * 0.85)) continue;
    picked[side].push(c);
    if (picked.left.length === 5 && picked.right.length === 5) break;
  }
  const order = (a, b) => a.x - b.x;
  const left = regularize(picked.left.sort(order).map((p) => p.x), w, 'left');
  const right = regularize(picked.right.sort(order).map((p) => p.x), w, 'right');
  return [...left, ...right];
}

// Os 5 retratos de cada lado ficam lado a lado, igualmente espaçados, a partir do relógio.
// Ancoramos no retrato mais perto do centro (sempre parte da barra) e montamos os 5 com o
// espaçamento entre vizinhos. Assim um "retrato" achado no cenário, longe da barra, é
// descartado e uma posição que faltou é preenchida.
function regularize(xs, w, side) {
  if (xs.length < 2) return xs;
  const diffs = xs.slice(1).map((x, i) => x - xs[i]).filter((d) => d >= w * 0.85);
  if (!diffs.length) return xs;
  const spacing = Math.min(...diffs);
  const anchor = side === 'left' ? xs[xs.length - 1] : xs[0];
  const grid = [0, 1, 2, 3, 4].map((k) => Math.round(side === 'left' ? anchor - (4 - k) * spacing : anchor + k * spacing));
  return grid.map((g) => xs.find((x) => Math.abs(x - g) < w * 0.3) ?? g);
}

// Para cada retrato: melhores candidatos (com pequeno ajuste de posição).
function classifySlot(I, box, templates) {
  const jy = Math.max(1, Math.round(box.h * 0.06));
  const jx = Math.max(2, Math.round(box.w * 0.12));
  const best = new Map();
  for (let dy = -jy; dy <= jy; dy += Math.max(1, Math.floor(jy / 2))) {
    for (let dx = -jx; dx <= jx; dx += Math.max(1, Math.floor(jx / 4))) {
      const b = { ...box, x: box.x + dx, y: box.y + dy };
      if (b.x < 0 || b.y < 0 || b.x + b.w > I.w || b.y + b.h > I.h) continue;
      const v = features(I, b.x, b.y, b.w, b.h, ...SIZES.fine, true);
      if (!v) continue;
      for (const t of templates) {
        const s = dot(v, t.f.fine);
        if (s > (best.get(t.short) ?? -1)) best.set(t.short, s);
      }
    }
  }
  return [...best.entries()].map(([short, s]) => ({ short, s })).sort((a, b) => b.s - a.s).slice(0, 8);
}

// Cada herói aparece no máximo uma vez: escolhe os pares (retrato, herói) do mais certo ao menos.
function assignUnique(candidatesPerSlot) {
  const pairs = [];
  candidatesPerSlot.forEach((cands, slot) => cands.forEach((c, rank) => pairs.push({ slot, ...c, rank })));
  pairs.sort((a, b) => b.s - a.s);
  const result = candidatesPerSlot.map(() => null);
  const used = new Set();
  for (const p of pairs) {
    if (result[p.slot] || used.has(p.short)) continue;
    const others = candidatesPerSlot[p.slot].filter((c) => c.short !== p.short);
    result[p.slot] = { short: p.short, score: p.s, margin: p.s - (others[0]?.s ?? 0) };
    used.add(p.short);
  }
  return result;
}

function loadGeometry(layout) {
  try {
    return existsSync(layout.file) ? JSON.parse(readFileSync(layout.file, 'utf8')) : null;
  } catch {
    return null;
  }
}

// Geometria relativa: medidas em "alturas da janela", posições a partir do centro.
// Vale para qualquer resolução com a mesma proporção de HUD.
function toRelative(geo, xs, W, H) {
  return { y: geo.y / H, w: geo.w / H, h: geo.h / H, centers: xs.map((x) => (x + geo.w / 2 - W / 2) / H) };
}

function fromRelative(rel, W, H) {
  const w = Math.round(rel.w * H);
  return {
    geo: { y: Math.round(rel.y * H), w, h: Math.round(rel.h * H) },
    xs: rel.centers.map((c) => Math.round(W / 2 + c * H - w / 2)),
  };
}

const MIN_SCORE = 0.45;
const MIN_SLOT_SCORE = 0.35;

function classifyAll(I, geo, xs, templates) {
  const cands = xs.map((x) => classifySlot(I, { x, y: geo.y, w: geo.w, h: geo.h }, templates));
  const picks = assignUnique(cands);
  const avg = picks.reduce((s, p) => s + (p?.score ?? 0), 0) / picks.length;
  const min = Math.min(...picks.map((p) => p?.score ?? 0));
  return { picks, avg, min };
}

/**
 * strip: { rgb, width, height, windowHeight }
 * myHero: nome curto do seu herói (da GSI) ou null; myTeam: 'radiant' | 'dire' | null
 * layout: 'ingame' (barra do jogo) ou 'strategy' (barra do tempo de estratégia)
 * Retorna { ok, slots: [{ short, score, confidence } x10], reason }
 */
export function recognizeTopBar(strip, templates, { myHero, myTeam, layout: layoutName = 'ingame' } = {}) {
  const layout = LAYOUTS[layoutName];
  const I = new Integral(strip.rgb, strip.width, strip.height);
  const W = strip.width;
  const H = strip.windowHeight;

  let brightness = 0;
  for (let i = 0; i < strip.rgb.length; i += 97) brightness += strip.rgb[i];
  if (brightness / (strip.rgb.length / 97) < 6) {
    return { ok: false, reason: 'A captura saiu preta. Use o Dota em "Janela sem bordas" (Configurações > Vídeo).' };
  }

  const finish = ({ picks, avg }, geo, xs, how) => {
    const slots = picks.map((p) => p && {
      short: p.short,
      score: Number(p.score.toFixed(3)),
      confidence: p.score >= 0.75 && p.margin >= 0.06 ? 'alta' : p.score >= 0.6 ? 'média' : 'baixa',
    });
    const myIdx = slots.findIndex((s) => s?.short === myHero);
    if (myHero && myIdx < 0) return { ok: false, reason: 'Não encontrei o seu herói na barra superior.', slots };
    if (avg < MIN_SCORE) return { ok: false, reason: 'A barra superior não ficou nítida na captura.', slots };
    // Garante os 10 heróis definidos: um retrato vazio ou irreconhecível invalida a leitura.
    if (slots.some((s) => !s || s.score < MIN_SLOT_SCORE)) {
      return { ok: false, reason: 'Nem todos os 10 heróis estavam visíveis com clareza.', slots };
    }
    writeFileSync(layout.file, JSON.stringify(toRelative(geo, xs, W, H)));
    return { ok: true, slots, how, average: Number(avg.toFixed(3)) };
  };

  // 1) Caminho rápido: geometria de uma partida anterior.
  const saved = loadGeometry(layout);
  if (saved) {
    const { geo, xs } = fromRelative(saved, W, H);
    if (geo.y + geo.h <= I.h && xs.every((x) => x >= 0 && x + geo.w <= W)) {
      const res = classifyAll(I, geo, xs, templates);
      const mine = !myHero || res.picks.some((p) => p?.short === myHero);
      // Algum retrato duvidoso e sabemos o seu herói? Recalibra em vez de arriscar.
      if (res.avg >= 0.6 && mine && (res.min >= 0.5 || !myHero)) return finish(res, geo, xs, 'geometria salva');
    }
  }

  // 2) Sem geometria confiável: localiza o retrato do seu herói e varre a faixa.
  const tpl = myHero && templates.find((t) => t.short === myHero);
  if (!tpl) {
    return { ok: false, reason: 'Ainda não sei onde fica a barra na sua tela. Isso é calibrado automaticamente na primeira partida (o app precisa saber o seu herói pela GSI).' };
  }
  const half = myTeam === 'dire' ? [Math.round(W * 0.5), Math.round(W * 0.92)]
    : myTeam === 'radiant' ? [Math.round(W * 0.08), Math.round(W * 0.5)]
      : [Math.round(W * 0.08), Math.round(W * 0.92)];
  const found = findPortrait(I, tpl, H, half, layout);
  if (!found.box || found.s < 0.5) {
    return { ok: false, reason: 'Não encontrei o seu herói na barra superior. O Dota estava na tela?' };
  }
  const geo = { y: found.box.y, w: found.box.w, h: found.box.h };
  const xs = findSlots(I, geo, templates);
  if (xs.length !== 10) return { ok: false, reason: `Achei só ${xs.length} retratos na barra superior.` };
  return finish(classifyAll(I, geo, xs, templates), geo, xs, 'calibração automática');
}
