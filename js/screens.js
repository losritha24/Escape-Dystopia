/** DOM screens. The live map stays on the canvas; text-heavy choices stay in HTML. */

import { BURNS, FUSE, GEAR, SCOUTS } from "./data.js";
import { buildEnding } from "./ending.js";
import { scrapSpent } from "./state.js";
import {
  availablePayloads,
  coachLine,
  forecast,
  locate,
  patrolActive,
  patrolEta,
  sendBurn,
} from "./sim.js";

let modalSelection = { payload: null, scout: null };

export function bindScreens(game, hooks) {
  renderBrief(game, hooks);
  renderPrepare(game, hooks);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && game.phase === "run" && game.run?.awaitingSend) {
      closeSend(game);
    }
  });
}

export function showPhase(game) {
  for (const id of ["screen-brief", "screen-prepare", "screen-run", "screen-end"]) {
    document.getElementById(id).classList.toggle("hidden", !phaseVisible(game.phase, id));
  }
  document.getElementById("modal").classList.toggle("hidden", !(game.run && game.run.awaitingSend));
  if (game.phase === "brief") renderBrief(game, game.hooks);
  if (game.phase === "prepare") renderPrepare(game, game.hooks);
  if (game.phase === "ending") renderEnding(game);
}

function phaseVisible(phase, id) {
  return (
    (phase === "brief" && id === "screen-brief") ||
    (phase === "prepare" && id === "screen-prepare") ||
    (phase === "run" && id === "screen-run") ||
    (phase === "ending" && id === "screen-end")
  );
}

function renderBrief(game, hooks) {
  document.getElementById("screen-brief").innerHTML = `
    <div class="sheet">
      <p class="kicker">Lead channel · 2087</p>
      <h1 id="brief-title">Hollow<br>Scouts</h1>
      <p class="lede">The surface is a rumor until you measure it. Everything you send downward burns itself after it is read.</p>
      <div class="cols">
        <div class="prose">
          <p>Two billion people live in the Hollow, stacked through old mines under a dead city. The Directorate rations power, water, air, and the story of the surface. You are the Lead Scout. Officially you go up on their missions. Quietly you keep a channel to three Sub-Scouts.</p>
          <p>This prototype is one shaft cycle. Pack twelve scrap, walk the flats, and decide what is worth a burn.</p>
          <div class="row" style="margin-top:18px">
            <button class="primary" type="button" id="to-prepare">Draw a loadout</button>
          </div>
        </div>
        <div class="panel">
          <h3>One cycle</h3>
          <ol>
            <li>Spend scrap on gear the levels can actually use.</li>
            <li>Sample air, radiation, and soil on the surface.</li>
            <li>From the Relay Spine, send a burn. It lives seven seconds.</li>
            <li>It sticks only if that scout is on the right post in time, and the patrol is not reading over their shoulder.</li>
          </ol>
        </div>
      </div>
    </div>`;
  document.getElementById("to-prepare").onclick = () => hooks.showPrepare();
}

function renderPrepare(game, hooks) {
  const spent = scrapSpent(game.pack);
  const left = game.scrapBudget - spent;
  const cards = GEAR.map((g) => {
    const on = game.pack[g.id] > 0;
    const affordable = on || g.cost <= left;
    return `
      <button type="button" class="card ${on ? "on" : ""}" data-gear="${g.id}" ${affordable ? "" : "disabled"}>
        <span class="name">${g.name}</span>
        <span class="cost">${on ? "PACKED" : g.cost + " SCRAP"}</span>
        <span class="blurb">${g.blurb}</span>
      </button>`;
  }).join("");

  const routes = SCOUTS.map(
    (s) => `
      <div class="route">
        <span class="tag" style="color:${s.color}">${s.name}</span>
        <span>${s.role}. ${s.blurb}</span>
      </div>`
  ).join("");

  document.getElementById("screen-prepare").innerHTML = `
    <div class="sheet">
      <p class="kicker">Before the shaft cycles</p>
      <div class="spread">
        <h2 id="prepare-title">Twelve scrap</h2>
        <div>
          <div class="pips" aria-label="${left} scrap remaining">
            ${Array.from({ length: game.scrapBudget }, (_, i) => `<span class="pip ${i < left ? "on" : ""}"></span>`).join("")}
          </div>
          <p class="small muted" style="margin:6px 0 0">${left} left to pack</p>
        </div>
      </div>
      <p class="muted">Click a kit to pack it. You cannot carry the whole list. The Hollow has to live with what you leave behind.</p>
      <div class="gear-grid">${cards}</div>
      <div class="cols">
        <div class="panel">
          <h3>Who is moving under you</h3>
          <div class="routes">${routes}</div>
          <p class="small muted">Patrol sweeps the Concourse for six seconds out of every twenty. Rook's relay and Mara's corridor are on that floor.</p>
        </div>
        <div class="panel">
          <h3>Windows you can plan on</h3>
          <ul>
            <li>A grid blackout hits at 0:46. Chimes let the levels hold. Without them, scouts freeze and the power drops.</li>
            <li>The sump surges at 1:12 unless the flood gate is already sealed.</li>
            <li>You get ${BURNS} burns. A wiped message is gone. A message read under a patrol takes the scout with it.</li>
            <li>Move with A and D. Hold E to sample. E at the relay opens a burn. E twice at the shaft ends the run.</li>
          </ul>
        </div>
      </div>
      <div class="row" style="margin-top:18px">
        <button class="primary" type="button" id="open-shaft">Open the shaft</button>
        <button type="button" id="back-brief">Back</button>
      </div>
    </div>`;

  for (const btn of document.querySelectorAll("[data-gear]")) {
    btn.onclick = () => {
      const id = btn.dataset.gear;
      const gear = GEAR.find((g) => g.id === id);
      if (game.pack[id]) game.pack[id] = 0;
      else if (gear.cost <= game.scrapBudget - scrapSpent(game.pack)) game.pack[id] = 1;
      renderPrepare(game, hooks);
    };
  }
  document.getElementById("open-shaft").onclick = () => hooks.beginRun();
  document.getElementById("back-brief").onclick = () => hooks.showBrief();
}

