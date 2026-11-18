/**
 * Generative score for the Hollow.
 * A slow D-phrygian ostinato over a detuned mine drone and a pump pulse.
 * Moods only change loudness and which phrase is playing. The clock keeps running.
 */

import { getAudio, isMuted, setMuted } from "./audio.js?v=10";

const BPM = 52;
const PHRYGIAN = [62, 63, 65, 67, 69, 70, 72, 74];
/** Degrees into PHRYGIAN. The flat second (1) is the sour note. */
const PHRASE = [0, 2, 1, 4, 0, 6, 5, 3];
/** Same rhythm, but the line opens upward for the hatch ending. */
const LIFT = [0, 4, 2, 7, 4, 2, 4, 0];

const MOODS = {
  brief: { drone: 0.09, pulse: 0.035, motif: 0.045, air: 0.012, filter: 220, beat: 1.15 },
  prepare: { drone: 0.11, pulse: 0.05, motif: 0.055, air: 0.016, filter: 260, beat: 1.05 },
  run: { drone: 0.13, pulse: 0.08, motif: 0.06, air: 0.035, filter: 340, beat: 1 },
  patrol: { drone: 0.14, pulse: 0.11, motif: 0.04, air: 0.03, filter: 280, beat: 0.86 },
  blackout: { drone: 0.16, pulse: 0, motif: 0.015, air: 0.006, filter: 120, beat: 1.35 },
  hold: { drone: 0.11, pulse: 0.05, motif: 0.07, air: 0.02, filter: 300, beat: 1.05 },
  hatch: { drone: 0.1, pulse: 0.045, motif: 0.08, air: 0.022, filter: 420, beat: 1.08 },
  burned: { drone: 0.15, pulse: 0.03, motif: 0.02, air: 0.008, filter: 140, beat: 1.25 },
};

let started = false;
let moodName = "brief";
let nextBeat = 0;
let step = 0;
let nodes = null;

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
  filter.frequency.value = 220;
  filter.Q.value = 0.7;
  filter.connect(drone);
  drone.connect(music);

  const fundamental = 73.42;
  for (const detune of [-14, -4, 7, 16]) {
    const osc = ctx.createOscillator();
    osc.type = detune % 2 === 0 ? "sawtooth" : "triangle";
    osc.frequency.value = fundamental;
    osc.detune.value = detune;
    const trim = ctx.createGain();
    trim.gain.value = 0.18;
    osc.connect(trim);
    trim.connect(filter);
    osc.start();
  }
  const sub = ctx.createOscillator();
  sub.type = "sine";
  sub.frequency.value = fundamental / 2;
  const subGain = ctx.createGain();
  subGain.gain.value = 0.55;
  sub.connect(subGain);
  subGain.connect(drone);
  sub.start();

  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.055;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 70;
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
  motifFilter.frequency.value = 1400;
  motifFilter.Q.value = 0.6;
  motif.connect(motifFilter);
  motifFilter.connect(music);

  const air = ctx.createGain();
  air.gain.value = 0;
  const airFilter = ctx.createBiquadFilter();
  airFilter.type = "bandpass";
  airFilter.frequency.value = 1800;
  airFilter.Q.value = 0.8;
  const noise = noiseSource(ctx);
  noise.connect(airFilter);
  airFilter.connect(air);
  air.connect(music);
  noise.start();

  nodes = { ctx, music, drone, filter, pulse, motif, air };
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

function applyMood(immediate) {
  if (!nodes) return;
  const mood = MOODS[moodName] || MOODS.brief;
  const now = nodes.ctx.currentTime;
  const ramp = immediate ? 0.02 : 0.6;
  for (const [node, value] of [
    [nodes.drone, mood.drone],
    [nodes.pulse, mood.pulse],
    [nodes.motif, mood.motif],
    [nodes.air, mood.air],
  ]) {
    node.gain.setTargetAtTime(isMuted() ? 0 : value, now, ramp);
  }
  nodes.filter.frequency.setTargetAtTime(mood.filter, now, ramp);
}

function scheduleBeat(when) {
  const mood = MOODS[moodName] || MOODS.brief;
  const { ctx } = nodes;
  if (step % 2 === 0 && mood.pulse > 0) {
    const thump = ctx.createOscillator();
    const amp = ctx.createGain();
    thump.type = "sine";
    thump.frequency.setValueAtTime(78, when);
    thump.frequency.exponentialRampToValueAtTime(38, when + 0.18);
    amp.gain.setValueAtTime(0.0001, when);
    amp.gain.exponentialRampToValueAtTime(0.9, when + 0.015);
    amp.gain.exponentialRampToValueAtTime(0.0001, when + 0.28);
    thump.connect(amp);
    amp.connect(nodes.pulse);
    thump.start(when);
    thump.stop(when + 0.32);
  }

  if (step % 2 === 0) {
    const phrase = moodName === "hatch" ? LIFT : PHRASE;
    const degree = phrase[(step / 2) % phrase.length];
    const midi = PHRYGIAN[degree];
    playTone(midi, when, mood.beat * 1.7, moodName === "burned" ? 0.22 : 0.4);
    if (step % 8 === 0) playTone(midi - 12, when, mood.beat * 3.2, 0.18);
  }
  step += 1;
}

function playTone(midi, when, dur, peak) {
  const { ctx } = nodes;
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = "triangle";
  osc.frequency.value = midiToFreq(midi);
  amp.gain.setValueAtTime(0.0001, when);
  amp.gain.exponentialRampToValueAtTime(peak, when + 0.08);
  amp.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  osc.connect(amp);
  amp.connect(nodes.motif);
  osc.start(when);
  osc.stop(when + dur + 0.05);
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
    button.textContent = on ? "Sound on" : "Sound off";
    button.setAttribute("aria-pressed", String(on));
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
