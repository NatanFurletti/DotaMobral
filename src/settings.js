// Escolhas do usuário (modo, volumes, avisos ligados e antecedência), salvas em %APPDATA%\DotaMobral.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { DATA_DIR, readJsonAsset } from './paths.js';

const FILE = path.join(DATA_DIR, 'settings.json');
const defaults = readJsonAsset('config/app.json');

export const PROFILES = {
  normal: readJsonAsset('config/timers.json'),
  turbo: readJsonAsset('config/timers-turbo.json'),
};

export function loadSettings() {
  let saved = {};
  try {
    saved = JSON.parse(readFileSync(FILE, 'utf8'));
  } catch { /* primeira vez: usa o padrão */ }
  return {
    mode: defaults.mode === 'turbo' ? 'turbo' : 'normal',
    volume: defaults.volume ?? 80,
    soundVolume: defaults.soundVolume ?? 60,
    events: {},
    ...saved,
  };
}

export function saveSettings(settings) {
  writeFileSync(FILE, JSON.stringify(settings, null, 2), 'utf8');
}

const clamp = (n, min, max) => Math.min(Math.max(Number(n) || 0, min), max);

// Junta uma alteração vinda da interface, aceitando só campos conhecidos.
export function mergeSettings(settings, patch) {
  const next = { ...settings, events: { ...settings.events } };
  if (patch.mode === 'normal' || patch.mode === 'turbo') next.mode = patch.mode;
  if (patch.autoScan !== undefined) next.autoScan = Boolean(patch.autoScan);
  if (patch.volume !== undefined) next.volume = clamp(patch.volume, 0, 100);
  if (patch.soundVolume !== undefined) next.soundVolume = clamp(patch.soundVolume, 0, 100);
  for (const [id, change] of Object.entries(patch.events ?? {})) {
    const current = { ...next.events[id] };
    if (change.enabled !== undefined) current.enabled = Boolean(change.enabled);
    if (change.lead !== undefined) current.lead = clamp(change.lead, 0, 120);
    next.events[id] = current;
  }
  return next;
}

// Perfil do modo escolhido com as preferências do usuário aplicadas.
// As preferências valem para os dois modos (ex.: lótus 10 s no normal e no Turbo).
export function buildTimers(settings) {
  const base = PROFILES[settings.mode] ?? PROFILES.normal;
  return {
    ...base,
    events: base.events.map((event) => {
      const override = settings.events?.[event.id] ?? {};
      return {
        ...event,
        ...(override.enabled !== undefined && { enabled: override.enabled }),
        ...(override.lead !== undefined && { lead: override.lead }),
      };
    }),
  };
}
