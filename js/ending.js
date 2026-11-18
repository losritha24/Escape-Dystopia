/** Turns hollow flags into a short debrief. The title follows what actually changed. */

import { SCOUTS } from "./data.js?v=9";

export function buildEnding(run) {
  const h = run.hollow;
  const caught = SCOUTS.filter((s) => run.scouts[s.id].caught);

  let title = "The Bulletin Stands";
  let tone = "bad";
  if (h.suspicion >= 2 || (caught.length > 0 && h.truthLevel === 0 && !h.floodSealed && !h.filters)) {
    title = "Terminals Were Taken";
    tone = "bad";
  } else if (h.truthLevel === 3 && h.outpostOk && h.floodSealed && h.filters && h.suspicion === 0 && caught.length === 0) {
    title = "The Hatch Is Real";
    tone = "good";
  } else if (h.outbreakLogged && h.careReached && h.circadianTreated && h.evacOrder === "ordered") {
    title = "A Measured Return";
    tone = "good";
  } else if (h.truthLevel >= 1 && (h.floodSealed || h.filters || h.lampsInstalled || h.clocks || h.soundNet)) {
    title = "The Hollow Holds";
    tone = "mid";
  }

  const paragraphs = [];
  if (run.endReason === "downed") {
    paragraphs.push("You did not walk back. The airlock dragged a hypoxic scout down the shaft, and the clinic logged you with the other bad lungs.");
  } else if (run.endReason === "timeout") {
    paragraphs.push("The Directorate's window closed on schedule. Whatever you sent is all the Hollow gets until the next shaft cycle.");
  } else {
    paragraphs.push("You sealed the shaft behind you. The suit still smells like the surface.");
  }

  if (h.truthLevel === 3) {
    paragraphs.push("Air, radiation, and soil all contradict the bulletin. Someone below has the numbers in their own handwriting, which is the only copy the burn left behind.");
  } else if (h.truthLevel > 0) {
    paragraphs.push("A partial reading is circulating. It cracks the bulletin. It does not yet prove the surface is livable.");
  } else {
    paragraphs.push("No reading made it down. On the lower levels the Directorate's numbers are still the only numbers.");
  }

  if (h.outbreakLogged) {
    paragraphs.push(`Mara's ward log says ${h.sickness} cases, deep-heavy. The bulletin still says the outbreak is contained.`);
  }
  if (h.careReached) {
    paragraphs.push("She took the clocks down to the sump and ran hours off the book. The bunks that cannot climb to the clinic were treated where they lie.");
  }
  if (h.circadianTreated) {
    paragraphs.push("Deepworks ran a short day, timed from the ridge UV you metered. The dark is no longer the only clock those bunks have.");
  }
  if (h.evacOrder === "ordered") {
    paragraphs.push("The move is an order, not a rumor. Sick bunks go first, then the deep. The breather was tested, a camp is planted, and the shaft list never hit the Directorate board.");
  } else if (h.evacOrder === "locked") {
    paragraphs.push("Rook marked a way up, and the Directorate locked it. A taken terminal turned the route into evidence.");
  } else if (h.routeMapped) {
    paragraphs.push("The evac wall has your numbers. It is not yet an order of who goes.");
  }

  if (title === "The Hatch Is Real") {
    paragraphs.push("The flood gate is shut, the lower tap is filtered, and Dex certified a surface outpost. A careful return is no longer a rumor. It is a route with a camp at the far end.");
  } else if (title === "A Measured Return") {
    paragraphs.push("The outbreak is counted, the lower bunks were treated, and the deep has a day length copied from the surface. People can start up in an order that does not become a lockdown.");
  } else {
    const missing = [];
    if (h.truthLevel < 3) missing.push("a full set of readings");
    if (!h.outpostOk) missing.push("a certified outpost");
    if (!h.floodSealed) missing.push("a sealed sump");
    if (!h.filters) missing.push("a working filter");
    if (caught.length) missing.push("a network the patrol has not touched");
    paragraphs.push(`A path to the surface is not open yet. Still missing: ${missing.join(", ")}.`);
  }

  const systems = [
    flag("Flood gate", h.floodSealed, h.floodSealed ? (h.fuelMade ? "Sealed. Waste is fuel." : "Sealed.") : "Sump still rising."),
    flag("Clean water", h.water >= 2, `${h.water} / 3  ${h.filters ? "· filter online" : "· no filter"}`),
    flag("Grid power", h.power >= 1, `${h.power} / 2  ${h.fuelMade ? "· still burning" : ""}`),
    flag("Outbreak log", h.outbreakLogged, h.outbreakLogged ? `Real tally ${h.sickness}. Bulletin says contained.` : `Uncounted. Cases: ${h.sickness}.`),
    flag("Deep care", h.careReached, h.careReached ? "Off-book hours reached the sump." : h.clocks ? "Logged. The flood-gate shift has not happened." : "No clocks, so no off-book hours."),
    flag("Sunlight", h.circadianTreated, sunlightDetail(h)),
    flag("Evac order", h.evacOrder === "ordered", evacDetail(h)),
    flag("Sound net", h.soundNet, h.soundNet ? "Blackout code can travel." : "Levels go deaf in a blackout."),
    flag("Surface file", h.truthLevel === 3, h.truthLevel === 0 ? "No readings delivered." : `${h.truthLevel} / 3 readings delivered.`),
    flag("Return camp", h.outpostOk, h.outpostOk ? "Outpost certified." : run.outpostPlanted ? "Planted, never certified." : "Not tested."),
  ];

  const people = SCOUTS.map((s) => {
    const body = run.scouts[s.id];
    return {
      name: s.name,
      role: s.role,
      ok: !body.caught,
      detail: body.caught ? "Detained. Terminal seized." : "Still on route.",
    };
  });

  return { title, tone, paragraphs, systems, people, suspicion: h.suspicion, routeMapped: h.routeMapped };
}

