/**
 * Expedition simulation.
 * Surface time always advances. Scout schedules use scoutClock, which a
 * blackout can freeze. Burns resolve against where a scout actually is.
 */

import {
  BLACKOUT_AT,
  BURNS,
  FUSE,
  PATROL,
  PAYLOADS,
  READ_TIME,
  RUN_LIMIT,
  SAMPLE_COPY,
  SCOUTS,
  SITES,
  SURGE_AT,
  WORLD,
} from "./data.js?v=10";

const REACH = WORLD.reach;

export function scoutDef(id) {
  return SCOUTS.find((s) => s.id === id);
}

/** Where a scout is at a given schedule time. Transit lerps between posts. */
export function locate(def, clock) {
  const period = def.period;
  const t = ((clock % period) + period) % period;
  const segs = def.segments;
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    const last = i === segs.length - 1;
    const inside = last ? t >= s.t0 && t <= s.t1 : t >= s.t0 && t < s.t1;
    if (!inside) continue;
    if (s.post !== "transit") {
      return { post: s.post, label: s.label, exposed: s.exposed, level: s.level, x: s.x };
    }
    const prev = segs[(i + segs.length - 1) % segs.length];
    const next = segs[(i + 1) % segs.length];
    const span = Math.max(0.001, s.t1 - s.t0);
    const u = Math.min(1, (t - s.t0) / span);
    return {
      post: "transit",
      label: "In transit",
      exposed: false,
      level: prev.level + (next.level - prev.level) * u,
      x: prev.x + (next.x - prev.x) * u,
    };
  }
  const first = segs[0];
  return { post: first.post, label: first.label, exposed: first.exposed, level: first.level, x: first.x };
}

export function patrolActive(time) {
  const m = ((time % PATROL.period) + PATROL.period) % PATROL.period;
  return m >= PATROL.on && m < PATROL.off;
}

export function patrolEta(time) {
  const m = ((time % PATROL.period) + PATROL.period) % PATROL.period;
  if (m >= PATROL.on && m < PATROL.off) return { active: true, seconds: PATROL.off - m };
  if (m < PATROL.on) return { active: false, seconds: PATROL.on - m };
  return { active: false, seconds: PATROL.period - m + PATROL.on };
}

export function siteAt(x) {
  let best = null;
  let bestD = REACH;
  for (const site of SITES) {
    const d = Math.abs(site.x - x);
    if (d <= bestD) {
      best = site;
      bestD = d;
    }
  }
  return best;
}

function gusting(time) {
  return Math.floor(time / 2.5) % 2 === 0;
}

function pushLog(run, text) {
  run.log.unshift(text);
  run.log.length = Math.min(run.log.length, 7);
}

function banner(run, text, tone) {
  run.banner = { text, tone, age: 0 };
}

function sfx(run, kind) {
  run.sfx.push(kind);
}

export function availablePayloads(run) {
  const list = [];
  const haveSample = run.samples.air || run.samples.rad || run.samples.soil;
  if (haveSample && !run.sent.truth) {
    const bits = ["air", "rad", "soil"].filter((k) => run.samples[k]).map((k) => SAMPLE_COPY[k].short);
    list.push({ id: "truth", label: PAYLOADS.truth.label, detail: bits.join(" · ") });
  }
  for (const id of ["mesh", "bulkhead", "lamps", "chimes", "clocks"]) {
    if (run.pack[id] > 0 && !run.sent[id]) {
      list.push({ id, label: PAYLOADS[id].label, detail: "Packed salvage" });
    }
  }
  if (run.outpostPlanted && run.pack.outpost > 0 && !run.sent.outpost) {
    const site = SITES.find((s) => s.id === run.outpostPlanted);
    list.push({ id: "outpost", label: PAYLOADS.outpost.label, detail: site ? `Planted at ${site.name}` : "Planted" });
  }
  return list;
}

function accepts(payloadId, scoutId, loc) {
  const spec = PAYLOADS[payloadId];
  if (!spec) return false;
  if (!spec.scouts.includes(scoutId)) return false;
  if (loc.post === "transit") return false;
  return spec.posts.includes(loc.post);
}

