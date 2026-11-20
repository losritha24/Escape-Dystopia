/** Mutable run state. One expedition, then an ending. No hidden globals. */

import { BURNS, GEAR, SCOUTS, SCRAP } from "./data.js?v=21";

export function createGame() {
  return {
    phase: "brief",
    /** scrap spent is derived from pack; this is the budget. */
    scrapBudget: SCRAP,
    /** Shaft trips. The pod haul opens after cycle 2 if every card is green. */
    cycle: 1,
    /** Work that survived the last descent. Null until the first cycle ends. */
    progress: null,
    pack: emptyPack(),
    run: null,
  };
}

/** Wipe carried work and start again at the brief, on cycle 1. */
export function resetGame(game) {
  const fresh = createGame();
  game.phase = fresh.phase;
  game.scrapBudget = fresh.scrapBudget;
  game.cycle = fresh.cycle;
  game.progress = fresh.progress;
  game.pack = fresh.pack;
  game.run = fresh.run;
}

export function emptyPack() {
  return {
    breather: 0,
    outpost: 0,
    mesh: 0,
    bulkhead: 0,
    lamps: 0,
    chimes: 0,
    clocks: 0,
  };
}

export function scrapSpent(pack) {
  return GEAR.reduce((sum, gear) => sum + (pack[gear.id] || 0) * gear.cost, 0);
}

/** Copy the Hollow forward. Scouts start a new shift; finished work stays. */
export function keepProgress(game) {
  const run = game.run;
  if (!run || run.mission === "pods") return;
  game.progress = {
    hollow: { ...run.hollow },
    samples: { ...run.samples },
    doseLogged: run.doseLogged,
    outpostPlanted: run.outpostPlanted,
  };
}

/** Fresh expedition from the chosen loadout. Called when the shaft opens. */
export function createRun(pack, carried) {
  const scouts = {};
  for (const def of SCOUTS) {
    scouts[def.id] = {
      id: def.id,
      caught: false,
      /** After a success, ignore new burns until they leave this post. */
      lockPost: null,
      /** Seconds spent on the waste still, once fuel is pending. */
      stillTime: 0,
      /** Seconds Mara has held the flood gate after the outbreak is logged. */
      shiftTime: 0,
    };
  }

  const run = {
    time: 0,
    /** Scout schedules read this. A blackout can freeze it while surface time moves. */
    scoutClock: 0,
    freeze: 0,
    player: {
      x: 150,
      facing: 1,
      integrity: 100,
      channel: null,
    },
    pack: { ...pack },
    samples: { air: false, rad: false, soil: false },
    /** 0–100. A short ridge dose is a number the bunks can copy. Too much, with no breather, burns. */
    exposure: 0,
    doseLogged: false,
    overexposed: false,
    outpostPlanted: null,
    sent: { truth: false, mesh: false, lamps: false, outpost: false, bulkhead: false, chimes: false, clocks: false },
    burnsLeft: BURNS,
    messages: [],
    scouts,
    hollow: {
      floodSealed: false,
      /** 0–3 filled pips. */
      water: 1,
      power: 1,
      /** 0–4 lung markers on the Sump. */
      sickness: 2,
      lampsInstalled: false,
      /** Cells are timed from a real ridge dose, not a guess. */
      lampsCalibrated: false,
      lampTime: 0,
      /** The short day is actually running in the bunks. */
      circadianTreated: false,
      filters: false,
      soundNet: false,
      clocks: false,
      /** Mara wrote the real cluster count. The bulletin still says contained. */
      outbreakLogged: false,
      /** Seconds toward the next uncounted case. */
      caseTimer: 0,
      /** Off-book hours reached the bunks that cannot climb to the clinic. */
      careReached: false,
      truthLevel: 0,
      routeMapped: false,
      /** null | "marked" | "ordered" | "locked" */
      evacOrder: null,
      outpostOk: false,
      suspicion: 0,
      /** Drone sightings this trip. A new cycle starts clear. */
      notified: 0,
      fuelPending: false,
      fuelMade: false,
      floodVisual: 0.62,
      blackout: 0,
      blackoutResolved: false,
      surgeResolved: false,
    },
    finished: false,
    downed: false,
    leftShaft: false,
    descendArmed: 0,
    endReason: null,
    banner: null,
    log: ["The station stairs open onto a dead street. The air tastes like hot coins."],
    sfx: [],
    lastRidgePulse: -1,
    /** Sweep index already resolved, so one beam window notifies once. */
    droneResolvedSweep: -1,
    /** Seconds spent continuously inside the glass ridge. */
    ridgeStay: 0,
    ridgeWarned: false,
    mission: "shaft",
  };
  if (!carried) return run;
  return applyCarried(run, carried);
}

/** The haul. The suit is already proven. Pods move from the shaft to the camp. */
export function createPodRun(carried) {
  const pack = emptyPack();
  pack.breather = 1;
  const run = createRun(pack, carried);
  run.mission = "pods";
  run.podsWaiting = 3;
  run.podsSet = 0;
  run.carryingPod = false;
  run.gardenPlanted = false;
  run.log = ["The path is open. Three livable pods wait at the shaft. The orchard can take a garden once a pod is up."];
  return run;
}

function applyCarried(run, carried) {
  Object.assign(run.hollow, carried.hollow);
  run.hollow.blackout = 0;
  run.hollow.blackoutResolved = false;
  run.hollow.surgeResolved = false;
  run.hollow.lampTime = 0;
  run.hollow.caseTimer = 0;
  run.hollow.fuelPending = false;
  run.hollow.floodVisual = run.hollow.floodSealed ? 0.14 : 0.62;
  run.hollow.power = Math.max(1, run.hollow.fuelMade ? run.hollow.power : 1);
  run.hollow.notified = 0;
  if (run.hollow.evacOrder === "locked") run.hollow.evacOrder = run.hollow.routeMapped ? "marked" : null;
  run.samples = { ...carried.samples };
  run.doseLogged = carried.doseLogged;
  run.outpostPlanted = carried.outpostPlanted === "shade" ? "shade" : null;
  if (run.outpostPlanted !== "shade") run.hollow.outpostOk = false;
  run.log = ["The shaft opens again. What the last trip finished is still in the Hollow."];
  return run;
}
