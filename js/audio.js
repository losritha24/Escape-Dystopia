/** Shared audio context for the score and the short interface tones. */

let ctx = null;
let master = null;
let muted = true;

export function isMuted() {
  return muted;
}

/** Silence the score and the interface tones together. The label follows this flag. */
export function setMuted(next) {
  muted = next;
  if (!master || !ctx) return muted;
  const gain = master.gain;
  gain.cancelScheduledValues(ctx.currentTime);
  gain.setValueAtTime(muted ? 0 : 1, ctx.currentTime);
  return muted;
}

export function getAudio() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!ctx) {
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 1;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") ctx.resume();
  return { ctx, master };
}

function tone(freq, t, dur, type, gain) {
  const audio = getAudio();
  if (!audio) return;
  const osc = audio.ctx.createOscillator();
  const amp = audio.ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const start = audio.ctx.currentTime + t;
  amp.gain.setValueAtTime(gain, start);
  amp.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(amp);
  amp.connect(audio.master);
  osc.start(start);
  osc.stop(start + dur + 0.02);
}

export function playSfx(kind) {
  if (muted) return;
  if (kind === "send") tone(520, 0, 0.08, "square", 0.04);
  else if (kind === "good") {
    tone(440, 0, 0.1, "triangle", 0.05);
    tone(660, 0.09, 0.14, "triangle", 0.05);
  } else if (kind === "wipe") tone(180, 0, 0.2, "sawtooth", 0.03);
  else if (kind === "caught") {
    tone(140, 0, 0.18, "square", 0.05);
    tone(90, 0.12, 0.28, "square", 0.05);
  } else if (kind === "chime") {
    tone(523, 0, 0.12, "sine", 0.05);
    tone(659, 0.16, 0.12, "sine", 0.05);
    tone(784, 0.32, 0.2, "sine", 0.05);
  } else if (kind === "blackout") tone(70, 0, 0.4, "sine", 0.06);
  else if (kind === "sample") tone(880, 0, 0.07, "square", 0.03);
}