/**
 * Will this scout be able to read the payload before the fuse dies,
 * if nobody freezes and the patrol stays on its published sweep?
 */
export function forecast(run, scoutId, payloadId) {
  const def = scoutDef(scoutId);
  const scout = run.scouts[scoutId];
  const spec = PAYLOADS[payloadId];
  if (!spec.scouts.includes(scoutId)) {
    return { ok: false, text: "Cannot use this." };
  }
  if (scout.caught) return { ok: false, text: "Detained. Terminal seized." };

  const now = locate(def, run.scoutClock);
  if (scout.lockPost && scout.lockPost === now.post) {
    return { ok: false, text: "Still working the last burn. Next visit." };
  }

  const horizon = def.period + FUSE;
  let hotNote = null;
  for (let dt = 0; dt <= horizon; dt += 0.1) {
    const loc = locate(def, run.scoutClock + dt);
    if (scout.lockPost && loc.post === scout.lockPost) continue;
    if (!accepts(payloadId, scoutId, loc)) continue;
    // They only finish the read if they are still on that post for the whole beat.
    if (!holdsPost(def, run.scoutClock + dt, loc.post, READ_TIME)) continue;
    const doneAt = dt + READ_TIME;
    if (doneAt > FUSE) {
      return { ok: false, text: `Reaches ${loc.label} in ${dt.toFixed(1)}s — fuse dies first.` };
    }
    const hot = loc.exposed && patrolActive(run.time + doneAt);
    const when = dt < 0.15 ? `On ${loc.label} now` : `Reaches ${loc.label} in ${dt.toFixed(1)}s`;
    if (hot) {
      hotNote = `${when}, but the patrol is on them.`;
      // This is the window that will trigger, so a later safe post never gets the message.
      return { ok: false, text: hotNote };
    }
    let text = dt < 0.15 ? `${when}. Clear. Fuse will hold.` : `${when}. Fuse will hold.`;
    if (payloadId === "truth" && scoutId === "rook" && loc.post === "evac") {
      text += " He will mark the evac wall.";
    }
    return { ok: true, text };
  }
  return hotNote
    ? { ok: false, text: hotNote }
    : { ok: false, text: "No usable post before the next loop ends." };
}

function holdsPost(def, clock, post, duration) {
  const steps = Math.ceil(duration / 0.1);
  for (let i = 0; i <= steps; i++) {
    if (locate(def, clock + i * 0.1).post !== post) return false;
  }
  return true;
}

export function sendBurn(run, payloadId, scoutId) {
  if (run.burnsLeft <= 0) return { ok: false, reason: "No burns left." };
  if (run.messages.some((m) => m.status === "live")) return { ok: false, reason: "A burn is already live." };
  const spec = PAYLOADS[payloadId];
  if (!spec || !spec.scouts.includes(scoutId)) return { ok: false, reason: "Bad route." };
  if (run.scouts[scoutId].caught) return { ok: false, reason: "That scout is detained." };

  run.burnsLeft -= 1;
  run.sent[payloadId] = true;
  if (payloadId !== "truth" && payloadId !== "outpost") run.pack[payloadId] = 0;
  if (payloadId === "outpost") run.pack.outpost = 0;

  run.messages.push({
    id: run.messages.length + 1,
    payloadId,
    label: spec.label,
    to: scoutId,
    age: 0,
    read: 0,
    status: "live",
    truthLevel: ["air", "rad", "soil"].filter((key) => run.samples[key]).length,
  });
  const scout = scoutDef(scoutId);
  pushLog(run, `Burn ${payloadId === "truth" ? "of readings" : "of " + spec.label.toLowerCase()} sent to ${scout.name}. ${FUSE.toFixed(0)}s fuse.`);
  sfx(run, "send");
  return { ok: true };
}

function scoutContext(run, id) {
  const def = scoutDef(id);
  const body = run.scouts[id];
  const loc = locate(def, run.scoutClock);
  return { def, body, loc };
}

