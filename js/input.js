/** Keyboard state with edge detection so a held key does not repeat a burn or a descent. */

const held = new Set();
const prev = new Set();

const BLOCKED = new Set(["arrowup", "arrowdown", "arrowleft", "arrowright", " "]);

export function bindInput() {
  window.addEventListener("keydown", (e) => {
    if (BLOCKED.has(e.key.toLowerCase())) e.preventDefault();
    held.add(e.key.toLowerCase());
  });
  window.addEventListener("keyup", (e) => {
    held.delete(e.key.toLowerCase());
  });
  window.addEventListener("blur", () => {
    held.clear();
  });
}

export function heldKey(...codes) {
  return codes.some((c) => held.has(c));
}

export function pressed(...codes) {
  return codes.some((c) => held.has(c) && !prev.has(c));
}

export function endFrame() {
  prev.clear();
  for (const code of held) prev.add(code);
}
