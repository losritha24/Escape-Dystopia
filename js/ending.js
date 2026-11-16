/** Turns hollow flags into a short debrief. The title follows what actually changed. */

import { SCOUTS } from "./data.js";

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

  if (title === "The Hatch Is Real") {
    paragraphs.push("The flood gate is shut, the lower tap is filtered, and Dex certified a surface outpost. A careful return is no longer a rumor. It is a route with a camp at the far end.");
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
    flag("Circadian lamps", lampsOn(h), h.lampsInstalled ? (h.power >= 1 ? "Lit in Deepworks." : "Installed, dark. No power.") : "Bunks still on mine glow."),
    flag("Lung ward", h.clocks || h.sickness <= 1, h.clocks ? `Clocks synced. Cases: ${h.sickness}.` : `Uncounted. Cases: ${h.sickness}.`),
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

function flag(name, ok, detail) {
  return { name, ok, detail };
}

function lampsOn(h) {
  return h.lampsInstalled && h.power >= 1;
}