function resolveSuccess(run, msg, ctx) {
  msg.status = "read";
  const { def, body, loc } = ctx;
  body.lockPost = loc.post;
  const h = run.hollow;
  const name = def.name;

  if (msg.payloadId === "clocks") {
    h.clocks = true;
    h.outbreakLogged = true;
    banner(run, "Mara logs the clusters. The bulletin still says the outbreak is contained.", "good");
    pushLog(run, `Ward count ${h.sickness}, deep-heavy. The Directorate number is a lie.`);
  } else if (msg.payloadId === "bulkhead") {
    if (h.floodSealed) {
      banner(run, "The flood gate is already sealed.", "good");
      pushLog(run, "Plates arrive late. The gate was already shut.");
    } else {
    h.floodSealed = true;
    if (def.id === "dex") {
      h.fuelPending = true;
      banner(run, "Dex seats the plates and valves sump waste toward the still.", "good");
      pushLog(run, "Flood gate sealed. Waste is lined up for fuel.");
    } else {
      banner(run, "Mara drops the plates. The gate holds.", "good");
      pushLog(run, "Flood gate sealed. Mara is not an engineer, but it holds.");
    }
    h.water = Math.min(3, h.water + 1);
    }
  } else if (msg.payloadId === "mesh") {
    if (h.filters) {
      banner(run, "The lower tap is already filtered.", "good");
      pushLog(run, "Mesh arrives late. The filter is already running.");
    } else {
    h.filters = true;
    h.water = Math.min(3, h.water + 2);
    h.sickness = Math.max(0, h.sickness - 1);
    banner(run, "Dex packs the mesh. The lower tap runs clear.", "good");
    pushLog(run, "Drum filter online in Deepworks.");
    }
  } else if (msg.payloadId === "lamps") {
    h.lampsInstalled = true;
    h.lampsCalibrated = run.samples.rad && run.doseLogged;
    banner(
      run,
      h.lampsCalibrated
        ? "Dex seats the cells against your UV reading. A short day can run."
        : "Dex seats the cells. Without a metered dose they stay a guess.",
      "good"
    );
    pushLog(
      run,
      h.lampsCalibrated
        ? "Lamp cells calibrated to the ridge reading. They still need grid power."
        : "Lamp cells installed. Meter UV on the ridge before anyone trusts the timer."
    );
  } else if (msg.payloadId === "chimes") {
    h.soundNet = true;
    banner(run, "Rook knots the chime line through all three levels.", "good");
    pushLog(run, "Sound net up. A blackout can be answered.");
    sfx(run, "chime");
  } else if (msg.payloadId === "outpost") {
    h.outpostOk = true;
    banner(run, "Dex certifies the outpost. A return camp is no longer a sketch.", "good");
    pushLog(run, "Outpost test certified.");
  } else if (msg.payloadId === "truth") {
    h.truthLevel = Math.max(h.truthLevel, msg.truthLevel || 0);
    if (def.id === "rook" && loc.post === "evac") {
      h.routeMapped = true;
      banner(run, "Rook pins your readings to the evac wall. The way up is marked.", "good");
      pushLog(run, "Readings copied. Evac route updated from real numbers.");
    } else {
      banner(run, `${name} copies the readings by hand. The burn eats the rest.`, "good");
      pushLog(run, `Surface readings stuck with ${name}, then wiped.`);
    }
  }
  if (msg.payloadId !== "chimes") sfx(run, "good");
}

function resolveCaught(run, msg, ctx) {
  msg.status = "caught";
  const { def, body, loc } = ctx;
  body.caught = true;
  body.lockPost = null;
  body.caughtAt = { x: loc.x, level: loc.level };
  const h = run.hollow;
  h.suspicion += 1;
  if (def.id === "mara") h.sickness = Math.min(4, h.sickness + 1);
  banner(run, `Patrol takes ${def.name}'s terminal while the message is still lit.`, "bad");
  pushLog(run, `${def.name} detained. Suspicion ${h.suspicion}.`);
  sfx(run, "caught");
}

function resolveWipe(run, msg) {
  msg.status = "wiped";
  const name = scoutDef(msg.to).name;
  banner(run, `${name}'s terminal wipes the ${msg.label.toLowerCase()}. Unread.`, "bad");
  pushLog(run, `Burn unread. ${msg.label} is gone.`);
  sfx(run, "wipe");
}

