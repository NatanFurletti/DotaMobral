// Prepara (uma vez) os retratos de referência: baixa as imagens oficiais e as reduz.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { buildTemplateFile } from './capture.js';
import { CACHE_DIR, PORTRAIT_DIR, downloadPortraits, loadHeroes } from './heroes.js';
import { CROP, TEMPLATE_H, TEMPLATE_W, loadTemplates } from './recognize.js';

const BIN = path.join(CACHE_DIR, 'retratos.bin');
const META = path.join(CACHE_DIR, 'retratos.json');
const VERSION = 1; // muda se CROP ou tamanho mudarem

let ready = null;

export function ensureTemplates({ log = () => {} } = {}) {
  ready ??= (async () => {
    const heroes = await loadHeroes();
    const have = await downloadPortraits(heroes.list);
    let meta = null;
    try {
      meta = JSON.parse(readFileSync(META, 'utf8'));
    } catch { /* ainda não gerado */ }
    if (!meta || meta.version !== VERSION || meta.names.length !== have.length || !existsSync(BIN)) {
      log(`Preparando ${have.length} retratos de referência (só na primeira vez)...`);
      const names = await buildTemplateFile({ dir: PORTRAIT_DIR, out: BIN, width: TEMPLATE_W, height: TEMPLATE_H, crop: CROP });
      meta = { version: VERSION, names };
      writeFileSync(META, JSON.stringify(meta));
    }
    return loadTemplates(BIN, meta.names);
  })().catch((err) => {
    ready = null;
    throw err;
  });
  return ready;
}
