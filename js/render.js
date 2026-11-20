/**
 * Canvas drawing for the live expedition.
 * Top band is the surface. Lower three bands are the Hollow, updated in place
 * so a seal, a blackout, or a patrol reads without leaving the run.
 */

import { FUSE, PALETTE, RIDGE_BURN, RIDGE_RED, SCOUTS, SITES, WORLD } from "./data.js?v=21";
import { droneFrame, locate, lampsLit, patrolActive } from "./sim.js?v=21";

const W = 960;
const H = 640;
const GROUND = 268;

function groundAt(wx) {
  const ash = wx > 400 && wx < 700 ? Math.sin(wx * 0.02) * 10 : 0;
  const ridge = wx > 1180 && wx < 1480 ? -Math.abs(Math.sin(wx * 0.03)) * 26 : 0;
  return GROUND - 8 + ash + ridge;
}

/** Far skyline, then the nearer ruined blocks. Bottoms sit on the horizon. */
const FAR_BLOCKS = [
  [20, 46, 70], [70, 22, 34], [110, 38, 52], [170, 18, 28], [210, 34, 64],
  [280, 50, 40], [360, 26, 58], [430, 44, 36], [520, 40, 56], [600, 22, 30],
  [660, 58, 72], [760, 30, 44], [860, 30, 50], [940, 48, 28], [980, 70, 96],
  [1100, 24, 40], [1180, 36, 60], [1280, 52, 34], [1360, 48, 72], [1460, 20, 26],
  [1540, 26, 44], [1640, 40, 32], [1700, 64, 88], [1820, 28, 46], [1900, 42, 66],
  [2000, 30, 52],
];
const NEAR_BLOCKS = [
  [0, 40, 88], [220, 36, 48], [280, 70, 56], [340, 28, 40], [420, 54, 36],
  [520, 22, 64], [620, 70, 44], [760, 32, 86], [860, 48, 30], [960, 40, 100],
  [1080, 88, 58], [1200, 26, 78], [1320, 60, 34], [1420, 34, 96], [1540, 22, 50],
  [1660, 76, 42], [1780, 30, 110], [1880, 84, 64], [1980, 40, 88],
];

const wind = [
  ...Array.from({ length: 72 }, (_, i) => ({
    x: (i * 149) % WORLD.width,
    y: 18 + ((i * 53) % 236),
    z: 0.28 + (i % 6) * 0.12,
    len: 12 + (i % 8) * 7,
    phase: i * 0.65,
  })),
  ...Array.from({ length: 26 }, (_, i) => ({
    x: 400 + ((i * 37) % 300),
    y: 150 + ((i * 19) % 100),
    z: 0.85,
    len: 18 + (i % 5) * 8,
    phase: i * 1.1,
  })),
];

function hash(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** Visual-only motion. Gameplay positions stay where the sim put them. */
const vis = { x: null, t: 0, walk: 0, cam: null, scouts: {} };

function stepVis(run) {
  let dt = run.time - vis.t;
  if (dt < 0 || dt > 0.5) {
    dt = 1 / 60;
    vis.cam = null;
    vis.scouts = {};
  }
  vis.t = run.time;
  const moving = (vis.x != null && Math.abs(run.player.x - vis.x) > 0.35 && !run.player.channel) || run.entering > 0;
  vis.x = run.player.x;
  if (moving) vis.walk += dt * 8.5;
  const target = Math.max(0, Math.min(WORLD.width - W, run.player.x - W * 0.42));
  if (vis.cam == null) vis.cam = target;
  else vis.cam += (target - vis.cam) * Math.min(1, dt * 5);
  return { dt, moving };
}

export function render(ctx, run) {
  const motion = stepVis(run);
  const cam = vis.cam;
  ctx.clearRect(0, 0, W, H);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  drawSky(ctx, cam, run.time);
  drawSkyline(ctx, cam, FAR_BLOCKS, 0.18, false);
  drawWind(ctx, cam, run.time, false);
  drawSkyline(ctx, cam, NEAR_BLOCKS, 0.4, true);
  drawZones(ctx, cam, run);
  drawWind(ctx, cam, run.time, true);
  drawSites(ctx, cam, run);
  drawDrones(ctx, cam, run);
  drawPlayer(ctx, cam, run, motion.moving);
  drawStationFront(ctx, cam);
  drawSurfaceHud(ctx, cam, run);
  drawHollow(ctx, run, motion.dt);
  drawRidgeBurn(ctx, run);
}

function drawRidgeBurn(ctx, run) {
  const stay = run.ridgeStay || 0;
  if (stay < RIDGE_RED) return;
  const u = Math.min(1, (stay - RIDGE_RED) / (RIDGE_BURN - RIDGE_RED));
  ctx.fillStyle = `rgba(150, 18, 12, ${0.16 + u * 0.55})`;
  ctx.fillRect(0, 0, W, H);
}

function drawSky(ctx, cam, time) {
  const g = ctx.createLinearGradient(0, 0, 0, GROUND);
  g.addColorStop(0, "#1a1612");
  g.addColorStop(0.45, PALETTE.sky0);
  g.addColorStop(1, "#8a7352");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, GROUND + 24);

  const sunX = 720 - cam * 0.05;
  const haze = ctx.createRadialGradient(sunX, 78, 8, sunX, 78, 90);
  haze.addColorStop(0, "rgba(232, 214, 170, 0.9)");
  haze.addColorStop(0.35, "rgba(196, 160, 110, 0.28)");
  haze.addColorStop(1, "rgba(196, 160, 110, 0)");
  ctx.fillStyle = haze;
  ctx.beginPath();
  ctx.arc(sunX, 78, 90, 0, Math.PI * 2);
  ctx.fill();
}