export function readyForPods(run) {
  return buildEnding(run).systems.every((system) => system.ok);
}

export function carriedLines(progress) {
  if (!progress) return [];
  const h = progress.hollow;
  const lines = [];
  if (h.floodSealed) lines.push("Flood gate is sealed.");
  if (h.filters && h.water >= 2) lines.push("The lower tap is filtered.");
  if (h.outbreakLogged) lines.push("Mara's outbreak log is written.");
  if (h.careReached) lines.push("Deep care already reached the bunks.");
  if (h.circadianTreated) lines.push("Deepworks already has a metered day.");
  if (h.soundNet) lines.push("The blackout chimes are up.");
  if (h.truthLevel === 3) lines.push("The full surface file is already below.");
  if (h.outpostOk) lines.push("The outpost is certified.");
  else if (progress.outpostPlanted) lines.push("The outpost is planted. Pack the kit again and hold F at the camp to certify it.");
  if (h.evacOrder === "ordered") lines.push("The evac order is already written.");
  return lines;
}

function flag(name, ok, detail) {
  return { name, ok, detail };
}

function sunlightDetail(h) {
  if (h.circadianTreated) return "Short day running, metered to the ridge.";
  if (!h.lampsInstalled) return "No cells. The bunks are still on mine glow.";
  if (!h.lampsCalibrated) return "Cells in, dose unknown. Nobody trusts the timer.";
  if (h.power < 1) return "Calibrated, dark. The grid has no power.";
  return "Calibrated. The day has not finished running.";
}

function evacDetail(h) {
  if (h.evacOrder === "ordered") return "Sick bunks first. Shafts stay quiet.";
  if (h.evacOrder === "locked") return "Lockdown. The wall mark is evidence.";
  if (h.routeMapped) return "Wall marked. No order of who goes.";
  return "No route back up.";
}