function updateMessages(run, dt) {
  for (const msg of run.messages) {
    if (msg.status !== "live") continue;
    msg.age += dt;
    const ctx = scoutContext(run, msg.to);
    if (ctx.body.caught) {
      resolveWipe(run, msg);
      continue;
    }
    const locked = ctx.body.lockPost && ctx.body.lockPost === ctx.loc.post;
    const ready = !locked && accepts(msg.payloadId, msg.to, ctx.loc);
    if (ready) msg.read += dt;
    else msg.read = 0;

    if (msg.read >= READ_TIME) {
      const hot = ctx.loc.exposed && patrolActive(run.time);
      if (hot) resolveCaught(run, msg, ctx);
      else resolveSuccess(run, msg, ctx);
      continue;
    }
    if (msg.age >= FUSE) resolveWipe(run, msg);
  }
}

/** Uncounted cases keep appearing until Mara writes the real tally. */
function updateOutbreak(run, dt) {
  const h = run.hollow;
  if (h.outbreakLogged || h.sickness >= 4) return;
  h.caseTimer += dt;
  if (h.caseTimer < 28) return;
  h.caseTimer = 0;
  h.sickness += 1;
  pushLog(run, `Another coughing bunk. The ward count is ${h.sickness}, and nobody has written it down.`);
}

/** Clocks get her to the flood gate. The shift is what reaches people who cannot climb. */
function updateCare(run, dt) {
  const h = run.hollow;
  const mara = run.scouts.mara;
  if (!h.outbreakLogged || h.careReached || mara.caught) return;
  const loc = locate(scoutDef("mara"), run.scoutClock);
  if (loc.post !== "flood") {
    mara.shiftTime = 0;
    return;
  }
  mara.shiftTime += dt;
  if (mara.shiftTime < 4) return;
  h.careReached = true;
  h.sickness = Math.max(0, h.sickness - 2);
  banner(run, "Mara opens the sump ward off the book. The bunks that cannot climb get the count and the kits.", "good");
  pushLog(run, "Off-book hours in the sump. Care reached the lower bunks.");
  sfx(run, "good");
}

/** Ridge light is the dose. The breather keeps it from becoming a burn. */
function updateExposure(run, dt) {
  if (run.downed) return;
  const p = run.player;
  const suited = run.pack.breather > 0;
  const inShaft = Math.abs(p.x - 150) < 100;
  const inRidge = p.x >= WORLD.ridgeZone[0] && p.x <= WORLD.ridgeZone[1];
  if (inRidge) run.exposure += dt * (suited ? 10 : 22);
  else if (!inShaft) run.exposure += dt * (suited ? 0.5 : 1.1);
  else run.exposure -= dt * 4;
  run.exposure = Math.max(0, Math.min(100, run.exposure));

  if (!run.doseLogged && run.exposure >= 16) {
    run.doseLogged = true;
    banner(run, "A short dose of sun. The meter has a number the bunks can copy.", "good");
    pushLog(run, "Exposure metered. Enough sun to ease the hollow ache, not enough to burn.");
    sfx(run, "sample");
  }
  if (!suited && !run.overexposed && run.exposure >= 55) {
    run.overexposed = true;
    p.integrity = Math.max(0, p.integrity - 12);
    banner(run, "UV burn. The visor was not a breather.", "bad");
    pushLog(run, "Too much ridge light with no breather. The skin pays for the dose.");
    sfx(run, "caught");
  }
}

/** A lit, metered day is the treatment. Installed cells alone change nothing. */
function updateCircadian(run, dt) {
  const h = run.hollow;
  if (!h.lampsInstalled || h.circadianTreated) return;
  if (run.samples.rad && run.doseLogged) h.lampsCalibrated = true;
  if (!h.lampsCalibrated || !lampsLit(h)) {
    h.lampTime = 0;
    return;
  }
  h.lampTime += dt;
  if (h.lampTime < 3) return;
  h.circadianTreated = true;
  h.sickness = Math.max(0, h.sickness - 1);
  banner(run, "Deepworks runs a short day, metered to the ridge. Sleep has an edge again.", "good");
  pushLog(run, "Circadian lamps treating. The dose matches the surface UV reading.");
  sfx(run, "good");
}

