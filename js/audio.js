/** Short tones only. Resumes after the first gesture if the browser blocked audio. */

let ctx = null;

function ac() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

function tone(freq, t, dur, type, gain) {
  const audio = ac();
  if (!audio) return;
  const osc = audio.createOscillator();
  const amp = audio.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  amp.gain.setValueAtTime(gain, audio.currentTime + t);
  amp.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + t + dur);
  osc.connect(amp);
  amp.connect(audio.destination);
  osc.start(audio.currentTime + t);
  osc.stop(audio.currentTime + t + dur + 0.02);
}

export function playSfx(kind) {
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
