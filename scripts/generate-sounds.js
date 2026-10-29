// Gera sons originais (sintetizados por código) para cada evento, em sounds/*.wav.
// Nada aqui vem do jogo: os sons só lembram o tema de cada runa.
// Uso: npm run generate-sounds
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT } from '../src/config.js';

const RATE = 44100;
const TAU = Math.PI * 2;

// Gerador pseudoaleatório com semente fixa: o som sai igual toda vez.
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const buffer = (seconds) => new Float32Array(Math.ceil(seconds * RATE));

// Soma um tom com parciais (frequência relativa, amplitude) e decaimento exponencial.
function addTone(buf, { start = 0, freq, partials = [[1, 1]], decay = 0.3, attack = 0.002, gain = 1, sweepTo = null, sweepTime = 0 }) {
  const first = Math.floor(start * RATE);
  const length = Math.min(buf.length - first, Math.ceil(decay * 8 * RATE));
  const phases = partials.map(() => 0);
  for (let i = 0; i < length; i++) {
    const t = i / RATE;
    let f = freq;
    if (sweepTo && sweepTime) f = freq * (sweepTo / freq) ** Math.min(t / sweepTime, 1);
    const env = Math.min(t / attack, 1) * Math.exp(-t / decay);
    let sample = 0;
    partials.forEach(([ratio, amp], k) => {
      phases[k] += (TAU * f * ratio) / RATE;
      sample += Math.sin(phases[k]) * amp;
    });
    buf[first + i] += sample * env * gain;
  }
}

function addNoise(buf, { start = 0, duration, gain = 0.3, decay = 0.01, seed = 1 }) {
  const rand = rng(seed);
  const first = Math.floor(start * RATE);
  const length = Math.min(buf.length - first, Math.ceil(duration * RATE));
  for (let i = 0; i < length; i++) {
    buf[first + i] += (rand() * 2 - 1) * gain * Math.exp(-i / RATE / decay);
  }
}

// --- Sons -------------------------------------------------------------------

// Moedas: punhado de moedas caindo (parciais inarmônicas), mais densas no começo.
function coins() {
  const buf = buffer(1.0);
  const rand = rng(42);
  const metal = [[1, 1], [2.76, 0.6], [5.4, 0.35], [8.93, 0.2]];
  const count = 16;
  for (let i = 0; i < count; i++) {
    // Intervalos crescem: começa como uma cascata e vai espalhando.
    const start = 0.7 * (i / count) ** 1.4 + rand() * 0.015;
    const freq = 1900 + rand() * 1700;
    addNoise(buf, { start, duration: 0.01, gain: 0.2, decay: 0.003, seed: i + 7 });
    addTone(buf, { start, freq, partials: metal, decay: 0.05 + rand() * 0.07, gain: (0.85 - i * 0.035) * (0.7 + rand() * 0.3) });
  }
  return buf;
}

// Runa de poder: energia subindo e um "ping" brilhante no final.
function power() {
  const buf = buffer(0.9);
  addTone(buf, { freq: 180, sweepTo: 880, sweepTime: 0.45, partials: [[1, 1], [2, 0.5], [3, 0.3], [4, 0.15]], decay: 0.35, attack: 0.05, gain: 0.6 });
  addTone(buf, { start: 0.42, freq: 1320, partials: [[1, 1], [2.01, 0.4], [3.02, 0.2]], decay: 0.18, gain: 0.7 });
  return buf;
}

// Água: três bolhas (tom curto com a frequência subindo rápido).
function water() {
  const buf = buffer(0.6);
  [[0, 380], [0.13, 520], [0.24, 450]].forEach(([start, freq]) => {
    addTone(buf, { start, freq, sweepTo: freq * 2.6, sweepTime: 0.05, decay: 0.035, attack: 0.003, gain: 0.9 });
  });
  return buf;
}

// Sabedoria: arpejo de sinos "místico" (dó-mi-sol-dó).
function wisdom() {
  const buf = buffer(1.6);
  const bell = [[1, 1], [2.0, 0.5], [2.92, 0.3], [4.1, 0.15]];
  [1046.5, 1318.5, 1568, 2093].forEach((freq, i) => {
    addTone(buf, { start: i * 0.11, freq, partials: bell, decay: 0.35, attack: 0.004, gain: 0.55 });
  });
  return buf;
}

// Lótus: acorde suave de cura (lá maior) com entrada lenta e um brilho por cima.
function lotus() {
  const buf = buffer(1.6);
  [440, 554.4, 659.3].forEach((freq) => {
    addTone(buf, { freq, partials: [[1, 1], [2, 0.15]], decay: 0.5, attack: 0.18, gain: 0.35 });
  });
  addTone(buf, { start: 0.2, freq: 1760, partials: [[1, 1]], decay: 0.25, attack: 0.01, gain: 0.25 });
  addTone(buf, { start: 0.32, freq: 2217, partials: [[1, 1]], decay: 0.25, attack: 0.01, gain: 0.2 });
  return buf;
}

// Tormentor: gongo grave e ameaçador.
function tormentor() {
  const buf = buffer(2.2);
  addNoise(buf, { duration: 0.03, gain: 0.3, decay: 0.01, seed: 99 });
  addTone(buf, { freq: 73, partials: [[1, 1], [1.48, 0.6], [2.31, 0.45], [3.17, 0.3], [4.6, 0.15]], decay: 0.55, attack: 0.005, gain: 0.9 });
  addTone(buf, { start: 0.02, freq: 55, partials: [[1, 1]], decay: 0.7, attack: 0.02, gain: 0.5 });
  return buf;
}

// --- WAV --------------------------------------------------------------------

function toWav(samples, peak = 0.8) {
  const max = samples.reduce((m, v) => Math.max(m, Math.abs(v)), 0) || 1;
  const fadeOut = Math.floor(0.01 * RATE);
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((v, i) => {
    const fade = Math.min(1, (samples.length - i) / fadeOut);
    data.writeInt16LE(Math.round((v / max) * peak * fade * 32767), i * 2);
  });
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

const sounds = { bounty: coins, power, water, wisdom, lotus, tormentor };
const dir = path.join(ROOT, 'sounds');
mkdirSync(dir, { recursive: true });
for (const [name, make] of Object.entries(sounds)) {
  const file = path.join(dir, `${name}.wav`);
  writeFileSync(file, toWav(make()));
  console.log(`Criado: sounds/${name}.wav`);
}
