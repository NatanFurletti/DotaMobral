// Calcula quando avisar cada evento a partir do relógio do jogo (map.clock_time).

const ACTIVE_STATES = new Set([
  'DOTA_GAMERULES_STATE_PRE_GAME',
  'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS',
]);

// Próximo horário de spawn >= clock, ou null se não houver mais.
export function nextSpawn(event, clock) {
  if (Array.isArray(event.times)) {
    const next = event.times.filter((t) => t >= clock).sort((a, b) => a - b)[0];
    return next ?? null;
  }
  if (clock <= event.first) return event.first;
  const k = Math.ceil((clock - event.first) / event.interval);
  const spawn = event.first + k * event.interval;
  if (event.last != null && spawn > event.last) return null;
  return spawn;
}

export class TimerEngine {
  constructor(config, onAlerts) {
    this.config = config;
    this.onAlerts = onAlerts;
    this.matchId = null;
    this.reset();
  }

  reset() {
    this.fired = new Set();
    this.lastClock = null;
  }

  update(state) {
    const map = state?.map;
    if (!map || typeof map.clock_time !== 'number') return;
    if (!ACTIVE_STATES.has(map.game_state)) return;

    if (map.matchid && map.matchid !== this.matchId) {
      this.matchId = map.matchid;
      this.reset();
    }

    const clock = map.clock_time;
    // Relógio voltou (replay, nova partida sem matchid): recomeça.
    if (this.lastClock !== null && clock < this.lastClock - 5) this.reset();
    this.lastClock = clock;

    const { defaultLead = 15, tolerance = 3 } = this.config;
    const due = [];

    for (const event of this.config.events) {
      if (!event.enabled) continue;
      const spawn = nextSpawn(event, clock);
      if (spawn === null) continue;

      const alertAt = spawn - (event.lead ?? defaultLead);
      const key = `${event.id}@${spawn}`;
      // A tolerância evita avisos atrasados quando o app conecta no meio da partida.
      if (clock >= alertAt && clock - alertAt <= tolerance && !this.fired.has(key)) {
        this.fired.add(key);
        due.push({ event, spawn, secondsLeft: spawn - clock });
      }
    }

    if (due.length) this.onAlerts(due, clock);
  }
}

// "runa de poder e runas de recompensa em 15 segundos"
export function composeMessage(alerts) {
  const labels = alerts.map((a) => a.event.label);
  const names = labels.length > 1
    ? `${labels.slice(0, -1).join(', ')} e ${labels.at(-1)}`
    : labels[0];
  const secs = Math.max(0, Math.round(Math.min(...alerts.map((a) => a.secondsLeft))));
  const text = secs > 0 ? `${names} em ${secs} segundos` : `${names} agora`;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function formatClock(seconds) {
  const sign = seconds < 0 ? '-' : '';
  const abs = Math.abs(seconds);
  return `${sign}${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, '0')}`;
}