export function refreshHud(run) {
  const hud = document.getElementById("hud");
  if (!hud || !run) return;
  const integrity = Math.max(0, Math.round(run.player.integrity));
  const meterColor = integrity < 30 ? "var(--bad)" : integrity < 60 ? "var(--amber)" : "var(--teal)";
  const sweep = patrolEta(run.time);

  const scouts = SCOUTS.map((def) => {
    const body = run.scouts[def.id];
    const loc = locate(def, run.scoutClock);
    const hot = !body.caught && loc.exposed && patrolActive(run.time);
    const where = body.caught ? "Detained" : `${loc.label}${loc.exposed ? " · exposed" : ""}`;
    return `<div class="scout-line"><span class="who" style="color:${def.color}">${def.name} · ${def.role}</span><span class="${body.caught || hot ? "bad" : loc.exposed ? "warn" : ""}">${where}</span></div>`;
  }).join("");

  const chips = [
    ["Air", run.samples.air],
    ["Radiation", run.samples.rad],
    ["Soil", run.samples.soil],
  ]
    .map(([name, on]) => `<span class="chip ${on ? "on" : ""}">${name}</span>`)
    .join("");

  const packed = GEAR.filter((g) => run.pack[g.id] > 0)
    .map((g) => `<span class="chip on">${g.name}</span>`)
    .join("");

  const log = run.log.map((line) => `<div class="log-line">${escapeHtml(line)}</div>`).join("");

  hud.innerHTML = `
    <p class="kicker">Lead channel</p>
    <h2>Hollow Scouts</h2>
    <div class="hud-block">
      <h3>Suit integrity ${integrity}</h3>
      <div class="meter" aria-hidden="true"><span style="width:${integrity}%;background:${meterColor}"></span></div>
      <div class="kv"><span>Surface time</span><span>${formatTime(run.time)} / ${formatTime(108)}</span></div>
      <div class="kv"><span>Burns</span><span>${run.burnsLeft} / ${BURNS}</span></div>
      <div class="kv"><span>Patrol</span><span class="${sweep.active ? "bad" : ""}">${sweep.active ? "Sweeping" : "Clear"} · ${sweep.seconds.toFixed(0)}s</span></div>
      <div class="kv"><span>Flood gate</span><span class="${run.hollow.floodSealed ? "good" : "bad"}">${run.hollow.floodSealed ? "Sealed" : "Open"}</span></div>
      <div class="kv"><span>Water</span><span>${run.hollow.water} / 3</span></div>
      <div class="kv"><span>Power</span><span>${run.hollow.power} / 2</span></div>
      <div class="kv"><span>Lung cases</span><span>${run.hollow.sickness}</span></div>
    </div>
    <div class="hud-block">
      <h3>Sub-Scouts</h3>
      ${scouts}
    </div>
    <div class="hud-block">
      <h3>Readings</h3>
      <div class="chips">${chips}</div>
    </div>
    <div class="hud-block">
      <h3>Still packed</h3>
      <div class="chips">${packed || '<span class="chip">Empty pockets</span>'}</div>
    </div>
    <div class="hud-block coach">${escapeHtml(coachLine(run))}</div>
    <div class="hud-block">
      <h3>Channel log</h3>
      ${log}
    </div>
    <p class="small muted">A D move · hold E sample · E relay burn · hold F plant · E E descend</p>
  `;

  const live = document.getElementById("live-region");
  const announce = run.banner ? run.banner.text : run.log[0];
  if (live && live.dataset.last !== announce) {
    live.dataset.last = announce;
    live.textContent = announce;
  }
}

