/**
 * Generative score for the Hollow.
 * A slow open-fifth drone, a sparse line that hangs on the flat fifth, and a long echo.
 * Moods only change loudness and which phrase is playing. The clock keeps running.
 */

import { getAudio, isMuted, setMuted } from "./audio.js?v=17";

const BPM = 40;
/** D Eb F Ab A Bb C D. Ab, the flat fifth, keeps the line from settling. */
const SCALE = [62, 63, 65, 68, 69, 70, 72, 74];
/** -1 is a rest. The gaps are what make the line feel like it is listening. */
const PHRASE = [0, -1, 4, -1, 3, -1, 6, 1, -1, 4, -1, 7];
/** Same space, but the line reaches up when the surface holds. */
const LIFT = [4, -1, 7, -1, 4, 2, -1, 7, -1, 4, -1, 0];

const MOODS = {
  brief: { drone: 0.07, pulse: 0.012, motif: 0.05, air: 0.02, filter: 150, beat: 1.22 },
  prepare: { drone: 0.08, pulse: 0.016, motif: 0.058, air: 0.022, filter: 180, beat: 1.12 },
  run: { drone: 0.09, pulse: 0.024, motif: 0.064, air: 0.03, filter: 210, beat: 1 },
  patrol: { drone: 0.1, pulse: 0.036, motif: 0.042, air: 0.024, filter: 170, beat: 0.92 },
  blackout: { drone: 0.12, pulse: 0, motif: 0.018, air: 0.004, filter: 80, beat: 1.5 },
  hold: { drone: 0.08, pulse: 0.014, motif: 0.07, air: 0.024, filter: 200, beat: 1.12 },
  hatch: { drone: 0.065, pulse: 0.012, motif: 0.082, air: 0.028, filter: 300, beat: 1.16 },
  burned: { drone: 0.11, pulse: 0.008, motif: 0.022, air: 0.006, filter: 90, beat: 1.38 },
};

let started = false;
let moodName = "brief";
let nextBeat = 0;
let step = 0;
let nodes = null;
/** Notes already on the clock. Mute has to stop these, not only refuse new ones. */
let live = [];

function midiToFreq(midi) {
  return 440 * 2 ** ((midi - 69) / 12);
}

function build(audio) {
  const { ctx, master } = audio;
  const music = ctx.createGain();
  music.gain.value = 1;
  music.connect(master);

  const drone = ctx.createGain();
  drone.gain.value = 0;
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 160;
  filter.Q.value = 0.5;
  filter.connect(drone);
  drone.connect(music);

  const fundamental = 73.42;
  for (const partial of [
    { freq: fundamental, type: "sine", gain: 0.46, detune: -5 },
    { freq: fundamental, type: "sine", gain: 0.32, detune: 6 },
    { freq: fundamental * 1.5, type: "sine", gain: 0.11, detune: 4 },
    { freq: fundamental * 2, type: "triangle", gain: 0.05, detune: -9 },
  ]) {
    const osc = ctx.createOscillator();
    osc.type = partial.type;
    osc.frequency.value = partial.freq;
    osc.detune.value = partial.detune;
    const trim = ctx.createGain();
    trim.gain.value = partial.gain;
    osc.connect(trim);
    trim.connect(filter);
    osc.start();
  }
  const sub = ctx.createOscillator();
  sub.type = "sine";
  sub.frequency.value = fundamental / 2;
  const subGain = ctx.createGain();
  subGain.gain.value = 0.42;
  sub.connect(subGain);
  subGain.connect(drone);
  sub.start();

  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.028;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 26;
  lfo.connect(lfoGain);
  lfoGain.connect(filter.frequency);
  lfo.start();

  const pulse = ctx.createGain();
  pulse.gain.value = 0;
  pulse.connect(music);

  const motif = ctx.createGain();
  motif.gain.value = 0;
  const motifFilter = ctx.createBiquadFilter();
  motifFilter.type = "lowpass";
  motifFilter.frequency.value = 1600;
  motifFilter.Q.value = 0.4;
  motif.connect(motifFilter);

  const delay = ctx.createDelay(1.5);
  delay.delayTime.value = 0.72;
  const feedback = ctx.createGain();
  feedback.gain.value = 0.4;
  const delayFilter = ctx.createBiquadFilter();
  delayFilter.type = "lowpass";
  delayFilter.frequency.value = 780;
  motifFilter.connect(music);
  motifFilter.connect(delay);
  delay.connect(delayFilter);
  delayFilter.connect(feedback);
  feedback.connect(delay);
  delayFilter.connect(music);

  const air = ctx.createGain();
  air.gain.value = 0;
  const airFilter = ctx.createBiquadFilter();
  airFilter.type = "bandpass";
  airFilter.frequency.value = 640;
  airFilter.Q.value = 0.45;
  const noise = noiseSource(ctx);
  noise.connect(airFilter);
  airFilter.connect(air);
  air.connect(music);
  noise.start();

  nodes = { ctx, music, drone, filter, pulse, motif, air, feedback };
  applyMood(true);
}

function noiseSource(ctx) {
  const length = ctx.sampleRate * 2;
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.loop = true;
  return src;
}

function cutGain(param, value) {
  param.cancelScheduledValues(0);
  param.value = value;
}

function track(node, startAt) {
  live.push({ node, startAt });
  node.addEventListener("ended", () => {
    live = live.filter((item) => item.node !== node);
  });
}

