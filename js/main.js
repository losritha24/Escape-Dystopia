/**
 * Hollow Scouts — one shaft cycle.
 * Phases: brief → prepare → run → ending.
 * The run pauses only while a burn is being composed, so the fuse
 * and the patrol keep their meaning once a message is actually sent.
 */

import { playSfx } from "./audio.js";
import { bindInput, endFrame, heldKey, pressed } from "./input.js";
import { render } from "./render.js";
import { bindScreens, closeSend, openSend, refreshHud, showPhase } from "./screens.js";
import { createGame, createRun } from "./state.js";
import { updateRun } from "./sim.js";

const game = createGame();

const hooks = {
  showBrief() {
    game.phase = "brief";
    showPhase(game);
  },
  showPrepare() {
    game.phase = "prepare";
    showPhase(game);
  },
  beginRun() {
    game.run = createRun(game.pack);
    game.phase = "run";
    showPhase(game);
    fitCanvas();
  },
};
game.hooks = hooks;

const canvas = document.getElementById("view");
const ctx = canvas.getContext("2d");

function fitCanvas() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(320, Math.round((rect.width || 960) * dpr));
  const height = Math.round(width * (640 / 960));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  ctx.setTransform(width / 960, 0, 0, height / 640, 0, 0);
}

bindInput();
bindScreens(game, hooks);
showPhase(game);

const live = document.createElement("div");
live.id = "live-region";
live.className = "sr-only";
live.setAttribute("aria-live", "polite");
document.body.appendChild(live);

window.addEventListener("resize", fitCanvas);

let last = performance.now();
/** rAF is dropped while the tab is hidden, so a timer runs the frame if it never arrives. */
function queueFrame() {
  let ran = false;
  const run = (now) => {
    if (ran) return;
    ran = true;
    frame(now);
  };
  requestAnimationFrame(run);
  setTimeout(() => run(performance.now()), 48);
}

function frame(now) {
  try {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    if (game.phase === "run" && game.run && !game.run.finished) {
      const awaiting = game.run.awaitingSend;
      if (!awaiting) {
        updateRun(game.run, { held: heldKey, pressed }, dt);
        if (game.run.wantSend) {
          game.run.wantSend = false;
          openSend(game.run);
        }
      } else if (pressed("escape")) {
        closeSend(game);
      }

      while (game.run.sfx.length) playSfx(game.run.sfx.shift());

      if (game.run.finished) {
        game.phase = "ending";
        showPhase(game);
      } else {
        fitCanvas();
        render(ctx, game.run);
        refreshHud(game.run);
      }
    }

    endFrame();
  } catch (err) {
    console.error(err);
    endFrame();
  }
  queueFrame();
}

queueFrame();