export function openSend(run) {
  run.awaitingSend = true;
  modalSelection = { payload: null, scout: null };
  const payloads = availablePayloads(run);
  if (payloads.length) modalSelection.payload = payloads[0].id;
  paintModal(run);
  document.getElementById("modal").classList.remove("hidden");
  const first = document.querySelector("#modal-card button");
  if (first) first.focus();
}

export function closeSend(game) {
  if (!game.run) return;
  game.run.awaitingSend = false;
  document.getElementById("modal").classList.add("hidden");
}

function paintModal(run) {
  const payloads = availablePayloads(run);
  const payloadButtons = payloads
    .map((p) => {
      const on = modalSelection.payload === p.id;
      return `<button type="button" class="choice ${on ? "on" : ""}" data-payload="${p.id}">${p.label}<small>${p.detail}</small></button>`;
    })
    .join("");

  let routes = "";
  if (modalSelection.payload) {
    routes = SCOUTS.map((def) => {
      const look = forecast(run, def.id, modalSelection.payload);
      const on = modalSelection.scout === def.id;
      return `<button type="button" class="choice ${on ? "on" : ""}" data-scout="${def.id}">
        ${def.name} · ${def.role}
        <small class="${look.ok ? "good" : "bad"}">${look.text}</small>
      </button>`;
    }).join("");
  }

  const chosen = modalSelection.payload && modalSelection.scout
    ? forecast(run, modalSelection.scout, modalSelection.payload)
    : null;
  const timingRisk = chosen && !chosen.ok && /fuse dies|patrol/.test(chosen.text);
  const canSend = Boolean(chosen && (chosen.ok || timingRisk));

  document.getElementById("modal-card").innerHTML = `
    <p class="kicker">Burn after reading</p>
    <h2 id="modal-title">Seven-second fuse</h2>
    <p class="muted">The message hits their terminal now and erases itself at ${FUSE}s. They need about a second on the right post. ${run.burnsLeft} burn${run.burnsLeft === 1 ? "" : "s"} left after this one is armed.</p>
    <h3 class="small" style="letter-spacing:0.14em;text-transform:uppercase;color:var(--muted)">Payload</h3>
    <div class="payloads">${payloadButtons}</div>
    <h3 class="small" style="letter-spacing:0.14em;text-transform:uppercase;color:var(--muted)">Route</h3>
    <div class="recipients">${routes}</div>
    <div class="row">
      <button type="button" class="primary" id="confirm-burn" ${canSend ? "" : "disabled"}>${timingRisk ? "Send anyway" : "Send burn"}</button>
      <button type="button" id="cancel-burn">Keep it</button>
    </div>
  `;

  for (const btn of document.querySelectorAll("[data-payload]")) {
    btn.onclick = () => {
      modalSelection.payload = btn.dataset.payload;
      modalSelection.scout = null;
      paintModal(run);
    };
  }
  for (const btn of document.querySelectorAll("[data-scout]")) {
    btn.onclick = () => {
      modalSelection.scout = btn.dataset.scout;
      paintModal(run);
    };
  }
  document.getElementById("cancel-burn").onclick = () => {
    run.awaitingSend = false;
    document.getElementById("modal").classList.add("hidden");
  };
  const confirm = document.getElementById("confirm-burn");
  confirm.onclick = () => {
    const result = sendBurn(run, modalSelection.payload, modalSelection.scout);
    if (!result.ok) return;
    run.awaitingSend = false;
    document.getElementById("modal").classList.add("hidden");
  };
}

function renderEnding(game) {
  const report = buildEnding(game.run);
  const systems = report.systems
    .map(
      (s) => `<div class="status ${s.ok ? "ok" : "fail"}"><b>${s.name}</b>${escapeHtml(s.detail)}</div>`
    )
    .join("");
  const people = report.people
    .map((p) => `<div class="status ${p.ok ? "ok" : "fail"}"><b>${p.name} · ${p.role}</b>${p.detail}</div>`)
    .join("");

  document.getElementById("screen-end").innerHTML = `
    <div class="sheet">
      <p class="kicker">Debrief · suspicion ${report.suspicion}</p>
      <h1 id="end-title">${escapeHtml(report.title)}</h1>
      ${report.paragraphs.map((p) => `<p class="lede" style="font-size:18px;margin-top:12px">${escapeHtml(p)}</p>`).join("")}
      ${report.routeMapped ? `<p class="muted">Rook marked the evac wall from your numbers.</p>` : ""}
      <div class="status-grid">${systems}</div>
      <h3>Network</h3>
      <div class="status-grid">${people}</div>
      <div class="row">
        <button class="primary" type="button" id="again">Run the shaft again</button>
        <button type="button" id="end-brief">Return to the brief</button>
      </div>
    </div>`;
  document.getElementById("again").onclick = () => game.hooks.showPrepare();
  document.getElementById("end-brief").onclick = () => game.hooks.showBrief();
}

function formatTime(t) {
  const s = Math.max(0, Math.floor(t));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
