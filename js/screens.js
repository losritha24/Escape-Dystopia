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
      <p class="muted">Click a kit to pack it. Each one answers a different problem underground. Twelve scrap is not enough for every problem.</p>
      <div class="panel places">
        <h3>The floors and the stops</h3>
        <p class="small muted">The Hollow is three floors, one under the next. A kit works only when the right scout is standing at the right stop.</p>
        <p class="place-label">Floors</p>
        <dl class="place-list floors">
          <div class="place">
            <dt>Concourse</dt>
            <dd>The top floor, nearest the shaft. People pass through here, and the Directorate patrol walks this floor.</dd>
          </div>
          <div class="place">
            <dt>Sump Ward</dt>
            <dd>The middle neighborhood. Sewage collects here, and one flood can cut it off from the rest of the Hollow. The clinic is on this floor.</dd>
          </div>
          <div class="place">
            <dt>Deepworks</dt>
            <dd>The bottom floor, where the work is done. Filters, lamps, and fuel are built here. The bunks never see daylight.</dd>
          </div>
        </dl>
        <p class="place-label">Stops</p>
        <dl class="place-list">
          <div class="place">
            <dt>Concourse relay</dt>
            <dd>Rook's listening post on the Concourse. Shown as Relay on the map. Send the blackout chimes here. The patrol can see him.</dd>
          </div>
          <div class="place">
            <dt>Patrol corridor</dt>
            <dd>A hallway on the Concourse that Mara crosses. Shown as Corridor. The patrol can see her. She cannot use a kit while she is only passing through.</dd>
          </div>
          <div class="place">
            <dt>Clinic</dt>
            <dd>Mara's clinic on the Sump Ward. Send the clock kit here so she can count the real lung cases and treat people on that floor.</dd>
          </div>
          <div class="place">
            <dt>Flood gate</dt>
            <dd>The gate holding sewage out of the old tunnels, on the Sump Ward. Send the bulkhead plates to Mara or Dex while they are standing here.</dd>
          </div>
          <div class="place">
            <dt>Evac wall</dt>
            <dd>The evacuation board on the Sump Ward. Shown as Evac. If Rook reads your surface readings here, he writes down a real route up.</dd>
          </div>
          <div class="place">
            <dt>Workshop</dt>
            <dd>Dex's shop in Deepworks. Send the filter, the sunlight lamps, or the outpost test here.</dd>
          </div>
          <div class="place">
            <dt>Waste pit</dt>
            <dd>The fuel still in Deepworks. Shown as Waste. After Dex seals the flood, he comes here and turns the trapped waste into fuel.</dd>
          </div>
          <div class="place">
            <dt>Deep drop</dt>
            <dd>A ladder down into Deepworks. Shown as Drop. Rook can receive a message here. He marks the route only from the evac wall.</dd>
          </div>
          <div class="place">
            <dt>In transit</dt>
            <dd>The scout is walking between stops. They cannot use a kit until they arrive.</dd>
          </div>
        </dl>
        <p class="small muted">The Relay Spine is the antenna on the surface, not a room underground. Stand there and press E to send a message down to one of these stops.</p>
      </div>
      <div class="gear-grid">${cards}</div>
      <div class="cols">
        <div class="panel">
          <h3>Who is moving under you</h3>
          <div class="routes">${routes}</div>
          <p class="small muted">The patrol walks the Concourse for six seconds out of every twenty. If Rook is at the relay, or Mara is in the corridor, a message on their screen gets them caught.</p>
        </div>
        <div class="panel">
          <h3>Windows you can plan on</h3>
          <ul>
            <li>At 0:46 the power cuts with no warning. Chimes let every level hear it coming. Without them, the lights die and the scouts freeze.</li>
            <li>At 1:12 the flood rises again unless the gate is already sealed. A sealed gate keeps that neighborhood open.</li>
            <li>You get ${BURNS} messages. Each one disappears after a few seconds. If a patrol sees it on a scout's screen, that scout is caught.</li>
            <li>Move with A and D. Hold E to sample. E at the Relay Spine, the surface antenna, opens a burn. E twice at the shaft ends the run.</li>
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
