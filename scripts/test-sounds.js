// Toca o som de cada evento, anunciando o nome antes, para conferir como ficou.
// Uso: npm run test-sounds
import { existsSync } from 'node:fs';
import path from 'node:path';
import { ROOT, appConfig, timersConfig } from '../src/config.js';
import { createSpeaker } from '../src/speaker.js';

const speaker = createSpeaker(appConfig);
for (const event of timersConfig.events) {
  if (!event.enabled || (!event.sound && !event.say)) continue;
  speaker.say(event.label);
  if (event.say) {
    speaker.say(event.say);
    continue;
  }
  const file = path.resolve(ROOT, event.sound);
  if (existsSync(file)) speaker.play(file);
  else speaker.say('arquivo não encontrado');
}
speaker.close(); // fecha a fila: o processo termina depois de tocar tudo