/**
 * The wall mark is only a map. An order needs a tested suit, a planted camp,
 * and Mara's list of who is too sick to wait. A caught scout locks the shafts.
 */
function updateEvac(run) {
  const h = run.hollow;
  if (!h.routeMapped || h.evacOrder === "ordered") return;
  const caught = Object.values(run.scouts).some((scout) => scout.caught);
  let next = "marked";
  if (h.suspicion > 0 || caught) next = "locked";
  else if (h.outbreakLogged && run.outpostPlanted && run.pack.breather > 0) next = "ordered";
  if (next === h.evacOrder) return;
  h.evacOrder = next;
  if (next === "ordered") {
    const camp = h.outpostOk ? "Dex certified the camp." : "The camp is planted, not yet certified.";
    banner(run, "Evac order: sick bunks first, then the deep. The shaft list stays off the board.", "good");
    pushLog(run, `Move planned. Breather tested, ward list in Mara's hand. ${camp}`);
    sfx(run, "good");
  } else if (next === "locked") {
    banner(run, "Directorate lockdown. The evac wall is evidence now, not a route.", "bad");
    pushLog(run, "A scout was taken. The move back up is sealed.");
    sfx(run, "wipe");
  } else {
    const missing = [];
    if (!h.outbreakLogged) missing.push("the ward list");
    if (!run.outpostPlanted) missing.push("a planted outpost");
    if (!(run.pack.breather > 0)) missing.push("a tested breather");
    pushLog(run, `Evac wall marked. Still missing ${missing.join(", ")}.`);
  }
}

function updateFuel(run, dt) {
  const h = run.hollow;
  if (!h.fuelPending || h.fuelMade) return;
  if (run.scouts.dex.caught) return;
  const loc = locate(scoutDef("dex"), run.scoutClock);
  if (loc.post !== "waste") {
    run.scouts.dex.stillTime = 0;
    return;
  }
  run.scouts.dex.stillTime += dt;
  if (run.scouts.dex.stillTime >= 1) {
    h.fuelMade = true;
    h.fuelPending = false;
    h.power = Math.min(2, h.power + 1);
    banner(run, "Dex bottles sump waste. The still kicks the grid.", "good");
    pushLog(run, "Waste-to-fuel still online. Power up.");
    sfx(run, "good");
  }
}

function updateBlackout(run, dt) {
  const h = run.hollow;
  if (!h.blackoutResolved && run.time >= BLACKOUT_AT) {
    h.blackoutResolved = true;
    if (h.soundNet) {
      h.blackout = 1.4;
      banner(run, "Blackout. Rook's chimes carry the hold-fast code. The levels stay put.", "good");
      pushLog(run, "Grid drops. Sound net answers. Scouts keep moving.");
      sfx(run, "chime");
    } else {
      h.blackout = 5;
      h.power = Math.max(0, h.power - 1);
      run.freeze = 5;
      banner(run, "Blackout. No chime code. Scouts freeze in the dark.", "bad");
      pushLog(run, "Grid drops. Power lost. Routes slip five seconds.");
      sfx(run, "blackout");
    }
  }
  if (h.blackout > 0) h.blackout = Math.max(0, h.blackout - dt);
}

function updateSurge(run) {
  const h = run.hollow;
  if (h.surgeResolved || run.time < SURGE_AT) return;
  h.surgeResolved = true;
  if (h.floodSealed) {
    pushLog(run, "The sump heaves and the new plates hold.");
    return;
  }
  h.water = Math.max(0, h.water - 2);
  h.sickness = Math.min(4, h.sickness + 1);
  banner(run, "The sump surges. Lower bunks are in the water.", "bad");
  pushLog(run, "Flood surge. Clean water lost. Another coughing bunk.");
  sfx(run, "wipe");
}

function updateWorldFlags(run, dt) {
  const h = run.hollow;
  const target = h.floodSealed ? 0.14 : h.surgeResolved ? 0.88 : 0.62;
  h.floodVisual += (target - h.floodVisual) * Math.min(1, dt * 1.4);

  for (const body of Object.values(run.scouts)) {
    if (!body.lockPost || body.caught) continue;
    const loc = locate(scoutDef(body.id), run.scoutClock);
    if (loc.post !== body.lockPost) body.lockPost = null;
  }
}

