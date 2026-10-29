// Onde ficam os arquivos, tanto rodando com `npm start` quanto dentro do DotaMobral.exe.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sea from 'node:sea';

// true quando roda empacotado no .exe (Single Executable Application do Node).
export const isSea = sea.isSea();

// Pasta do projeto (no .exe, a pasta onde o .exe está).
export const ROOT = isSea
  ? path.dirname(process.execPath)
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Configurações do usuário e sons extraídos: %APPDATA%\DotaMobral
export const DATA_DIR = path.join(
  process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'),
  'DotaMobral',
);
mkdirSync(DATA_DIR, { recursive: true });

// Lê um arquivo do projeto (config, sons, interface). No .exe eles vêm embutidos.
export function readAsset(relPath) {
  if (isSea) return Buffer.from(sea.getAsset(relPath));
  return readFileSync(path.join(ROOT, relPath));
}

export const readJsonAsset = (relPath) => JSON.parse(readAsset(relPath).toString('utf8'));

// Caminho real de um som no disco (o Windows precisa de um arquivo para tocar).
// No .exe, extrai o som embutido para a pasta de dados uma vez por execução.
const extracted = new Map();
export function soundPath(relPath) {
  if (!relPath) return null;
  if (!isSea || path.isAbsolute(relPath)) return path.resolve(ROOT, relPath);
  if (extracted.has(relPath)) return extracted.get(relPath);
  let target = null;
  try {
    target = path.join(DATA_DIR, relPath);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, readAsset(relPath));
  } catch {
    target = null;
  }
  extracted.set(relPath, target);
  return target;
}