function silenceVoices() {
  if (!nodes) return;
  cutGain(nodes.drone.gain, 0);
  cutGain(nodes.pulse.gain, 0);
  cutGain(nodes.motif.gain, 0);
  cutGain(nodes.air.gain, 0);
  cutGain(nodes.feedback.gain, 0);
  const now = nodes.ctx.currentTime;
  const playing = live.splice(0, live.length);
  for (const item of playing) {
    try { item.node.stop(Math.max(now, item.startAt)); } catch (err) { /* already ended */ }
  }
}

function applyMood(immediate) {
  if (!nodes) return;
  const mood = MOODS[moodName] || MOODS.brief;
  const muted = isMuted();
  const now = nodes.ctx.currentTime;
  for (const [node, value] of [
    [nodes.drone, mood.drone],
    [nodes.pulse, mood.pulse],
    [nodes.motif, mood.motif],
    [nodes.air, mood.air],
  ]) {
    const level = muted ? 0 : value;
    if (muted || immediate) cutGain(node.gain, level);
    else {
      node.gain.cancelScheduledValues(now);
      node.gain.setValueAtTime(node.gain.value, now);
      node.gain.setTargetAtTime(level, now, 0.9);
    }
  }
  cutGain(nodes.feedback.gain, muted ? 0 : 0.4);
  nodes.filter.frequency.setTargetAtTime(mood.filter, now, immediate ? 0.02 : 0.9);
}

function scheduleBeat(when) {
  const mood = MOODS[moodName] || MOODS.brief;
  const { ctx } = nodes;
  if (step % 8 === 0 && mood.pulse > 0) {
    const knock = ctx.createOscillator();
    const amp = ctx.createGain();
    knock.type = "sine";
    knock.frequency.setValueAtTime(52, when);
    knock.frequency.exponentialRampToValueAtTime(36, when + 0.55);
    amp.gain.setValueAtTime(0.0001, when);
    amp.gain.exponentialRampToValueAtTime(0.4, when + 0.04);
    amp.gain.exponentialRampToValueAtTime(0.0001, when + 0.7);
    knock.connect(amp);
    amp.connect(nodes.pulse);
    knock.start(when);
    knock.stop(when + 0.75);
    track(knock, when);
  }

  if (step % 2 === 0) {
    const phrase = moodName === "hatch" ? LIFT : PHRASE;
    const degree = phrase[(step / 2) % phrase.length];
    if (degree >= 0) {
      const midi = SCALE[degree];
      playTone(midi, when, mood.beat * 3.1, moodName === "burned" ? 0.16 : 0.3);
      if (step % 16 === 0) playTone(midi - 7, when + 0.08, mood.beat * 4.4, 0.1);
    }
  }
  step += 1;
}

function playTone(midi, when, dur, peak) {
  const { ctx } = nodes;
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = midiToFreq(midi);
  const swell = Math.min(0.55, dur * 0.28);
  amp.gain.setValueAtTime(0.0001, when);
  amp.gain.exponentialRampToValueAtTime(peak, when + swell);
  amp.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  osc.connect(amp);
  amp.connect(nodes.motif);
  osc.start(when);
  osc.stop(when + dur + 0.05);
  track(osc, when);

  const halo = ctx.createOscillator();
  const haloAmp = ctx.createGain();
  halo.type = "sine";
  halo.frequency.value = midiToFreq(midi + 12);
  halo.detune.value = 9;
  haloAmp.gain.setValueAtTime(0.0001, when);
  haloAmp.gain.exponentialRampToValueAtTime(peak * 0.16, when + swell + 0.15);
  haloAmp.gain.exponentialRampToValueAtTime(0.0001, when + dur * 1.25);
  halo.connect(haloAmp);
  haloAmp.connect(nodes.motif);
  halo.start(when);
  halo.stop(when + dur * 1.3);
  track(halo, when);
}

function arm() {
  if (!started || !nodes) return;
  if (!isMuted()) {
    const mood = MOODS[moodName] || MOODS.brief;
    const beat = (60 / BPM) * mood.beat;
    const horizon = nodes.ctx.currentTime + 0.35;
    if (nextBeat < nodes.ctx.currentTime) nextBeat = nodes.ctx.currentTime + 0.05;
    while (nextBeat < horizon) {
      scheduleBeat(nextBeat);
      nextBeat += beat;
    }
  }
  window.setTimeout(arm, 120);
}

export function unlockScore() {
  const audio = getAudio();
  if (!audio || started) return;
  started = true;
  build(audio);
  arm();
}

export function toggleScore() {
  const nextMuted = !isMuted();
  if (!nextMuted) unlockScore();
  setMuted(nextMuted);
  if (nextMuted) silenceVoices();
  applyMood(true);
  return nextMuted;
}

export function syncScore(nextMood) {
  if (!MOODS[nextMood] || nextMood === moodName) return;
  moodName = nextMood;
  applyMood(false);
}

export function bindMusic(button) {
  const paint = (on) => {
    button.textContent = on ? "Sound off" : "Sound on";
    button.setAttribute("aria-pressed", String(on));
    button.setAttribute("aria-label", on ? "Turn sound off" : "Turn sound on");
  };

  button.addEventListener("click", (event) => {
    event.stopPropagation();
    paint(!toggleScore());
  });

  const resume = (event) => {
    const node = event.target instanceof Node ? event.target : null;
    const el = node instanceof Element ? node : node?.parentElement;
    if (el && el.closest("#sound-toggle")) return;
    if (isMuted()) return;
    unlockScore();
    paint(started && !isMuted());
  };
  window.addEventListener("pointerdown", resume);
  window.addEventListener("keydown", resume);
  paint(false);
}
