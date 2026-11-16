/**
 * Static content for Hollow Scouts.
 * Extend the run by adding gear, sites, or scout segments here.
 * Schedules are in seconds and loop. `exposed` posts sit on the Concourse,
 * where a Directorate patrol can catch a scout who is reading a message.
 */

export const SCRAP = 12;
export const BURNS = 3;
export const FUSE = 7;
export const READ_TIME = 0.85;
export const RUN_LIMIT = 108;
export const BLACKOUT_AT = 46;
export const SURGE_AT = 72;

export const PALETTE = {
  bg: "#0e0d0b",
  sky0: "#2a241c",
  sky1: "#6d5c40",
  ash: "#8a8172",
  ground: "#231e18",
  groundLine: "#3a3126",
  ruin: "#1a1612",
  ink: "#ebe4d6",
  muted: "#9c9283",
  amber: "#e0a15a",
  teal: "#7eb8b2",
  good: "#9cbf7a",
  bad: "#d45a48",
  water: "#3d6f8a",
  stone: "#1a211f",
  stoneEdge: "#2c3834",
  lamp: "#f0d7a2",
};

/** One purchase each. Costs sum past the scrap budget on purpose. */
export const GEAR = [
  {
    id: "breather",
    name: "Breather suit",
    cost: 3,
    blurb: "Slows surface toxicity and softens ash gusts and radiation spikes. The airlock still heals you faster than the flats do.",
  },
  {
    id: "outpost",
    name: "Outpost kit",
    cost: 4,
    blurb: "Plant it on a site you have already sampled. Dex can certify the test from the Deepworks workshop — a real step toward a return camp.",
  },
  {
    id: "mesh",
    name: "Filter mesh",
    cost: 2,
    blurb: "Clean salvage for a drum filter. Sticks only if Dex is at the workshop before the burn wipes.",
  },
  {
    id: "bulkhead",
    name: "Bulkhead plates",
    cost: 3,
    blurb: "Seals the Sump flood if Mara or Dex is at the flood gate. Dex also valves the trapped waste into the fuel still.",
  },
  {
    id: "lamps",
    name: "Lamp cells",
    cost: 2,
    blurb: "Circadian lamps for the Deepworks bunks. Dex installs them at the workshop. They stay dark if the grid has no power.",
  },
  {
    id: "chimes",
    name: "Sound-net chimes",
    cost: 2,
    blurb: "Rook strings a blackout code from the Concourse relay. The relay is a patrol post — it only sticks while the sweep is elsewhere.",
  },
  {
    id: "clocks",
    name: "Medic clock kit",
    cost: 2,
    blurb: "Synced clocks for the lung ward. Mara logs the outbreak if she is at the clinic, off the patrol route.",
  },
];

export const SITES = [
  { id: "shaft", name: "Shaft airlock", x: 150, kind: "shaft" },
  { id: "ash", name: "Ash flats", x: 540, kind: "air" },
  { id: "relay", name: "Relay Spine", x: 900, kind: "relay" },
  { id: "ridge", name: "Glass ridge", x: 1320, kind: "rad" },
  { id: "orchard", name: "Dead orchard", x: 1780, kind: "soil" },
];

export const WORLD = {
  width: 2100,
  /** Pixel span that counts as "standing at" a site. */
  reach: 78,
  speed: 250,
  ashZone: [400, 700],
  ridgeZone: [1180, 1480],
};

/**
 * Scout routes. Times are local to each loop.
 * Keep the first windows readable: Mara starts in the clinic, Dex in the
 * workshop, Rook on the relay while the patrol is still quiet.
 */
export const SCOUTS = [
  {
    id: "mara",
    name: "Mara",
    role: "Medic",
    color: "#e2a36a",
    period: 26,
    blurb: "Clinic clocks, and she can seat a bulkhead if Dex is elsewhere.",
    segments: [
      { t0: 0, t1: 9, post: "clinic", level: 2, x: 420, exposed: false, label: "Clinic" },
      { t0: 9, t1: 17, post: "flood", level: 2, x: 700, exposed: false, label: "Flood gate" },
      { t0: 17, t1: 23, post: "corridor", level: 1, x: 240, exposed: true, label: "Patrol corridor" },
      { t0: 23, t1: 26, post: "transit", level: 2, x: 330, exposed: false, label: "In transit" },
    ],
  },
  {
    id: "dex",
    name: "Dex",
    role: "Engineer",
    color: "#7eb8b2",
    period: 30,
    blurb: "Workshop builds, flood plates, then the waste still.",
    segments: [
      { t0: 0, t1: 11, post: "workshop", level: 3, x: 540, exposed: false, label: "Workshop" },
      { t0: 11, t1: 19, post: "flood", level: 2, x: 700, exposed: false, label: "Flood gate" },
      { t0: 19, t1: 26, post: "waste", level: 3, x: 820, exposed: false, label: "Waste pit" },
      { t0: 26, t1: 30, post: "transit", level: 3, x: 680, exposed: false, label: "In transit" },
    ],
  },
  {
    id: "rook",
    name: "Rook",
    role: "Runner",
    color: "#d7d0bf",
    period: 22,
    blurb: "Relay chimes, then the evac wall, then the deep drop.",
    segments: [
      { t0: 0, t1: 7, post: "relay", level: 1, x: 180, exposed: true, label: "Concourse relay" },
      { t0: 7, t1: 8.2, post: "transit", level: 1, x: 240, exposed: false, label: "In transit" },
      { t0: 8.2, t1: 15, post: "evac", level: 2, x: 280, exposed: false, label: "Evac wall" },
      { t0: 15, t1: 16.2, post: "transit", level: 2, x: 220, exposed: false, label: "In transit" },
      { t0: 16.2, t1: 22, post: "deep", level: 3, x: 200, exposed: false, label: "Deep drop" },
    ],
  },
];

/** Patrol sweeps Level 1 from second 8 to 14 of every 20. */
export const PATROL = { period: 20, on: 8, off: 14 };

export const SAMPLE_COPY = {
  air: {
    short: "Air 18% toxicity",
    lie: "Directorate bulletin: 90% lethal",
    note: "Toxicity 18% and falling. Breathable in bursts. The posted bulletin still says 90% lethal.",
  },
  rad: {
    short: "Radiation background",
    lie: "Directorate bulletin: surface sterile",
    note: "0.4 µSv/h, UV index 6. Harsh noon, not a dead world. The bulletin calls the surface sterile.",
  },
  soil: {
    short: "Orchard loam viable",
    lie: "Directorate bulletin: salt and glass",
    note: "Heavy metals are down. Mycelium is back in the orchard loam. The bulletin says salt and glass.",
  },
};

/**
 * What a payload needs. `posts` are the only places a scout will act.
 * Any exposed post still resolves, but a live patrol turns that into an arrest.
 */
export const PAYLOADS = {
  truth: {
    label: "Surface readings",
    posts: ["clinic", "flood", "workshop", "waste", "evac", "deep", "relay", "corridor"],
    scouts: ["mara", "dex", "rook"],
  },
  mesh: { label: "Filter mesh", posts: ["workshop"], scouts: ["dex"] },
  lamps: { label: "Lamp cells", posts: ["workshop"], scouts: ["dex"] },
  outpost: { label: "Outpost test", posts: ["workshop"], scouts: ["dex"] },
  bulkhead: { label: "Bulkhead plates", posts: ["flood"], scouts: ["mara", "dex"] },
  chimes: { label: "Sound-net chimes", posts: ["relay"], scouts: ["rook"] },
  clocks: { label: "Medic clock kit", posts: ["clinic"], scouts: ["mara"] },
};