function applyHazards(run, dt) {
  const p = run.player;
  const suited = run.pack.breather > 0;
  const inShaft = Math.abs(p.x - 150) < 100 && !p.channel;
  if (inShaft) {
    p.integrity = Math.min(100, p.integrity + dt * 12);
    return;
  }

  let drain = suited ? 0.28 : 0.95;
  const inAsh = p.x >= WORLD.ashZone[0] && p.x <= WORLD.ashZone[1];
  if (inAsh && gusting(run.time)) drain += suited ? 1.4 : 5.5;

  const inRidge = p.x >= WORLD.ridgeZone[0] && p.x <= WORLD.ridgeZone[1];
  if (inRidge) {
    const pulseId = Math.floor(run.time / 9);
    const phase = run.time % 9;
    if (phase < 0.4 && pulseId !== run.lastRidgePulse) {
      run.lastRidgePulse = pulseId;
      p.integrity -= suited ? 6 : 16;
    }
  }

  p.integrity -= drain * dt;
  if (p.integrity <= 0 && !run.downed) {
    p.integrity = 0;
    run.downed = true;
    run.downTimer = 1.8;
    run.hollow.sickness = Math.min(4, run.hollow.sickness + 1);
    banner(run, "Visor cracks. The shaft takes you back under.", "bad");
    pushLog(run, "You come down hypoxic. The clinic has another case.");
    sfx(run, "caught");
  }
}

function updateChannel(run, input, dt, site) {
  const p = run.player;
  const wantSample = site && (site.kind === "air" || site.kind === "rad" || site.kind === "soil");
  const holdingSample = wantSample && input.held("e");
  const holdingPlant = site && site.id === "shade" && run.pack.outpost > 0 && !run.outpostPlanted && run.samples.rad && input.held("f");
  const holdingCert = site && site.id === run.outpostPlanted && run.pack.outpost > 0 && !run.hollow.outpostOk && input.held("f");

  if (holdingCert) {
    if (!p.channel || p.channel.kind !== "cert" || p.channel.site !== site.id) {
      p.channel = { kind: "cert", site: site.id, time: 0, need: 1.7 };
    }
  } else if (holdingPlant) {
    if (!p.channel || p.channel.kind !== "plant" || p.channel.site !== site.id) {
      p.channel = { kind: "plant", site: site.id, time: 0, need: 1.7 };
    }
  } else if (holdingSample) {
    const key = site.kind === "air" ? "air" : site.kind === "rad" ? "rad" : "soil";
    if (run.samples[key]) {
      p.channel = null;
    } else if (!p.channel || p.channel.kind !== "sample" || p.channel.site !== site.id) {
      p.channel = { kind: "sample", site: site.id, key, time: 0, need: 1.5 };
    }
  } else if (p.channel) {
    p.channel = null;
  }

  if (!p.channel) return;
  p.channel.time += dt;
  if (p.channel.time < p.channel.need) return;

  if (p.channel.kind === "sample") {
    run.samples[p.channel.key] = true;
    const copy = SAMPLE_COPY[p.channel.key];
    banner(run, `${copy.short}. ${copy.lie}.`, "good");
    pushLog(run, copy.note);
    sfx(run, "sample");
  } else if (p.channel.kind === "plant") {
    run.outpostPlanted = p.channel.site;
    const name = SITES.find((s) => s.id === p.channel.site).name;
    banner(run, `Camp planted on the shade shelf. The glass ridge stays a measuring post. Dex can certify the camp from the workshop.`, "good");
    pushLog(run, `Outpost kit standing at ${name}.`);
    sfx(run, "sample");
  } else if (p.channel.kind === "cert") {
    run.hollow.outpostOk = true;
    const name = SITES.find((s) => s.id === p.channel.site).name;
    banner(run, `The camp at ${name} is certified. Dex's mark is on the same kit.`, "good");
    pushLog(run, `Outpost certified at ${name}. No extra burn.`);
    sfx(run, "good");
  }
  p.channel = null;
}

function finish(run, reason) {
  run.endReason = reason;
  run.finished = true;
}

