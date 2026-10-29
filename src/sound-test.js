import { existsSync } from 'node:fs';
import { soundPath } from './paths.js';

// Coloca na fila: nome do evento e, em seguida, o som ou a palavra dele.
export function queueTestSounds(speaker, timers) {
  for (const event of timers.events) {
    if (!event.sound && !event.say) continue;
    speaker.say(event.label);
    if (event.say) {
      speaker.say(event.say);
      continue;
    }
    const file = soundPath(event.sound);
    if (file && existsSync(file)) speaker.play(file);
    else speaker.say('arquivo não encontrado');
  }
}
