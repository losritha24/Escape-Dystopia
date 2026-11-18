/**
 * Canvas drawing for the live expedition.
 * Top band is the surface. Lower three bands are the Hollow, updated in place
 * so a seal, a blackout, or a patrol reads without leaving the run.
 */

import { FUSE, PALETTE, SCOUTS, SITES, WORLD } from "./data.js?v=10";
import { locate, lampsLit, patrolActive } from "./sim.js?v=10";

const W = 960;
const H = 640;
const GROUND = 268;

function groundAt(wx) {
  const ash = wx > 400 && wx < 700 ? Math.sin(wx * 0.02) * 10 : 0;
  const ridge = wx > 1180 && wx < 1480 ? -Math.abs(Math.sin(wx * 0.03)) * 26 : 0;
  return GROUND - 8 + ash + ridge;
}

const motes = Array.from({ length: 36 }, (_, i) => ({
  x: (i * 97) % WORLD.width,
  y: 40 + ((i * 53) % 200),
  v: 18 + (i % 5) * 8,
  r: i % 3 === 0 ? 1.6 : 1,
}));

export function render(ctx, run) {
  ctx.clearRect(0, 0, W, H);
  const cam = Math.max(0, Math.min(WORLD.width - W, run.player.x - W * 0.42));

  drawSky(ctx, cam);
  drawRuins(ctx, cam);
  drawZones(ctx, cam, run);
  drawSites(ctx, cam, run);
  drawPlayer(ctx, cam, run);
  drawSurfaceHud(ctx, cam, run);
  drawHollow(ctx, run);
}

function drawSky(ctx, cam) {
  const g = ctx.createLinearGradient(0, 0, 0, GROUND);
  g.addColorStop(0, PALETTE.sky0);
  g.addColorStop(1, PALETTE.sky1);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, GROUND + 20);

  ctx.fillStyle = "#c4b08a";
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  ctx.arc(720 - cam * 0.05, 78, 28, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.15;
  ctx.fillStyle = "#e7d7b0";
  ctx.beginPath();
  ctx.arc(720 - cam * 0.05, 78, 48, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.fillStyle = "#d9d0bf";
  for (const m of motes) {
    const x = m.x - cam * 0.4;
    const y = (m.y + performance.now() * 0.004 * m.v) % 250;
    ctx.globalAlpha = 0.35;
    ctx.fillRect(x, y, m.r, m.r);
  }
  ctx.globalAlpha = 1;
}

function drawRuins(ctx, cam) {
  ctx.fillStyle = PALETTE.ruin;
  const blocks = [
    [40, 180, 70, 90],
    [180, 150, 40, 120],
    [260, 190, 110, 80],
    [1040, 160, 50, 110],
    [1120, 200, 90, 70],
    [1560, 170, 36, 100],
    [1680, 140, 24, 130],
    [1900, 188, 80, 82],
  ];
  for (const [x, y, w, h] of blocks) {
    const sx = x - cam * 0.35;
    ctx.fillRect(sx, y, w, h);
    ctx.fillStyle = "#2a241c";
    for (let wy = y + 10; wy < y + h - 8; wy += 16) {
      ctx.fillRect(sx + 8, wy, 8, 6);
      if (w > 50) ctx.fillRect(sx + w - 20, wy, 8, 6);
    }
    ctx.fillStyle = PALETTE.ruin;
  }
}

function drawZones(ctx, cam, run) {
  ctx.fillStyle = PALETTE.ground;
  ctx.beginPath();
  ctx.moveTo(0, groundAt(cam));
  for (let x = 0; x <= W; x += 16) ctx.lineTo(x, groundAt(x + cam));
  ctx.lineTo(W, H);
  ctx.lineTo(0, H);
  ctx.fill();

  ctx.strokeStyle = PALETTE.groundLine;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, groundAt(cam));
  for (let x = 0; x <= W; x += 16) ctx.lineTo(x, groundAt(x + cam));
  ctx.stroke();

  const gust = Math.floor(run.time / 2.5) % 2 === 0;
  if (gust) {
    ctx.strokeStyle = "rgba(217, 208, 191, 0.25)";
    for (let i = 0; i < 5; i++) {
      const x = 400 + i * 50 - cam + ((run.time * 80) % 80);
      if (x < -40 || x > W) continue;
      ctx.beginPath();
      ctx.moveTo(x, GROUND - 30 - i * 8);
      ctx.lineTo(x + 36, GROUND - 36 - i * 8);
      ctx.stroke();
    }
  }

  if (run.time % 9 < 0.4) {
    ctx.fillStyle = "rgba(212, 90, 72, 0.13)";
    const x0 = WORLD.ridgeZone[0] - cam;
    ctx.fillRect(x0, 40, WORLD.ridgeZone[1] - WORLD.ridgeZone[0], GROUND - 40);
  }

  // Dead trees in the orchard.
  ctx.strokeStyle = "#4a3424";
  ctx.lineWidth = 2;
  for (const tx of [1660, 1740, 1830, 1920]) {
    const x = tx - cam;
    ctx.beginPath();
    ctx.moveTo(x, GROUND);
    ctx.lineTo(x, GROUND - 54);
    ctx.moveTo(x, GROUND - 36);
    ctx.lineTo(x - 16, GROUND - 52);
    ctx.moveTo(x, GROUND - 28);
    ctx.lineTo(x + 18, GROUND - 46);
    ctx.stroke();
  }
}

