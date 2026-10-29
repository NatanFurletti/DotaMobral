// Toca o som de cada evento, anunciando o nome antes, para conferir como ficou.
// Uso: npm run test-sounds   (ou: npm run test-sounds -- --turbo)
import { appConfig } from '../src/config.js';
import { buildTimers, loadSettings } from '../src/settings.js';
import { createSpeaker } from '../src/speaker.js';
import { queueTestSounds } from '../src/sound-test.js';

const settings = loadSettings();
if (process.argv.includes('--turbo')) settings.mode = 'turbo';

const speaker = createSpeaker({ ...appConfig, volume: settings.volume, soundVolume: settings.soundVolume });
queueTestSounds(speaker, buildTimers(settings));
speaker.close(); // fecha a fila: o processo termina depois de tocar tudo