function movePlayer(run, input, dt) {
  const p = run.player;
  if (run.downed) return;
  const left = input.held("a", "arrowleft");
  const right = input.held("d", "arrowright");
  if (!p.channel && (left || right)) {
    p.facing = right && !left ? 1 : left && !right ? -1 : p.facing;
    const dir = (right ? 1 : 0) - (left ? 1 : 0);
    p.x = Math.max(70, Math.min(WORLD.width - 70, p.x + dir * WORLD.speed * dt));
    if (p.x > 280) run.leftShaft = true;
  }
}

/** Second level. Hitch a pod at the shaft, set it on the camp, plant the orchard. */
function updatePodRun(run, input, dt) {
  run.time += dt;
  movePlayer(run, input, dt);
  const site = siteAt(run.player.x);
  if (!run.downed) holdPodChannel(run, input, dt, site);
  applyHazards(run, dt);
  if (run.downed) {
    run.downTimer -= dt;
    if (run.downTimer <= 0) finish(run, "downed");
    return;
  }
  if (run.podsSet >= 3 && run.gardenPlanted) finish(run, "pods");
}

function holdPodChannel(run, input, dt, site) {
  const p = run.player;
  const atShaft = site && site.kind === "shaft";
  const atCamp = site && site.id === "shade" && run.outpostPlanted === "shade";
  const atOrchard = site && site.id === "orchard";
  let kind = null;
  if (input.held("e")) {
    if (atShaft && !run.carryingPod && run.podsWaiting > 0) kind = "hitch";
    else if (atCamp && run.carryingPod) kind = "set";
    else if (atOrchard && !run.carryingPod && !run.gardenPlanted && run.podsSet > 0) kind = "garden";
  }
  if (!kind) {
    p.channel = null;
    return;
  }
  if (!p.channel || p.channel.kind !== kind) p.channel = { kind, time: 0, need: kind === "garden" ? 1.6 : 1.4 };
  p.channel.time += dt;
  if (p.channel.time < p.channel.need) return;
  if (kind === "hitch") {
    run.carryingPod = true;
    run.podsWaiting -= 1;
    banner(run, "A livable pod is hitched. Walk it to the shade shelf.", "good");
    pushLog(run, `${run.podsWaiting} pods still waiting at the shaft.`);
  } else if (kind === "set") {
    run.carryingPod = false;
    run.podsSet += 1;
    const name = SITES.find((s) => s.id === run.outpostPlanted)?.name || "the camp";
    banner(run, `Pod set at ${name}. ${run.podsSet} of 3 up.`, "good");
    pushLog(run, `Livable pod ${run.podsSet} is above.`);
  } else {
    run.gardenPlanted = true;
    banner(run, "The orchard takes the soil reading. A garden is in the ground.", "good");
    pushLog(run, "Neighborhood garden planted in the orchard loam.");
  }
  sfx(run, "good");
  p.channel = null;
}

/**
 * @param {object} run
 * @param {{held: Function, pressed: Function, pauseToggle: boolean}} input
 */