function drawSkyline(ctx, cam, blocks, parallax, near) {
  for (const [x, w, h] of blocks) {
    const sx = x - cam * parallax;
    if (sx > W + 20 || sx + w < -20) continue;
    drawBuilding(ctx, sx, GROUND + 2, w, h, x, near);
  }
}

function drawBuilding(ctx, sx, base, w, h, seed, near) {
  const top = base - h;
  const bite = (seed % 5) * 4;
  const collapsed = hash(seed + 4) > 0.36;
  const drop = collapsed ? 12 + hash(seed + 5) * 26 : 0;
  const body = near ? "#2a221b" : "#16130f";
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(sx, base);
  ctx.lineTo(sx, top + 12 + (collapsed ? drop * 0.35 : 0));
  ctx.lineTo(sx + w * 0.18, top + bite * 0.3);
  ctx.lineTo(sx + w * 0.46, top + (seed % 3) * 5 + drop * 0.5);
  ctx.lineTo(sx + w * 0.72, top + bite * 0.15 + drop);
  ctx.lineTo(sx + w, top + 14 + drop * 0.45);
  ctx.lineTo(sx + w, base);
  ctx.closePath();
  ctx.fill();
  if (collapsed) {
    ctx.fillStyle = near ? "#3a3128" : "#1c1814";
    ctx.beginPath();
    ctx.moveTo(sx + w * 0.35, base);
    ctx.lineTo(sx + w * 0.5, base - 8 - drop * 0.4);
    ctx.lineTo(sx + w + 14, base);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(sx - 8, base - 5, 10, 5);
  }

  if (near && w > 64 && !collapsed) {
    ctx.fillStyle = "#221c16";
    const tw = w * 0.28;
    ctx.fillRect(sx + w * 0.36, top - h * 0.16, tw, h * 0.16 + 2);
    ctx.fillStyle = "rgba(180, 160, 130, 0.2)";
    ctx.fillRect(sx + w * 0.36 + tw - 2, top - h * 0.16, 2, h * 0.16);
  }

  ctx.fillStyle = "rgba(214, 196, 164, 0.16)";
  ctx.fillRect(sx + w - 3, top + 16, 3, h - 22);
  ctx.fillStyle = "rgba(0, 0, 0, 0.28)";
  ctx.fillRect(sx, top + 16, 2, h - 22);

  const floors = Math.max(3, Math.floor(h / 16));
  ctx.strokeStyle = "rgba(0, 0, 0, 0.35)";
  ctx.lineWidth = 1;
  for (let i = 1; i < floors; i++) {
    const y = base - i * ((h - 16) / floors);
    ctx.beginPath();
    ctx.moveTo(sx + 2, y);
    ctx.lineTo(sx + w - 3, y);
    ctx.stroke();
    if (near) {
      ctx.fillStyle = "rgba(60, 48, 36, 0.9)";
      ctx.fillRect(sx - 1, y, w + 2, 1.5);
    }
  }

  if (near) {
    const cols = Math.max(2, Math.floor((w - 8) / 12));
    for (let row = 0; row < floors - 1; row++) {
      for (let col = 0; col < cols; col++) {
        const n = hash(seed + row * 13 + col * 5);
        if (n < 0.18) continue;
        const wx = sx + 5 + col * ((w - 10) / cols);
        const wy = top + 16 + row * ((h - 20) / floors);
        ctx.fillStyle = n > 0.92 ? "rgba(224, 161, 90, 0.7)" : "rgba(8, 6, 4, 0.82)";
        ctx.fillRect(wx, wy, 4, 6);
      }
    }
    if (hash(seed + 2) > 0.55) {
      const mast = top - (w > 70 ? 18 : 10);
      ctx.strokeStyle = "#3a3128";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(sx + w * 0.5, top);
      ctx.lineTo(sx + w * 0.5, mast);
      ctx.moveTo(sx + w * 0.5 - 4, mast + 3);
      ctx.lineTo(sx + w * 0.5 + 4, mast + 3);
      ctx.stroke();
    }
  }

  ctx.fillStyle = near ? "#3a3128" : "#1c1814";
  ctx.beginPath();
  ctx.moveTo(sx - 4, base);
  ctx.lineTo(sx + 8, base - 7);
  ctx.lineTo(sx + 18, base - 2);
  ctx.lineTo(sx + 28, base);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(sx + w - 6, base);
  ctx.lineTo(sx + w - 16, base - 6);
  ctx.lineTo(sx + w + 4, base);
  ctx.fill();
}

