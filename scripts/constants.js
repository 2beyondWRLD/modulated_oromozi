const zoneList = [
  { name: "Outer Grasslands", mapKey: "OuterGrasslandsMap", backgroundKey: "outerGrasslands", foregroundKey: "outerGrasslandsForeground" },
  { name: "Shady Grove", mapKey: "ShadyGroveMap", backgroundKey: "shadyGrove", foregroundKey: "shadyGroveForeground" },
  { name: "Arid Desert", mapKey: "AridDesertMap", backgroundKey: "aridDesert", foregroundKey: "aridDesertForeground" },
  { name: "Village", mapKey: "villageCommonsMap", backgroundKey: "villageCommons", foregroundKey: "" }
];

const SCREEN_STATES = {
  NONE: 0,
  PROLOGUE: 1,
  PROMPT: 2,
  CHOICES: 3,
  OUTCOME: 4,
  ITEM_MENU: 5,
  ITEM_PICK: 6,
  LIQUIDITY: 7,
  MERCHANT: 8,
  ROYAL: 9,
  TINKER: 10,
  CRAFT: 11,
  TRADING: 12,
  BATTLE: 13
};

const SCALES = {
  bgScale: 0.3,
  playerScale: 2.5
};