export function updateRun(run, input, dt) {
  if (run.finished) return;
  if (run.banner) {
    run.banner.age += dt;
    if (run.banner.age > 3.4) run.banner = null;
  }
  if (run.mission === "pods") {
    updatePodRun(run, input, dt);
    return;
  }

  run.time += dt;
  if (run.freeze > 0) run.freeze = Math.max(0, run.freeze - dt);
  else run.scoutClock += dt;

  if (run.descendArmed > 0) run.descendArmed = Math.max(0, run.descendArmed - dt);

  const p = run.player;
  if (!run.downed) {
    const left = input.held("a", "arrowleft");
    const right = input.held("d", "arrowright");
    if (!p.channel && (left || right)) {
      p.facing = right && !left ? 1 : left && !right ? -1 : p.facing;
      const dir = (right ? 1 : 0) - (left ? 1 : 0);
      p.x = Math.max(70, Math.min(WORLD.width - 70, p.x + dir * WORLD.speed * dt));
      if (p.x > 280) run.leftShaft = true;
    }
  }

  const site = siteAt(p.x);
  if (!run.downed) updateChannel(run, input, dt, site);

  if (!run.downed && input.pressed("e") && site) {
    if (site.kind === "relay") {
      if (run.messages.some((m) => m.status === "live")) {
        banner(run, "A burn is already live. Wait for the fuse.", "warn");
      } else if (run.burnsLeft <= 0) {
        banner(run, "The relay has no burns left.", "warn");
      } else if (availablePayloads(run).length === 0) {
        banner(run, "Nothing to send. Sample the flats, or bring salvage next time.", "warn");
      } else {
        run.wantSend = true;
      }
    } else if (site.kind === "shaft") {
      if (run.descendArmed > 0) finish(run, "descend");
      else {
        run.descendArmed = 2.2;
        banner(run, "Press E again to descend and end the run.", "warn");
      }
    }
  }

  applyHazards(run, dt);
  updateExposure(run, dt);
  updateMessages(run, dt);
  updateOutbreak(run, dt);
  updateCare(run, dt);
  updateCircadian(run, dt);
  updateFuel(run, dt);
  updateBlackout(run, dt);
  updateSurge(run);
  updateEvac(run);
  updateWorldFlags(run, dt);

  if (run.downed) {
    run.downTimer -= dt;
    if (run.downTimer <= 0) finish(run, "downed");
  }
  if (run.time >= RUN_LIMIT) {
    banner(run, "The shaft cycles shut. The Directorate window closes.", "warn");
    finish(run, "timeout");
  }
}

export function coachLine(run) {
  if (run.mission === "pods") {
    if (run.carryingPod) return "Walk the pod to the shade shelf, past the glass. Hold E there to set it down.";
    if (run.podsSet > 0 && !run.gardenPlanted) return "The soil reading can become a garden. Hold E at the dead orchard.";
    if (run.podsWaiting > 0) return "Hold E at the shaft airlock to hitch the next livable pod.";
    return "Set the remaining pods on the camp.";
  }
  const live = run.messages.find((m) => m.status === "live");
  if (live) {
    const name = scoutDef(live.to).name;
    const loc = locate(scoutDef(live.to), run.scoutClock);
    const left = Math.max(0, FUSE - live.age);
    return `Burn live on ${name} · ${left.toFixed(1)}s · ${loc.label}${loc.exposed ? " · exposed" : ""}`;
  }
  const sweep = patrolEta(run.time);
  if (sweep.active) return `Directorate sweep on the Concourse · ${sweep.seconds.toFixed(0)}s left`;
  if (!run.hollow.blackoutResolved) {
    const left = BLACKOUT_AT - run.time;
    if (left < 12) {
      return run.hollow.soundNet
        ? `Blackout in ${left.toFixed(0)}s. The chime line is up.`
        : `Blackout in ${left.toFixed(0)}s. No chime code yet.`;
    }
  }
  if (!run.hollow.surgeResolved && !run.hollow.floodSealed && run.time > 55) {
    return `Sump surge in ${(SURGE_AT - run.time).toFixed(0)}s unless the flood gate is sealed.`;
  }
  if (run.hollow.clocks && !run.hollow.careReached && !run.scouts.mara.caught) {
    const ward = locate(scoutDef("mara"), run.scoutClock);
    if (ward.post === "flood") return "Mara is in the sump ward. The off-book shift takes a few seconds.";
    return "Mara has the ward log. She still needs a few seconds at the flood gate.";
  }
  if (run.hollow.lampsInstalled && !run.hollow.circadianTreated) {
    if (!run.doseLogged || !run.samples.rad) return "Lamp cells are in. Meter UV on the glass ridge or the day stays a guess.";
    if (!lampsLit(run.hollow)) return "The day lamps are dark. They need grid power.";
  }
  if (run.burnsLeft === BURNS) {
    return "Transmit from the Relay Spine. A burn sticks only if that scout can act before the fuse dies.";
  }
  return sweep.active
    ? "Patrol is on the Concourse."
    : `Patrol in ${sweep.seconds.toFixed(0)}s. Shaft airlock restores the suit.`;
}

export function lampsLit(hollow) {
  return hollow.lampsInstalled && hollow.power >= 1 && hollow.blackout <= 0;
}