function drawWind(ctx, cam, time, low) {
  const gust = 0.22 + 0.78 * Math.pow(Math.max(0, Math.sin(time * 0.8)), 1.35);
  if (low) {
    const span = W + 520;
    const sheet = ((time * (70 + gust * 140)) % span) - 260;
    ctx.fillStyle = `rgba(196, 176, 148, ${0.035 + gust * 0.07})`;
    ctx.beginPath();
    ctx.moveTo(sheet, GROUND - 54);
    ctx.lineTo(sheet + 340, GROUND - 28);
    ctx.lineTo(sheet + 300, GROUND - 4);
    ctx.lineTo(sheet - 30, GROUND - 16);
    ctx.closePath();
    ctx.fill();
  }

  ctx.lineCap = "round";
  for (const grain of wind) {
    const alongGround = grain.y > 150;
    if (low !== alongGround) continue;
    const speed = (22 + grain.z * 86) * (0.4 + gust);
    const wx = (grain.x + time * speed) % WORLD.width;
    const sx = wx - cam * (0.25 + grain.z * 0.35);
    if (sx < -50 || sx > W + 20) continue;
    const lift = Math.sin(time * (1.1 + grain.z) + grain.phase) * (2 + gust * 7);
    const y = grain.y + lift;
    const len = grain.len * (0.45 + gust * 0.9);
    const ash = wx > 400 && wx < 700;
    ctx.strokeStyle = ash
      ? `rgba(214, 204, 186, ${0.12 + gust * 0.28})`
      : `rgba(206, 196, 178, ${0.04 + grain.z * 0.08 + gust * 0.1})`;
    ctx.lineWidth = grain.z > 0.8 ? 1.5 : 1;
    ctx.beginPath();
    ctx.moveTo(sx, y);
    ctx.quadraticCurveTo(sx - len * 0.45, y - lift * 0.35, sx - len, y + (alongGround ? -2 : 1.5) * gust);
    ctx.stroke();
  }
  ctx.lineCap = "round";
}

