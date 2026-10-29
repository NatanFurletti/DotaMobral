import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function loadJson(relPath) {
  return JSON.parse(readFileSync(path.join(ROOT, relPath), 'utf8'));
}

export const appConfig = loadJson('config/app.json');
// PORT=xxxx permite rodar um segundo assistente (ex.: testes) sem conflitar.
if (process.env.PORT) appConfig.port = Number(process.env.PORT);

// Modo de jogo: --turbo na linha de comando, ou "mode": "turbo" em config/app.json.
export const gameMode = process.argv.includes('--turbo') || appConfig.mode === 'turbo' ? 'turbo' : 'normal';
export const timersConfig = loadJson(gameMode === 'turbo' ? 'config/timers-turbo.json' : 'config/timers.json');