function drawSites(ctx, cam, run) {
  for (const site of SITES) {
    const x = site.x - cam;
    if (x < -40 || x > W + 40) continue;
    const gy = groundAt(site.x);
    ctx.strokeStyle = PALETTE.amber;
    ctx.fillStyle = PALETTE.amber;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, gy);
    ctx.lineTo(x, gy - 46);
    ctx.stroke();
    ctx.strokeRect(x - 7, gy - 58, 14, 12);

    if (site.kind === "relay") {
      ctx.beginPath();
      ctx.arc(x, gy - 70, 5, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (site.kind === "shade") {
      ctx.fillStyle = "rgba(20, 16, 12, 0.55)";
      ctx.fillRect(x - 28, gy - 18, 56, 10);
      ctx.fillStyle = PALETTE.ink;
      ctx.fillRect(x - 34, gy - 22, 68, 4);
    }

    const done =
      (site.kind === "air" && run.samples.air) ||
      (site.kind === "rad" && run.samples.rad) ||
      (site.kind === "soil" && run.samples.soil);
    if (done) {
      ctx.fillStyle = PALETTE.good;
      ctx.fillRect(x - 3, gy - 55, 6, 6);
    }
    if (run.outpostPlanted === site.id) {
      ctx.strokeStyle = PALETTE.teal;
      ctx.strokeRect(x - 16, gy - 28, 32, 16);
      if (run.mission === "pods") {
        ctx.fillStyle = PALETTE.teal;
        for (let i = 0; i < (run.podsSet || 0); i++) ctx.fillRect(x - 18 + i * 12, gy - 44, 8, 8);
      }
    }
    if (run.gardenPlanted && site.id === "orchard") {
      ctx.fillStyle = PALETTE.good;
      ctx.fillRect(x - 10, gy - 70, 4, 12);
      ctx.fillRect(x + 6, gy - 74, 4, 16);
    }

    ctx.fillStyle = PALETTE.ink;
    ctx.font = "11px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.fillText(site.name.toUpperCase(), x, gy - 78);
  }
}

function drawPlayer(ctx, cam, run) {
  const x = run.player.x - cam;
  const y = groundAt(run.player.x);
  ctx.save();
  ctx.translate(x, y);
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#1a120c";
  ctx.fillStyle = "#efe6d4";
  ctx.beginPath();
  ctx.arc(0, -40, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#c9bfae";
  ctx.fillRect(-9, -30, 18, 22);
  ctx.strokeRect(-9, -30, 18, 22);
  ctx.fillStyle = "#10211f";
  ctx.fillRect(-7, -26, 14, 7);
  ctx.fillStyle = run.player.integrity < 30 ? PALETTE.bad : PALETTE.teal;
  ctx.fillRect(-6, -24, 12, 3);
  ctx.fillStyle = "#1a120c";
  ctx.fillRect(-7, -8, 5, 8);
  ctx.fillRect(2, -8, 5, 8);
  if (run.carryingPod) {
    ctx.strokeStyle = PALETTE.teal;
    ctx.strokeRect(-16, -22, 10, 8);
  }
  if (run.player.channel) {
    const u = run.player.channel.time / run.player.channel.need;
    ctx.strokeStyle = PALETTE.amber;
    ctx.beginPath();
    ctx.arc(0, -40, 14, -Math.PI / 2, -Math.PI / 2 + u * Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawSurfaceHud(ctx, cam, run) {
  ctx.fillStyle = "rgba(14,13,11,0.55)";
  ctx.fillRect(12, 12, 210, 28);
  ctx.fillStyle = PALETTE.ink;
  ctx.font = "12px ui-monospace, monospace";
  ctx.textAlign = "left";
  const clock = formatTime(run.time);
  ctx.fillText(`SURFACE  ${clock}`, 20, 30);

  const site = nearestPrompt(run);
  if (site) {
    ctx.fillStyle = "rgba(14,13,11,0.72)";
    const text = site;
    const width = ctx.measureText(text).width + 20;
    ctx.fillRect(16, GROUND - 150, width, 24);
    ctx.fillStyle = PALETTE.amber;
    ctx.fillText(text, 26, GROUND - 134);
  }
}

function nearestPrompt(run) {
  if (run.mission === "pods") return podPrompt(run);
  const x = run.player.x;
  let best = null;
  let bestD = WORLD.reach;
  for (const site of SITES) {
    const d = Math.abs(site.x - x);
    if (d < bestD) {
      best = site;
      bestD = d;
    }
  }
  if (!best) return "";
  if (best.kind === "shaft") {
    if (!run.leftShaft) return "D  WALK OUT ONTO THE FLATS";
    return run.descendArmed > 0 ? "E  DESCEND — END THE RUN" : "E  ARM DESCENT";
  }
  if (best.kind === "relay") return "E  OPEN A BURN";
  if (best.id === "shade") {
    if (run.outpostPlanted === "shade" && run.pack.outpost > 0 && !run.hollow.outpostOk) return "HOLD F  CERTIFY THE CAMP";
    if (!run.outpostPlanted && run.pack.outpost > 0 && !run.samples.rad) return "SAMPLE THE GLASS RIDGE FIRST";
    if (!run.outpostPlanted && run.pack.outpost > 0) return "HOLD F  PLANT THE CAMP";
    if (run.outpostPlanted === "shade") return "SHADE SHELF  ·  CAMP";
    return "SHADE SHELF  ·  OUT OF THE UV";
  }
  const key = best.kind === "air" ? "air" : best.kind === "rad" ? "rad" : "soil";
  const label = best.kind === "air" ? "AIR TOXICITY" : best.kind === "rad" ? "RADIATION + UV" : "SOIL";
  if (!run.samples[key]) return `HOLD E  SAMPLE ${label}`;
  return `${best.name.toUpperCase()}  ·  LOGGED`;
}

function podPrompt(run) {
  const site = SITES.find((item) => Math.abs(item.x - run.player.x) <= WORLD.reach);
  if (!site) return run.carryingPod ? "WALK THE POD TO THE CAMP" : "";
  if (site.kind === "shaft" && !run.carryingPod && run.podsWaiting > 0) return "HOLD E  HITCH A POD";
  if (site.id === "shade" && run.carryingPod && run.outpostPlanted === "shade") return "HOLD E  SET THE POD";
  if (site.id === "orchard" && !run.carryingPod && run.podsSet > 0 && !run.gardenPlanted) return "HOLD E  PLANT THE GARDEN";
  if (site.id === "orchard" && run.gardenPlanted) return "ORCHARD  ·  GARDEN";
  if (run.carryingPod) return "WALK THE POD TO THE CAMP";
  if (run.podsWaiting > 0) return "BACK TO THE SHAFT FOR THE NEXT POD";
  return "";
}

function drawHollow(ctx, run) {
  const top = 348;
  const bandH = 96;
  ctx.fillStyle = "#100e0c";
  ctx.fillRect(0, top - 8, W, H - top + 8);

  ctx.fillStyle = PALETTE.muted;
  ctx.font = "11px ui-monospace, monospace";
  ctx.textAlign = "left";
  ctx.fillText("THE HOLLOW", 16, top + 6);

  const levels = [
    { level: 1, name: "L1  CONCOURSE" },
    { level: 2, name: "L2  SUMP WARD" },
    { level: 3, name: "L3  DEEPWORKS" },
  ];

  const blackout = run.hollow.blackout > 0;
  for (const level of levels) {
    const y = top + (level.level - 1) * bandH;
    ctx.fillStyle = blackout ? "#14110e" : PALETTE.stone;
    ctx.fillRect(12, y + 14, W - 24, bandH - 18);
    ctx.strokeStyle = PALETTE.stoneEdge;
    ctx.strokeRect(12, y + 14, W - 24, bandH - 18);
    ctx.fillStyle = blackout ? "#6a5a48" : PALETTE.muted;
    ctx.fillText(level.name, 22, y + 30);
  }

  drawWater(ctx, top, bandH, run);
  drawPosts(ctx, top, bandH);
  drawSystems(ctx, top, bandH, run);
  drawPatrol(ctx, top, bandH, run);
  drawSoundNet(ctx, top, bandH, run);
  drawScouts(ctx, top, bandH, run);
  drawBanner(ctx, run);
}

function bandCenter(top, bandH, level) {
  const y = top + (level - 1) * bandH;
  return y + 14 + (bandH - 18) / 2;
}

function drawWater(ctx, top, bandH, run) {
  const y = top + bandH + 14;
  const h = bandH - 18;
  const flood = run.hollow.floodVisual;
  ctx.fillStyle = "rgba(61, 111, 138, 0.55)";
  ctx.fillRect(13, y + h * (1 - flood), W - 26, h * flood);

  const sick = run.hollow.sickness;
  for (let i = 0; i < sick; i++) {
    const x = 860 + (i - (sick - 1) / 2) * 16;
    ctx.fillStyle = PALETTE.bad;
    ctx.fillRect(x, y + 28, 8, 8);
    ctx.fillRect(x + 2, y + 20, 4, 6);
  }
  if (sick > 0 || run.hollow.outbreakLogged) {
    ctx.fillStyle = run.hollow.outbreakLogged ? PALETTE.good : PALETTE.bad;
    ctx.font = "10px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.fillText(run.hollow.outbreakLogged ? "LOGGED" : "UNCOUNTED", 860, y + h - 10);
  }
}

function drawPosts(ctx, top, bandH) {
  const posts = [
    ["corridor", 1, 240, "CORRIDOR"],
    ["relay", 1, 180, "RELAY"],
    ["clinic", 2, 420, "CLINIC"],
    ["flood", 2, 700, "FLOOD GATE"],
    ["evac", 2, 280, "EVAC"],
    ["workshop", 3, 540, "WORKSHOP"],
    ["waste", 3, 820, "WASTE"],
    ["deep", 3, 200, "DROP"],
  ];
  ctx.font = "10px ui-monospace, monospace";
  ctx.textAlign = "center";
  for (const [id, level, x, label] of posts) {
    const y = bandCenter(top, bandH, level);
    ctx.strokeStyle = "#3c4a46";
    ctx.strokeRect(x - 16, y - 16, 32, 32);
    ctx.fillStyle = "#6d7a74";
    ctx.fillText(label, x, y + 28);
    if (id === "clinic") {
      ctx.fillStyle = PALETTE.paper;
      ctx.fillRect(x - 2, y - 8, 4, 14);
      ctx.fillRect(x - 6, y - 4, 12, 4);
    }
  }
}

function drawSystems(ctx, top, bandH, run) {
  const h = run.hollow;
  const y3 = bandCenter(top, bandH, 3);
  ctx.fillStyle = h.filters ? PALETTE.teal : "#3c4a46";
  ctx.fillRect(500, y3 - 6, 8, 12);
  ctx.beginPath();
  ctx.moveTo(504, y3 - 10);
  ctx.lineTo(508, y3 - 4);
  ctx.lineTo(500, y3 - 4);
  ctx.fill();

  const lit = lampsLit(h);
  for (const x of [600, 640, 680]) {
    ctx.fillStyle = lit ? PALETTE.lamp : "#3a3428";
    ctx.beginPath();
    ctx.arc(x, y3 - 22, lit ? 5 : 3, 0, Math.PI * 2);
    ctx.fill();
  }
  if (h.circadianTreated) {
    ctx.fillStyle = PALETTE.lamp;
    ctx.font = "10px ui-monospace, monospace";
    ctx.textAlign = "left";
    ctx.fillText("DAY", 700, y3 - 18);
  }

  if (h.careReached) {
    const y2 = bandCenter(top, bandH, 2);
    ctx.fillStyle = PALETTE.good;
    ctx.fillRect(708, y2 - 8, 3, 14);
    ctx.fillRect(702, y2 - 2, 15, 3);
  }

  if (h.evacOrder) {
    const y2 = bandCenter(top, bandH, 2);
    ctx.strokeStyle = h.evacOrder === "ordered" ? PALETTE.good : h.evacOrder === "locked" ? PALETTE.bad : PALETTE.amber;
    ctx.lineWidth = 2;
    ctx.strokeRect(280 - 20, y2 - 20, 40, 40);
  }

  if (h.fuelMade) {
    ctx.fillStyle = PALETTE.amber;
    ctx.beginPath();
    ctx.moveTo(820, y3 + 8);
    ctx.lineTo(828, y3 + 8);
    ctx.lineTo(824, y3 - 6);
    ctx.fill();
  }

  ctx.font = "10px ui-monospace, monospace";
  ctx.textAlign = "left";
  ctx.fillStyle = PALETTE.ink;
  const y = top + 6;
  ctx.fillText(`WATER ${h.water}/3`, 760, y);
  ctx.fillText(`POWER ${h.power}/2`, 840, y);
}

function drawPatrol(ctx, top, bandH, run) {
  if (!patrolActive(run.time)) return;
  const y = top + 14;
  const sweep = ((run.time * 90) % (W - 40));
  const grad = ctx.createLinearGradient(sweep, 0, sweep + 120, 0);
  grad.addColorStop(0, "rgba(212, 90, 72, 0)");
  grad.addColorStop(0.5, "rgba(212, 90, 72, 0.28)");
  grad.addColorStop(1, "rgba(212, 90, 72, 0)");
  ctx.fillStyle = grad;
  ctx.fillRect(12, y, W - 24, bandH - 18);
  ctx.fillStyle = PALETTE.bad;
  ctx.font = "11px ui-monospace, monospace";
  ctx.textAlign = "right";
  ctx.fillText("DIRECTORATE SWEEP", W - 24, y + 16);
}

function drawSoundNet(ctx, top, bandH, run) {
  if (!run.hollow.soundNet) return;
  ctx.strokeStyle = PALETTE.amber;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(48, bandCenter(top, bandH, 1));
  ctx.lineTo(48, bandCenter(top, bandH, 3));
  ctx.stroke();
  const pulse = run.hollow.blackout > 0;
  for (let level = 1; level <= 3; level++) {
    ctx.fillStyle = pulse ? PALETTE.lamp : PALETTE.amber;
    ctx.beginPath();
    ctx.moveTo(48, bandCenter(top, bandH, level) - 6);
    ctx.lineTo(54, bandCenter(top, bandH, level));
    ctx.lineTo(48, bandCenter(top, bandH, level) + 6);
    ctx.lineTo(42, bandCenter(top, bandH, level));
    ctx.fill();
  }
}

function drawScouts(ctx, top, bandH, run) {
  const used = [];
  for (const def of SCOUTS) {
    const body = run.scouts[def.id];
    const loc = body.caught && body.caughtAt ? body.caughtAt : locate(def, run.scoutClock);
    let x = loc.x;
    let y = bandCenter(top, bandH, loc.level);
    for (const spot of used) {
      if (Math.abs(spot.x - x) < 20 && Math.abs(spot.y - y) < 20) x += 22;
    }
    used.push({ x, y });
    ctx.fillStyle = body.caught ? PALETTE.bad : def.color;
    ctx.beginPath();
    ctx.arc(x, y, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#1a120c";
    ctx.font = "bold 10px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.fillText(def.name.slice(0, 1), x, y + 3);

    const live = run.messages.find((m) => m.status === "live" && m.to === def.id);
    if (live) {
      const u = 1 - live.age / FUSE;
      ctx.strokeStyle = PALETTE.amber;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, 14, -Math.PI / 2, -Math.PI / 2 + Math.max(0, u) * Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "#1a1814";
      ctx.fillRect(x - 46, y - 36, 92, 16);
      ctx.fillStyle = PALETTE.amber;
      ctx.font = "10px ui-monospace, monospace";
      ctx.fillText(`${live.label}  ${Math.max(0, FUSE - live.age).toFixed(1)}s`, x, y - 25);
    }

    if (body.caught) {
      ctx.strokeStyle = PALETTE.bad;
      ctx.beginPath();
      ctx.moveTo(x - 6, y - 6);
      ctx.lineTo(x + 6, y + 6);
      ctx.moveTo(x + 6, y - 6);
      ctx.lineTo(x - 6, y + 6);
      ctx.stroke();
    }
  }
}

function drawBanner(ctx, run) {
  if (!run.banner) return;
  const tone = run.banner.tone === "bad" ? PALETTE.bad : run.banner.tone === "warn" ? PALETTE.amber : PALETTE.good;
  ctx.fillStyle = "rgba(14,13,11,0.88)";
  ctx.fillRect(150, 360, 660, 28);
  ctx.strokeStyle = tone;
  ctx.strokeRect(150, 360, 660, 28);
  ctx.fillStyle = tone;
  ctx.font = "12px ui-monospace, monospace";
  ctx.textAlign = "center";
  ctx.fillText(run.banner.text, 480, 378);
}

function formatTime(t) {
  const s = Math.max(0, Math.floor(t));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