function drawZones(ctx, cam, run) {
  ctx.fillStyle = "#120f0c";
  ctx.fillRect(0, GROUND + 10, W, H - GROUND);

  const crust = ctx.createLinearGradient(0, GROUND - 36, 0, GROUND + 28);
  crust.addColorStop(0, "#4a3d32");
  crust.addColorStop(0.28, "#2c261f");
  crust.addColorStop(1, "#1a1612");
  ctx.fillStyle = crust;
  ctx.beginPath();
  ctx.moveTo(0, groundAt(cam));
  for (let x = 0; x <= W; x += 8) ctx.lineTo(x, groundAt(x + cam));
  ctx.lineTo(W, groundAt(W + cam) + 18);
  for (let x = W; x >= 0; x -= 8) ctx.lineTo(x, groundAt(x + cam) + 18);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = PALETTE.ground;
  ctx.beginPath();
  ctx.moveTo(0, groundAt(cam) + 18);
  for (let x = 0; x <= W; x += 8) ctx.lineTo(x, groundAt(x + cam) + 18);
  ctx.lineTo(W, H);
  ctx.lineTo(0, H);
  ctx.fill();

  ctx.strokeStyle = "rgba(214, 196, 164, 0.38)";
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  ctx.moveTo(0, groundAt(cam));
  for (let x = 0; x <= W; x += 8) ctx.lineTo(x, groundAt(x + cam));
  ctx.stroke();

  for (let x = 0; x <= W; x += 10) {
    const wx = x + cam;
    const n = hash(Math.floor(wx / 10));
    if (n < 0.58) continue;
    const gy = groundAt(wx);
    ctx.fillStyle = n > 0.86 ? "#5c4b3c" : "#1a140f";
    ctx.globalAlpha = 0.45 + n * 0.4;
    ctx.beginPath();
    ctx.ellipse(x, gy + 3 + n * 5, 1 + n * 2.2, 0.7 + n, n * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  ctx.strokeStyle = "rgba(8, 6, 4, 0.55)";
  ctx.lineWidth = 1;
  for (let x = 0; x <= W; x += 26) {
    const n = hash(Math.floor((x + cam) / 26) + 4);
    if (n < 0.64) continue;
    const gy = groundAt(x + cam);
    ctx.beginPath();
    ctx.moveTo(x, gy + 1);
    ctx.lineTo(x + (n - 0.5) * 14, gy + 6 + n * 5);
    ctx.stroke();
  }

  const ridge0 = WORLD.ridgeZone[0];
  const ridge1 = WORLD.ridgeZone[1];
  if (cam < ridge1 && cam + W > ridge0) {
    ctx.strokeStyle = "rgba(232, 220, 200, 0.55)";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    let started = false;
    for (let wx = Math.max(ridge0, cam); wx <= Math.min(ridge1, cam + W); wx += 6) {
      const sx = wx - cam;
      const gy = groundAt(wx) - 1;
      if (!started) {
        ctx.moveTo(sx, gy);
        started = true;
      } else ctx.lineTo(sx, gy);
    }
    ctx.stroke();
    ctx.fillStyle = "rgba(230, 214, 190, 0.35)";
    for (let i = 0; i < 7; i++) {
      const wx = ridge0 + 30 + i * 40;
      if (wx < cam - 10 || wx > cam + W + 10) continue;
      const sx = wx - cam;
      const gy = groundAt(wx);
      ctx.beginPath();
      ctx.moveTo(sx, gy);
      ctx.lineTo(sx + 5, gy - 8);
      ctx.lineTo(sx + 11, gy - 1);
      ctx.fill();
    }
  }

  const flare = run.time % 9 < 0.45 ? 1 : 0.22 + 0.08 * Math.sin(run.time * 1.3);
  const x0 = WORLD.ridgeZone[0] - cam;
  const ridgeW = WORLD.ridgeZone[1] - WORLD.ridgeZone[0];
  const uv = ctx.createLinearGradient(x0, 20, x0, GROUND);
  uv.addColorStop(0, `rgba(212, 120, 90, ${0.34 * flare})`);
  uv.addColorStop(0.55, `rgba(212, 90, 72, ${0.16 * flare})`);
  uv.addColorStop(1, "rgba(212, 90, 72, 0)");
  ctx.fillStyle = uv;
  ctx.fillRect(x0, 20, ridgeW, GROUND - 20);
  ctx.strokeStyle = `rgba(255, 214, 180, ${0.15 + flare * 0.35})`;
  ctx.lineWidth = 1;
  for (let i = 0; i < 5; i++) {
    const gx = x0 + 30 + i * 56;
    ctx.beginPath();
    ctx.moveTo(gx, 70 + i * 8);
    ctx.lineTo(gx + 18, GROUND - 30);
    ctx.stroke();
  }

  ctx.lineWidth = 2;
  for (const tx of [1660, 1740, 1830, 1920]) {
    const x = tx - cam;
    const lean = Math.sin(run.time * 0.8 + tx) * 2.5;
    ctx.strokeStyle = "#4a3424";
    ctx.beginPath();
    ctx.moveTo(x, groundAt(tx));
    ctx.quadraticCurveTo(x + lean, groundAt(tx) - 28, x + lean * 1.4, groundAt(tx) - 56);
    ctx.moveTo(x + lean * 0.4, groundAt(tx) - 34);
    ctx.quadraticCurveTo(x - 14 + lean, groundAt(tx) - 44, x - 18 + lean, groundAt(tx) - 52);
    ctx.moveTo(x + lean * 0.5, groundAt(tx) - 26);
    ctx.quadraticCurveTo(x + 16, groundAt(tx) - 38, x + 20 + lean, groundAt(tx) - 48);
    ctx.stroke();
    if (run.gardenPlanted && tx < 1860) {
      const sway = Math.sin(run.time * 1.6 + tx) * 5;
      ctx.strokeStyle = PALETTE.good;
      ctx.beginPath();
      ctx.moveTo(x + 10, groundAt(tx));
      ctx.quadraticCurveTo(x + 10 + sway, groundAt(tx) - 18, x + sway, groundAt(tx) - 32);
      ctx.stroke();
      ctx.fillStyle = PALETTE.good;
      ctx.beginPath();
      ctx.ellipse(x + sway, groundAt(tx) - 34, 5, 3, sway * 0.04, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawStation(ctx, x, gy) {
  ctx.fillStyle = "#0c0b09";
  ctx.beginPath();
  ctx.moveTo(x - 104, gy);
  ctx.lineTo(x + 18, gy);
  ctx.lineTo(x - 8, gy + 86);
  ctx.lineTo(x - 116, gy + 86);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#16130f";
  for (let i = 0; i < 6; i++) {
    ctx.fillRect(x - 96, gy + 8 + i * 13, 86, 1);
  }

  ctx.fillStyle = "#3a332b";
  ctx.beginPath();
  let sx = x - 16;
  let sy = gy;
  ctx.moveTo(sx, sy);
  sx = x - 50;
  ctx.lineTo(sx, sy);
  for (let i = 0; i < 8; i++) {
    sy += 10;
    ctx.lineTo(sx, sy);
    sx -= 6;
    ctx.lineTo(sx, sy);
  }
  ctx.lineTo(sx, gy + 86);
  ctx.lineTo(x - 16, gy + 86);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#c4b09a";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.strokeStyle = "#8a7b68";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x - 14, gy - 2);
  ctx.lineTo(x - 62, gy + 76);
  ctx.moveTo(x - 58, gy - 2);
  ctx.lineTo(x - 106, gy + 76);
  ctx.stroke();

  ctx.strokeStyle = "#8a7b68";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(x - 100, gy);
  ctx.lineTo(x - 100, gy - 74);
  ctx.moveTo(x + 32, gy);
  ctx.lineTo(x + 32, gy - 74);
  ctx.stroke();
}

function drawStationFront(ctx, cam) {
  const site = SITES.find((item) => item.kind === "shaft");
  if (!site) return;
  const x = site.x - cam;
  if (x < -180 || x > W + 180) return;
  const gy = groundAt(site.x);
  ctx.fillStyle = "#241e18";
  ctx.fillRect(x - 112, gy - 82, 156, 14);
  ctx.fillStyle = "#1a1612";
  ctx.fillRect(x - 100, gy - 68, 132, 6);
  ctx.fillStyle = "#c4a15a";
  ctx.beginPath();
  ctx.arc(x - 72, gy - 50, 5, 0, Math.PI * 2);
  ctx.arc(x + 8, gy - 50, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(196, 161, 90, 0.16)";
  ctx.beginPath();
  ctx.arc(x - 72, gy - 50, 14, 0, Math.PI * 2);
  ctx.arc(x + 8, gy - 50, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PALETTE.ink;
  ctx.font = "15px ui-monospace, monospace";
  ctx.textAlign = "center";
  ctx.fillText("HOLLOW", x - 34, gy - 92);
}

function drawSites(ctx, cam, run) {
  for (const site of SITES) {
    const x = site.x - cam;
    if (x < -40 || x > W + 40) continue;
    const gy = groundAt(site.x);
    if (site.kind === "shaft") {
      drawStation(ctx, x, gy);
      continue;
    }
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

function drawDrones(ctx, cam, run) {
  const frame = droneFrame(run.time);
  frame.drones.forEach((drone, index) => {
    const x = drone.x - cam;
    if (x < -50 || x > W + 50) return;
    const ground = groundAt(drone.x);
    const hover = Math.sin(run.time * 5.5 + index) * 0.7;
    if (frame.mode !== "fly") {
      const live = frame.mode === "beam";
      const grad = ctx.createLinearGradient(x, drone.y, x, ground);
      grad.addColorStop(0, live ? "rgba(255, 150, 50, 0.9)" : "rgba(255, 160, 70, 0.45)");
      grad.addColorStop(0.7, live ? "rgba(255, 110, 30, 0.28)" : "rgba(255, 150, 50, 0.05)");
      grad.addColorStop(1, "rgba(255, 120, 40, 0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(x - (live ? 4 : 1), drone.y + 8);
      ctx.lineTo(x + (live ? 4 : 1), drone.y + 8);
      ctx.lineTo(x + (live ? 16 : 4), ground);
      ctx.lineTo(x - (live ? 16 : 4), ground);
      ctx.closePath();
      ctx.fill();
      if (live) {
        ctx.fillStyle = "rgba(255, 176, 90, 0.4)";
        ctx.beginPath();
        ctx.ellipse(x, ground - 1, 18, 4.5, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const height = Math.max(40, ground - drone.y);
    ctx.fillStyle = `rgba(0, 0, 0, ${0.22 * Math.min(1, 180 / height)})`;
    ctx.beginPath();
    ctx.ellipse(x + 6, ground - 1, 18, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(x, drone.y + hover);
    ctx.strokeStyle = "#6e6254";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-16, -2);
    ctx.lineTo(16, -2);
    ctx.moveTo(-16, -2);
    ctx.lineTo(-16, 1);
    ctx.moveTo(16, -2);
    ctx.lineTo(16, 1);
    ctx.stroke();
    drawRotor(ctx, -16, run.time, index);
    drawRotor(ctx, 16, run.time, index + 1.7);

    ctx.fillStyle = "#3a332b";
    ctx.strokeStyle = "#d2c2a4";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-11, 1);
    ctx.quadraticCurveTo(-13, -4, -4, -5);
    ctx.lineTo(8, -4);
    ctx.quadraticCurveTo(15, -2, 13, 2);
    ctx.lineTo(-8, 4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#241c16";
    ctx.fillRect(-6, 0, 10, 3);

    ctx.fillStyle = "#120e0b";
    ctx.beginPath();
    ctx.arc(3, 5.2, 2.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = frame.mode === "fly" ? "#e07a2f" : "#ffe0bf";
    ctx.beginPath();
    ctx.arc(3, 5.2, 1.1, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = frame.mode === "beam" ? "#ffb25a" : PALETTE.teal;
    ctx.fillRect(12, -1, 2.5, 2);
    ctx.restore();
  });
}

function drawRotor(ctx, rx, time, phase) {
  ctx.fillStyle = "rgba(220, 210, 190, 0.28)";
  ctx.beginPath();
  ctx.ellipse(rx, -3.5, 11, 2.2, 0, 0, Math.PI * 2);
  ctx.fill();
  const angle = time * 22 + phase;
  ctx.strokeStyle = "rgba(236, 228, 210, 0.55)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(rx - Math.cos(angle) * 10, -3.5 - Math.sin(angle) * 1.6);
  ctx.lineTo(rx + Math.cos(angle) * 10, -3.5 + Math.sin(angle) * 1.6);
  ctx.stroke();
}

function drawPerson(ctx, o) {
  const swing = o.stride || 0;
  const skin = o.skin;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  const leg = (far) => {
    const a = (far ? -0.22 : 0.28) + (far ? swing : -swing) * 0.75;
    const hipX = far ? -1.4 : 1.6;
    const hipY = -15;
    const kneeX = hipX + Math.sin(a) * 8.5;
    const kneeY = hipY + Math.cos(a) * 8.5;
    const b = -a * 0.35;
    const footX = kneeX + Math.sin(b) * 7.4;
    const footY = Math.min(-0.2, kneeY + Math.cos(b) * 7.4);
    ctx.strokeStyle = o.cloth;
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(hipX, hipY);
    ctx.lineTo(kneeX, kneeY);
    ctx.lineTo(footX, footY);
    ctx.stroke();
    ctx.strokeStyle = o.suit ? "#3a332b" : o.cloth;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(footX - 1, footY);
    ctx.lineTo(footX + 5, footY);
    ctx.stroke();
  };

  const arm = (far) => {
    const a = (far ? 0.35 : 0.12) + (far ? -swing : swing) * 0.9;
    const sx = far ? -1 : 2;
    const sy = -31;
    const ex = sx + Math.sin(a) * 7;
    const ey = sy + Math.cos(a) * 7;
    const hx = ex + Math.sin(a * 0.45) * 6;
    const hy = ey + Math.cos(a * 0.45) * 6;
    ctx.strokeStyle = o.cloth;
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    ctx.lineTo(hx, hy);
    ctx.stroke();
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.arc(hx, hy, 1.6, 0, Math.PI * 2);
    ctx.fill();
  };

  leg(true);
  arm(true);

  ctx.fillStyle = o.cloth;
  ctx.strokeStyle = o.trim;
  ctx.lineWidth = 1.15;
  ctx.beginPath();
  ctx.moveTo(-6.2, -16);
  ctx.quadraticCurveTo(-7.6, -24, -6.6, -33);
  ctx.quadraticCurveTo(0, -35.2, 6.8, -33);
  ctx.quadraticCurveTo(7.8, -24, 6.2, -16);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  if (o.suit) {
    ctx.fillStyle = "#3d3830";
    ctx.fillRect(-9.2, -31, 4, 10);
    ctx.strokeStyle = "rgba(40, 28, 18, 0.4)";
    ctx.beginPath();
    ctx.moveTo(0.4, -32);
    ctx.lineTo(0.2, -18);
    ctx.stroke();
  }

  arm(false);
  leg(false);

  ctx.fillStyle = skin;
  ctx.fillRect(-1.5, -36.5, 3.4, 4.2);
  ctx.beginPath();
  ctx.ellipse(-2.4, -41.2, 1.5, 2.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(0.7, -42.6, 5.5, 6.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = o.trim;
  ctx.lineWidth = 1;
  ctx.stroke();

  if (o.suit) {
    ctx.fillStyle = "rgba(14, 28, 26, 0.82)";
    ctx.beginPath();
    ctx.ellipse(3.1, -42.6, 3.4, 2.3, -0.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = o.visor;
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-2, -30);
    ctx.lineTo(-2 + 5.5 * Math.max(0.15, o.integrity / 100), -30);
    ctx.stroke();
  } else if (o.hair) {
    ctx.fillStyle = o.hair;
    ctx.beginPath();
    ctx.ellipse(0.2, -45.4, 5.7, 3.8, 0, Math.PI, 0, true);
    ctx.fill();
    ctx.fillRect(-5.2, -46.2, 2.6, 7);
  }

  ctx.fillStyle = "#24180f";
  ctx.beginPath();
  ctx.ellipse(2.9, -43.5, 0.85, 1.05, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.moveTo(4.7, -43.2);
  ctx.lineTo(6.7, -40.8);
  ctx.lineTo(4.6, -40);
  ctx.closePath();
  ctx.fill();
}

function drawPlayer(ctx, cam, run, moving) {
  const facing = run.player.facing || 1;
  const x = run.player.x - cam;
  const sink = run.player.stair || 0;
  const y = groundAt(run.player.x) + sink;
  const stride = moving ? Math.sin(vis.walk) : 0;
  const bob = moving ? Math.abs(Math.sin(vis.walk)) * 2.2 : Math.sin(run.time * 1.7) * 0.7;
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.beginPath();
  ctx.ellipse(0, -1, 11, 3.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.translate(0, -bob);
  ctx.scale(facing, 1);
  drawPerson(ctx, {
    stride,
    skin: "#e4d0b4",
    cloth: "#c9bfae",
    trim: "#1a120c",
    suit: true,
    visor: run.player.integrity < 30 ? PALETTE.bad : PALETTE.teal,
    integrity: run.player.integrity,
  });
  if (run.carryingPod) {
    const lift = Math.sin(vis.walk) * 1.2;
    ctx.fillStyle = "#5f8f8a";
    ctx.beginPath();
    ctx.roundRect(10, -34 + lift, 18, 14, 2);
    ctx.fill();
    ctx.strokeStyle = "#d5ece8";
    ctx.strokeRect(13, -31 + lift, 7, 5);
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
  const drones = droneFrame(run.time);
  const droneText = drones.mode === "beam" ? "DRONE BEAM" : drones.mode === "warn" ? "DRONES LINING UP" : `DRONES  ${drones.until.toFixed(0)}s`;
  ctx.fillStyle = drones.mode === "fly" ? "rgba(14,13,11,0.55)" : "rgba(56, 24, 8, 0.82)";
  const droneWidth = ctx.measureText(droneText).width + 16;
  ctx.fillRect(W - droneWidth - 16, 12, droneWidth, 28);
  ctx.fillStyle = drones.mode === "fly" ? PALETTE.ink : "#e07a2f";
  ctx.textAlign = "right";
  ctx.fillText(droneText, W - 24, 30);
  ctx.textAlign = "left";

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
    if (run.entering) return "DOWN THE STATION STAIRS";
    return "WALK LEFT INTO THE STATION";
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

function drawHollow(ctx, run, dt) {
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
  drawRooms(ctx, top, bandH, run);
  drawSystems(ctx, top, bandH, run);
  drawPatrol(ctx, top, bandH, run);
  drawSoundNet(ctx, top, bandH, run);
  drawScouts(ctx, top, bandH, run, dt);
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
  const surface = y + h * (1 - flood);
  ctx.beginPath();
  ctx.moveTo(640, y + h);
  ctx.lineTo(640, surface);
  for (let x = 640; x <= W - 13; x += 10) {
    ctx.lineTo(x, surface + Math.sin(run.time * 2.2 + x * 0.05) * 2.2 * flood);
  }
  ctx.lineTo(W - 13, y + h);
  ctx.closePath();
  ctx.fillStyle = "rgba(61, 111, 138, 0.55)";
  ctx.fill();

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

function bandBox(top, bandH, level) {
  const y = top + (level - 1) * bandH + 14;
  return { y, h: bandH - 18 };
}

function drawBulb(ctx, x, y, on, warm) {
  if (!on) {
    ctx.fillStyle = "#2a241c";
    ctx.beginPath();
    ctx.arc(x, y, 2.2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.fillStyle = warm ? "rgba(224, 170, 90, 0.28)" : "rgba(210, 200, 170, 0.22)";
  ctx.beginPath();
  ctx.arc(x, y, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = warm ? "#e0a15a" : "#efe6d4";
  ctx.beginPath();
  ctx.arc(x, y, 2, 0, Math.PI * 2);
  ctx.fill();
}

function drawBed(ctx, x, y) {
  ctx.fillStyle = "#3e4a52";
  ctx.fillRect(x, y - 6, 20, 6);
  ctx.fillStyle = "#e6dccb";
  ctx.fillRect(x + 1, y - 9, 18, 4);
  ctx.fillStyle = "#f7f1e6";
  ctx.fillRect(x + 1, y - 11, 6, 3);
}

function drawRooms(ctx, top, bandH, run) {
  const blackout = run.hollow.blackout > 0;
  const rooms = [
    { id: "relay", level: 1, x: 180, w: 70, label: "RELAY" },
    { id: "corridor", level: 1, x: 268, w: 86, label: "CORRIDOR" },
    { id: "evac", level: 2, x: 280, w: 86, label: "EVAC" },
    { id: "clinic", level: 2, x: 430, w: 112, label: "CLINIC" },
    { id: "flood", level: 2, x: 700, w: 78, label: "FLOOD GATE" },
    { id: "deep", level: 3, x: 200, w: 58, label: "DROP" },
    { id: "workshop", level: 3, x: 540, w: 100, label: "WORKSHOP" },
    { id: "waste", level: 3, x: 820, w: 74, label: "WASTE" },
  ];
  for (const room of rooms) {
    const box = bandBox(top, bandH, room.level);
    const floor = box.y + box.h - 4;
    const left = room.x - room.w / 2;
    const height = 52;
    const ceiling = floor - height;
    ctx.fillStyle = blackout ? "#12100e" : "#1a2220";
    ctx.fillRect(left, ceiling, room.w, height);
    ctx.strokeStyle = "#3c4a46";
    ctx.lineWidth = 1;
    ctx.strokeRect(left, ceiling, room.w, height);
    ctx.fillStyle = "#2c2822";
    ctx.fillRect(left + 1, floor - 5, room.w - 2, 5);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = "9px ui-monospace, monospace";
    ctx.textAlign = "left";
    ctx.fillText(room.label, left + 4, ceiling + 11);
    drawBulb(ctx, room.x, ceiling + 16, !blackout, room.id === "clinic");
    if (room.id === "clinic") {
      drawBed(ctx, left + 6, floor - 6);
      drawBed(ctx, left + 26, floor - 6);
      drawBed(ctx, left + room.w - 26, floor - 6);
      ctx.fillStyle = "#8aa0a4";
      ctx.fillRect(left + room.w - 16, ceiling + 18, 8, 14);
    } else if (room.id === "relay") {
      ctx.fillStyle = "#3a332b";
      ctx.fillRect(left + 10, floor - 16, room.w - 22, 8);
      ctx.strokeStyle = "#c4b08a";
      ctx.beginPath();
      ctx.moveTo(room.x, ceiling + 14);
      ctx.lineTo(room.x, ceiling - 6);
      ctx.moveTo(room.x - 5, ceiling - 2);
      ctx.lineTo(room.x + 5, ceiling - 2);
      ctx.stroke();
    } else if (room.id === "corridor") {
      ctx.strokeStyle = "#4a5652";
      for (const door of [left + 16, left + room.w - 22]) {
        ctx.strokeRect(door, floor - 28, 12, 24);
      }
      drawBulb(ctx, left + 28, ceiling + 16, !blackout, false);
      drawBulb(ctx, left + room.w - 28, ceiling + 16, !blackout, false);
    } else if (room.id === "evac") {
      ctx.fillStyle = "#cbb892";
      ctx.fillRect(room.x - 12, floor - 32, 22, 18);
      ctx.fillStyle = "#1a120c";
      ctx.fillRect(room.x - 9, floor - 28, 16, 2);
      ctx.fillRect(room.x - 9, floor - 24, 10, 2);
      ctx.fillStyle = "#3a332b";
      ctx.fillRect(left + 8, floor - 10, 14, 6);
      ctx.fillRect(left + room.w - 22, floor - 10, 14, 6);
    } else if (room.id === "flood") {
      ctx.fillStyle = "#667078";
      ctx.fillRect(left + 8, floor - 34, 7, 30);
      ctx.fillRect(left + room.w - 15, floor - 34, 7, 30);
      ctx.fillStyle = blackout ? "#2a3034" : "#445058";
      ctx.fillRect(left + 15, floor - 30, room.w - 30, 26);
      ctx.fillStyle = "#9aa4a8";
      for (let i = 0; i < 3; i++) ctx.fillRect(left + 20 + i * 12, floor - 24, 3, 3);
    } else if (room.id === "workshop") {
      ctx.fillStyle = "#4a3b2e";
      ctx.fillRect(left + 8, floor - 14, room.w - 18, 7);
      ctx.fillStyle = "#8a8074";
      ctx.fillRect(left + 14, floor - 22, 3, 8);
      ctx.fillRect(left + 22, floor - 20, 8, 2);
    } else if (room.id === "waste") {
      ctx.strokeStyle = "#6a5a48";
      ctx.strokeRect(left + 8, ceiling + 18, 10, floor - ceiling - 22);
      ctx.fillStyle = "#142026";
      ctx.fillRect(left + 24, floor - 16, 28, 12);
    } else if (room.id === "deep") {
      ctx.strokeStyle = "#8a7b68";
      ctx.beginPath();
      ctx.moveTo(room.x - 6, ceiling + 16);
      ctx.lineTo(room.x - 6, floor - 4);
      ctx.moveTo(room.x + 6, ceiling + 16);
      ctx.lineTo(room.x + 6, floor - 4);
      for (let i = 0; i < 4; i++) {
        const ry = ceiling + 22 + i * 7;
        ctx.moveTo(room.x - 6, ry);
        ctx.lineTo(room.x + 6, ry);
      }
      ctx.stroke();
    }
    if (blackout && room.id === "corridor") {
      ctx.fillStyle = "rgba(180, 40, 30, 0.85)";
      ctx.beginPath();
      ctx.arc(room.x, ceiling + 16, 2, 0, Math.PI * 2);
      ctx.fill();
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

function drawScouts(ctx, top, bandH, run, dt) {
  const used = [];
  for (const def of SCOUTS) {
    const body = run.scouts[def.id];
    const loc = body.caught && body.caughtAt ? body.caughtAt : locate(def, run.scoutClock);
    let spot = vis.scouts[def.id];
    if (!spot) spot = vis.scouts[def.id] = { x: loc.x, level: loc.level };
    if (body.caught) {
      spot.x = loc.x;
      spot.level = loc.level;
    } else {
      const k = Math.min(1, dt * 6);
      spot.x += (loc.x - spot.x) * k;
      spot.level += (loc.level - spot.level) * k;
    }
    let x = spot.x;
    let y = bandCenter(top, bandH, spot.level);
    for (const other of used) {
      if (Math.abs(other.x - x) < 20 && Math.abs(other.y - y) < 20) x += 22;
    }
    used.push({ x, y });
    const moving = Math.abs(loc.x - spot.x) > 1.5 || Math.abs(loc.level - spot.level) > 0.04;
    const stride = moving ? Math.sin(run.time * 8 + def.name.length) : 0;
    const facing = loc.x >= spot.x ? 1 : -1;
    ctx.save();
    ctx.translate(x, y + 12);
    ctx.scale(0.56 * facing, 0.56);
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.beginPath();
    ctx.ellipse(0, 2, 10, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    drawPerson(ctx, {
      stride,
      skin: "#e4d0b4",
      cloth: body.caught ? PALETTE.bad : def.color,
      trim: "#1a120c",
      suit: false,
      hair: def.id === "mara" ? "#4a3024" : def.id === "dex" ? "#24302e" : "#3a342c",
    });
    ctx.restore();
    ctx.fillStyle = body.caught ? PALETTE.bad : PALETTE.ink;
    ctx.font = "bold 8px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.fillText(def.name.slice(0, 1), x, y - 20);
    y -= 6;

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
