/** Mutable run state. One expedition, then an ending. No hidden globals. */

import { BURNS, GEAR, SCOUTS, SCRAP } from "./data.js";

export function createGame() {
  return {
    phase: "brief",
    /** scrap spent is derived from pack; this is the budget. */
    scrapBudget: SCRAP,
    pack: emptyPack(),
    run: null,
  };
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

/** Fresh expedition from the chosen loadout. Called when the shaft opens. */
export function createRun(pack) {
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

  return {
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
    log: ["The shaft seal opens. The air tastes like hot coins."],
    sfx: [],
    lastRidgePulse: -1,
  };
}
