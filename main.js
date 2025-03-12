"use strict";

/* =======================================================
   GLOBAL ZONE DATA & CONSTANTS
======================================================= */
const zoneList = [
  { name: "Outer Grasslands", mapKey: "OuterGrasslandsMap", backgroundKey: "outerGrasslands", foregroundKey: "outerGrasslandsForeground" },
  { name: "Shady Grove", mapKey: "ShadyGroveMap", backgroundKey: "shadyGrove", foregroundKey: "shadyGroveForeground" },
  { name: "Arid Desert", mapKey: "AridDesertMap", backgroundKey: "aridDesert", foregroundKey: "aridDesertForeground" },
  { name: "Village", mapKey: "villageCommonsMap", backgroundKey: "villageCommons", foregroundKey: "" }
];
let currentZoneIndex = 0;

// Narrative screen states – control narrative flow.
const SCREEN_NONE = 0;
const SCREEN_PROLOGUE = 1;
const SCREEN_PROMPT = 2;
const SCREEN_CHOICES = 3;
const SCREEN_OUTCOME = 4;
const SCREEN_ITEM_MENU = 5;
const SCREEN_ITEM_PICK = 6;

// Module UI states – while in these states, game movement is halted.
const SCREEN_LIQUIDITY = 7;
const SCREEN_MERCHANT = 8;
const SCREEN_ROYAL = 9;
const SCREEN_TINKER = 10;
const SCREEN_CRAFT = 11;
const SCREEN_TRADING = 12;
const SCREEN_BATTLE = 13;

const bgScale = 0.3;
const playerScale = 2.5;

/* =======================================================
   1) OFF–CHAIN HELPER FUNCTIONS
======================================================= */
function createInitialStats(zoneName, existingOromozi = 1000) {
  return { 
    health: 100, 
    thirst: 100, 
    hunger: 100, 
    stamina: 100, 
    oromozi: existingOromozi, 
    currentZone: zoneName || "" 
  };
}

function initEquippedData(scene) {
  scene.equippedItems = [];
  scene.equippedResist = {};
}

function recalcEquippedResist(scene) {
  scene.equippedResist = {};
  for (let itemName of scene.equippedItems) {
    const data = getItemData(scene, itemName);
    if (!data || !data.resist) continue;
    for (let key of Object.keys(data.resist)) {
      if (!scene.equippedResist[key]) scene.equippedResist[key] = 0;
      scene.equippedResist[key] += data.resist[key];
    }
  }
}

function updateHUD(scene) {
  if (!scene.hudText || !scene.playerStats) return;
  const s = scene.playerStats;
  scene.hudText.setText(""); // Clear text to prevent overlay
  if (scene.currentZone === "Village") {
    scene.hudText.setText(`OROMOZI: ${s.oromozi}`);
  } else {
    scene.hudText.setText(
      `HEALTH: ${s.health}   STAMINA: ${s.stamina}\nHUNGER: ${s.hunger}   THIRST: ${s.thirst}\nOROMOZI: ${s.oromozi}`
    );
  }
}

function getItemData(scene, itemName) {
  const lootData = scene.cache.json.get("lootTable");
  if (!lootData || !lootData.zones) return null;
  const zoneKeys = Object.keys(lootData.zones);
  for (let zk of zoneKeys) {
    const itemsArr = lootData.zones[zk];
    if (!itemsArr) continue;
    for (let itemObj of itemsArr) {
      if (itemObj.name === itemName) return itemObj;
    }
  }
  return null;
}

function getAllLootItems(scene) {
  const lootData = scene.cache.json.get("lootTable");
  if (!lootData || !lootData.zones) return ["Stick"];
  const allItems = new Set();
  Object.keys(lootData.zones).forEach(zone => {
    lootData.zones[zone].forEach(item => allItems.add(item.name));
  });
  return Array.from(allItems);
}

function getRandomLootForZone(scene) {
  const zoneName = scene.currentZone;
  const lootData = scene.cache.json.get("lootTable");
  if (!lootData || !lootData.zones) return "Stick";
  const zoneItems = lootData.zones[zoneName];
  if (!zoneItems || zoneItems.length === 0) return "Stick";
  const randIndex = Phaser.Math.Between(0, zoneItems.length - 1);
  return zoneItems[randIndex].name || "Stick";
}

function applyItemEffects(scene, itemData) {
  if (!itemData || !itemData.statEffects) return false;
  let modified = false;
  for (let [stat, value] of Object.entries(itemData.statEffects)) {
    if (scene.playerStats[stat] !== undefined) {
      scene.playerStats[stat] = Math.min(scene.playerStats[stat] + value, 100);
      modified = true;
    }
  }
  return modified;
}

function applySurvivalTickAndOutcome(scene, outcomeText) {
  if (!scene.playerStats) scene.playerStats = createInitialStats(scene.currentZone);
  scene.playerStats.thirst = Math.max(scene.playerStats.thirst - 7, 0);
  scene.playerStats.hunger = Math.max(scene.playerStats.hunger - 7, 0);
  scene.playerStats.stamina = Math.max(scene.playerStats.stamina - 7, 0);

  const dmgMatch = outcomeText.match(/\(([-+]\d+)\s*Health\)\s*\[type=(\w+)\]/i);
  if (dmgMatch) {
    const dmgRaw = parseInt(dmgMatch[1]);
    const dmgType = dmgMatch[2].toLowerCase();
    let dmgVal = Math.abs(dmgRaw);
    const rVal = scene.equippedResist[dmgType] || 0;
    dmgVal = Math.max(dmgVal - rVal, 0);
    scene.playerStats.health = Math.max(scene.playerStats.health - dmgVal, 0);
  } else {
    const matchHealth = outcomeText.match(/([-+]\d+)\s*Health/i);
    if (matchHealth) {
      scene.playerStats.health = Math.max(scene.playerStats.health + parseInt(matchHealth[1]), 0);
    }
  }

  if (scene.currentZone !== "Village") {
    const { stamina, thirst, hunger, health } = scene.playerStats;
    let healthReduction = 0;
    if (stamina < 15 || thirst < 15 || hunger < 15) {
      healthReduction = 10;
    } else if (stamina < 35 || thirst < 35 || hunger < 35) {
      healthReduction = 5;
    }
    if (healthReduction > 0) {
      scene.playerStats.health = Math.max(health - healthReduction, 0);
      console.log(`Health reduced by ${healthReduction} due to low stats in Scavenger Mode`);
    }
  }
}

async function applyOutcome(scene, outcomeText) {
  applySurvivalTickAndOutcome(scene, outcomeText);
  if (outcomeText.includes("(+Loot)")) {
    const randomItemName = getRandomLootForZone(scene);
    addToInventory(scene, randomItemName);
    outcomeText += `\nLoot received: ${randomItemName}`;
  }
  updateHUD(scene);

  const travelMatch = outcomeText.match(/\(Travel to ([^)]+)\)/i);
  if (travelMatch) {
    const zoneName = travelMatch[1].trim();
    console.log("Travel outcome detected. Zone name extracted:", zoneName);
    const zone = zoneList.find(z => z.name.toLowerCase() === zoneName.toLowerCase());
    if (zone) {
      console.log("Traveling to zone:", zone.name);
      showDialog(scene, `Traveling to ${zone.name}...\n(Press SPACE to continue)`);
      await new Promise(resolve => {
        scene.input.keyboard.once("keydown-SPACE", () => resolve());
      });
      scene.time.removeAllEvents();
      scene.scene.restart({ zone: zone, inventory: scene.localInventory, promptCount: scene.promptCount });
      return;
    } else {
      console.warn("No matching zone found for:", zoneName);
    }
  }

  showDialog(scene, `Outcome:\n\n${outcomeText}\n\n(Press SPACE to continue)`);
}

// Inventory management functions for stacking
function addToInventory(scene, itemName, quantity = 1) {
  const existingItem = scene.localInventory.find(item => item.name === itemName);
  if (existingItem) {
    existingItem.quantity += quantity;
  } else {
    scene.localInventory.push({ name: itemName, quantity: quantity });
  }
}

function removeFromInventory(scene, itemName, quantity = 1) {
  const itemIndex = scene.localInventory.findIndex(item => item.name === itemName);
  if (itemIndex !== -1) {
    const item = scene.localInventory[itemIndex];
    item.quantity -= quantity;
    if (item.quantity <= 0) {
      scene.localInventory.splice(itemIndex, 1);
    }
  }
}

function getInventoryDisplay(scene) {
  return scene.localInventory.map(item => `${item.name} x${item.quantity}`);
}

/* =======================================================
   4) LIQUIDITY POOL UI FUNCTIONS (WITH MODAL OVERLAY AND SCROLLING)
======================================================= */
function showModalOverlay(scene) {
  hideModalOverlay(scene);
  const modal = scene.add.rectangle(
    scene.cameras.main.worldView.x,
    scene.cameras.main.worldView.y,
    scene.cameras.main.width,
    scene.cameras.main.height,
    0x000000,
    0.4
  );
  modal.setOrigin(0, 0);
  modal.setScrollFactor(0);
  modal.setDepth(800);
  scene.liquidityOverlay = modal;
}

function hideModalOverlay(scene) {
  if (scene.liquidityOverlay) {
    scene.liquidityOverlay.destroy();
    scene.liquidityOverlay = null;
  }
}

function createScrollableMenu(scene, title, options) {
  const boxW = 220, boxH = 150;
  const boxX = (scene.game.config.width - boxW) / 2;
  const boxY = (scene.game.config.height - boxH) / 2;
  const maxVisible = 6;
  let scrollIndex = 0;

  showDialog(scene, `${title}\n(Use UP/DOWN to scroll, SPACE to select)`);
  scene.dialogBg.fillStyle(0x000000, 0.8);
  scene.dialogBg.fillRect(boxX, boxY, boxW, boxH);

  const updateMenu = () => {
    clearButtons(scene);
    const visibleOptions = options.slice(scrollIndex, scrollIndex + maxVisible);
    visibleOptions.forEach((option, i) => {
      const txt = scene.add.text(boxX + 10, boxY + 80 + i * 20, option.label, { font: "12px Arial", fill: "#ffff00" });
      txt.setDepth(1001);
      txt.setInteractive({ useHandCursor: true });
      txt.on("pointerdown", () => {
        scene.input.keyboard.off("keydown-UP");
        scene.input.keyboard.off("keydown-DOWN");
        scene.input.keyboard.off("keydown-SPACE");
        option.callback();
      });
      scene.buttons.push(txt);
      txt.setScrollFactor(0);
    });
  };

  updateMenu();

  scene.input.keyboard.on("keydown-UP", () => {
    if (scrollIndex > 0) {
      scrollIndex--;
      updateMenu();
    }
  });

  scene.input.keyboard.on("keydown-DOWN", () => {
    if (scrollIndex + maxVisible < options.length) {
      scrollIndex++;
      updateMenu();
    }
  });

  scene.input.keyboard.once("keydown-SPACE", () => {
    scene.input.keyboard.off("keydown-UP");
    scene.input.keyboard.off("keydown-DOWN");
    const selectedIndex = scrollIndex;
    if (options[selectedIndex]) options[selectedIndex].callback();
  });
}

function showDepositResourceScreen(scene) {
  const resources = scene.localInventory.filter(item => {
    const itemData = getItemData(scene, item.name);
    return itemData && itemData.canDeposit;
  });
  if (!resources || resources.length === 0) {
    alert("No depositable resources available.");
    showLiquidityPoolOptions(scene);
    return;
  }
  clearButtons(scene);
  const options = resources.map((resource, index) => ({
    label: `${resource.name} x${resource.quantity}`,
    callback: () => {
      clearButtons(scene);
      promptDepositDetails(scene, resource.name, index);
    }
  }));
  options.push({
    label: "Back",
    callback: () => {
      clearButtons(scene);
      showLiquidityPoolOptions(scene);
    }
  });
  createScrollableMenu(scene, "Select a resource to deposit:", options);
}

function promptDepositDetails(scene, resource, index) {
  clearButtons(scene);
  hideDialog(scene);
  let amountStr = prompt(`Enter deposit amount for ${resource} (units):`, "10");
  let durationStr = prompt("Enter lockup duration (seconds):", "604800");
  let amount = parseInt(amountStr, 10);
  let duration = parseInt(durationStr, 10);
  if (isNaN(amount) || isNaN(duration)) {
    alert("Invalid input. Returning to resource selection.");
    showDepositResourceScreen(scene);
    return;
  }
  let estimatedYield = Math.floor(amount * (duration / 86400) * 50);
  showConfirmDeposit(scene, resource, amount, duration, estimatedYield, index);
}

function showConfirmDeposit(scene, resource, amount, duration, estimatedYield, index) {
  clearButtons(scene);
  showDialog(scene, `Deposit ${amount} units of ${resource} for ${duration} seconds?\nEstimated yield: ${estimatedYield} units.\nConfirm deposit?`);
  const options = [
    {
      label: "Yes",
      callback: async () => {
        removeFromInventory(scene, resource, amount);
        scene.deposits.push({ amount, duration: duration, startTime: Date.now() });
        alert("Liquidity deposit successful (simulated).");
        clearButtons(scene);
        hideDialog(scene);
        hideModalOverlay(scene);
        scene.narrativeScreen = SCREEN_NONE;
      }
    },
    {
      label: "No",
      callback: () => {
        clearButtons(scene);
        showDepositResourceScreen(scene);
      }
    }
  ];
  createButtons(scene, options);
}

function showLiquidityPoolOptions(scene) {
  scene.narrativeScreen = SCREEN_LIQUIDITY;
  showModalOverlay(scene);
  const options = [
    {
      label: "Deposit Resource",
      callback: () => {
        clearButtons(scene);
        showDepositResourceScreen(scene);
      }
    },
    {
      label: "View Deposits & Yield",
      callback: () => {
        const deposits = scene.deposits.map((d, i) => `${i}: ${d.amount} units, ${Math.floor((Date.now() - d.startTime) / 1000)}s elapsed`).join("\n");
        alert(`Deposits:\n${deposits || "None"}`);
        clearButtons(scene);
        showLiquidityPoolOptions(scene);
      }
    },
    {
      label: "Withdraw Resources",
      callback: () => {
        clearButtons(scene);
        showWithdrawResourceScreen(scene);
      }
    },
    {
      label: "Back",
      callback: () => {
        clearButtons(scene);
        hideDialog(scene);
        hideModalOverlay(scene);
        scene.narrativeScreen = SCREEN_NONE;
      }
    }
  ];
  createScrollableMenu(scene, "Liquidity Pool Options:\nSelect an option:", options);
}

function showWithdrawResourceScreen(scene) {
  if (!scene.deposits || scene.deposits.length === 0) {
    alert("No deposits to withdraw.");
    showLiquidityPoolOptions(scene);
    return;
  }
  clearButtons(scene);
  const options = scene.deposits.map((deposit, index) => ({
    label: `${deposit.amount} units (${Math.floor((Date.now() - deposit.startTime) / 1000)}s)`,
    callback: async () => {
      const deposit = scene.deposits[index];
      const elapsed = (Date.now() - deposit.startTime) / 1000;
      const yieldAmt = Math.floor(deposit.amount * (elapsed / 86400) * 50);
      scene.playerStats.oromozi += deposit.amount + yieldAmt;
      scene.deposits.splice(index, 1);
      alert(`Withdrawn ${deposit.amount} units + ${yieldAmt} yield (simulated).`);
      updateHUD(scene);
      clearButtons(scene);
      showLiquidityPoolOptions(scene);
    }
  }));
  options.push({
    label: "Back",
    callback: () => {
      clearButtons(scene);
      showLiquidityPoolOptions(scene);
    }
  });
  createScrollableMenu(scene, "Select a deposit to withdraw:", options);
}

/* =======================================================
   BATTLE MODE FUNCTIONS
======================================================= */
function calculateBattleStats(scene) {
  let baseStats = { health: scene.playerStats.health, attack: 0, evasion: 0, defense: 0 };
  scene.equippedItems.forEach(itemName => {
    const itemData = getItemData(scene, itemName);
    if (!itemData) return;

    if (itemData.combatEffects) {
      if (itemData.combatEffects.attack) baseStats.attack += itemData.combatEffects.attack;
      if (itemData.combatEffects.evasion) baseStats.evasion += itemData.combatEffects.evasion;
      if (itemData.combatEffects.defense) baseStats.defense += itemData.combatEffects.defense;
    }

    if (itemData.statEffects && itemData.statEffects.health) {
      baseStats.health = Math.min(baseStats.health + itemData.statEffects.health, 100);
    }
  });
  return baseStats;
}

function enterBattleMode(scene) {
  scene.narrativeScreen = SCREEN_BATTLE;
  showModalOverlay(scene);
  const battleStats = calculateBattleStats(scene);
  showDialog(scene, `Battle Mode\nHealth: ${battleStats.health}\nAttack: ${battleStats.attack}\nDefense: ${battleStats.defense}\nEvasion: ${battleStats.evasion}\n(Press SPACE to exit)`);
  scene.input.keyboard.once("keydown-SPACE", () => {
    scene.narrativeScreen = SCREEN_NONE;
    hideDialog(scene);
    hideModalOverlay(scene);
  });
}

/* =======================================================
   5) MODULE MENUS FOR OTHER VILLAGE BUILDINGS
======================================================= */
function showMerchantQuarterOptions(scene) {
  scene.narrativeScreen = SCREEN_MERCHANT;
  showModalOverlay(scene);
  const options = [
    {
      label: "List Item for Sale",
      callback: () => {
        clearButtons(scene);
        showListItemScreen(scene);
      }
    },
    {
      label: "Browse Marketplace",
      callback: () => {
        clearButtons(scene);
        showBrowseMarketplaceScreen(scene);
      }
    },
    {
      label: "View My Listed Items",
      callback: () => {
        clearButtons(scene);
        showMyListingsScreen(scene);
      }
    },
    {
      label: "Back",
      callback: () => {
        clearButtons(scene);
        hideDialog(scene);
        hideModalOverlay(scene);
        scene.narrativeScreen = SCREEN_NONE;
      }
    }
  ];
  createScrollableMenu(scene, "Merchant Quarter Options:\nSelect an option:", options);
}

function showListItemScreen(scene) {
  const resources = scene.localInventory;
  if (!resources || resources.length === 0) {
    alert("No items available to list.");
    showMerchantQuarterOptions(scene);
    return;
  }
  clearButtons(scene);
  const options = resources.map((item, index) => ({
    label: `${item.name} x${item.quantity}`,
    callback: () => {
      clearButtons(scene);
      promptListItemDetails(scene, item, index);
    }
  }));
  options.push({
    label: "Back",
    callback: () => {
      clearButtons(scene);
      showMerchantQuarterOptions(scene);
    }
  });
  createScrollableMenu(scene, "Select an item to list for sale:", options);
}

function promptListItemDetails(scene, item, index) {
  clearButtons(scene);
  hideDialog(scene);
  let priceStr = prompt(`Enter sale price for ${item.name}:`, "1000");
  let price = parseInt(priceStr, 10);
  if (isNaN(price)) {
    alert("Invalid price. Returning to item selection.");
    showListItemScreen(scene);
    return;
  }
  let nonce = Date.now() + Math.floor(Math.random() * 1000);
  showDialog(scene, `List ${item.name} for sale at ${price} OROMOZI?\nConfirm listing?`);
  const options = [
    {
      label: "Yes",
      callback: async () => {
        const itemListed = scene.localInventory[index];
        scene.listedItems.push({ id: index, item: itemListed.name, quantity: 1, price, nonce });
        removeFromInventory(scene, item.name, 1);
        alert("Merchant listing created successfully (simulated).");
        clearButtons(scene);
        showMerchantQuarterOptions(scene);
      }
    },
    {
      label: "No",
      callback: () => {
        clearButtons(scene);
        showListItemScreen(scene);
      }
    }
  ];
  createButtons(scene, options);
}

function showBrowseMarketplaceScreen(scene) {
  const marketItems = [
    { item: "Iron Sword", price: 500 },
    { item: "Wooden Armor", price: 300 },
    { item: "Healing Potion", price: 100 }
  ];
  clearButtons(scene);
  const options = marketItems.map(item => ({
    label: `${item.item} - ${item.price} OROMOZI`,
    callback: async () => {
      if (scene.playerStats.oromozi >= item.price) {
        scene.playerStats.oromozi -= item.price;
        addToInventory(scene, item.item);
        alert(`Purchased ${item.item} for ${item.price} OROMOZI (simulated).`);
      } else {
        alert("Insufficient OROMOZI to purchase this item!");
      }
      updateHUD(scene);
      clearButtons(scene);
      showMerchantQuarterOptions(scene);
    }
  }));
  options.push({
    label: "Back",
    callback: () => {
      clearButtons(scene);
      showMerchantQuarterOptions(scene);
    }
  });
  createScrollableMenu(scene, "Browse Marketplace:\nSelect an item to buy:", options);
}

function showMyListingsScreen(scene) {
  if (!scene.listedItems || scene.listedItems.length === 0) {
    alert("You have no listed items.");
    showMerchantQuarterOptions(scene);
    return;
  }
  clearButtons(scene);
  const options = scene.listedItems.map((listing, index) => ({
    label: `${listing.item} x${listing.quantity} - ${listing.price} OROMOZI`,
    callback: () => {
      clearButtons(scene);
      showManageListingScreen(scene, listing, index);
    }
  }));
  options.push({
    label: "Back",
    callback: () => {
      clearButtons(scene);
      showMerchantQuarterOptions(scene);
    }
  });
  createScrollableMenu(scene, "Your Listings:\nSelect an item to manage:", options);
}

function showManageListingScreen(scene, listing, index) {
  clearButtons(scene);
  const options = [
    {
      label: "Edit Price",
      callback: () => {
        clearButtons(scene);
        promptEditPrice(scene, listing, index);
      }
    },
    {
      label: "Cancel Listing",
      callback: async () => {
        addToInventory(scene, listing.item, listing.quantity);
        scene.listedItems.splice(index, 1);
        alert(`Listing for ${listing.item} cancelled (simulated).`);
        clearButtons(scene);
        showMerchantQuarterOptions(scene);
      }
    },
    {
      label: "Back",
      callback: () => {
        clearButtons(scene);
        showMyListingsScreen(scene);
      }
    }
  ];
  createScrollableMenu(scene, `Manage ${listing.item} (${listing.price} OROMOZI):\nSelect an option:`, options);
}

function promptEditPrice(scene, listing, index) {
  clearButtons(scene);
  hideDialog(scene);
  let newPriceStr = prompt(`Enter new price for ${listing.item} (current: ${listing.price}):`, listing.price);
  let newPrice = parseInt(newPriceStr, 10);
  if (isNaN(newPrice)) {
    alert("Invalid price. Returning to listing options.");
    showManageListingScreen(scene, listing, index);
    return;
  }
  showDialog(scene, `Update ${listing.item} price to ${newPrice} OROMOZI?\nConfirm change?`);
  const options = [
    {
      label: "Yes",
      callback: async () => {
        scene.listedItems[index].price = newPrice;
        alert(`Listing price updated to ${newPrice} (simulated).`);
        clearButtons(scene);
        showMerchantQuarterOptions(scene);
      }
    },
    {
      label: "No",
      callback: () => {
        clearButtons(scene);
        showManageListingScreen(scene, listing, index);
      }
    }
  ];
  createButtons(scene, options);
}

function showRoyalMarketOptions(scene) {
  scene.narrativeScreen = SCREEN_ROYAL;
  showModalOverlay(scene);
  const categories = [
    { name: "Browse Weapons", items: [{ item: "Iron Sword", price: 500 }, { item: "Steel Axe", price: 700 }] },
    { name: "Resources", items: [{ item: "Wood", price: 50 }, { item: "Iron Ore", price: 100 }] },
    { name: "Consumables", items: [{ item: "Bread", price: 20 }, { item: "Healing Potion", price: 100 }] },
    { name: "Aesthetic Items", items: [{ item: "Fancy Hat", price: 200 }, { item: "Golden Necklace", price: 300 }] },
    { name: "Armor", items: [{ item: "Wooden Armor", price: 300 }, { item: "Iron Chestplate", price: 600 }] },
    { name: "Special Moves", items: [{ item: "Fireball", price: 1000 }, { item: "Stealth Strike", price: 1200 }] }
  ];
  const options = categories.map(cat => ({
    label: cat.name,
    callback: () => {
      clearButtons(scene);
      showRoyalCategoryScreen(scene, cat.name, cat.items);
    }
  }));
  options.push({
    label: "Back",
    callback: () => {
      clearButtons(scene);
      hideDialog(scene);
      hideModalOverlay(scene);
      scene.narrativeScreen = SCREEN_NONE;
    }
  });
  createScrollableMenu(scene, "Royal Market Options:\nSelect a category:", options);
}

function showRoyalCategoryScreen(scene, category, items) {
  clearButtons(scene);
  const options = items.map(item => ({
    label: `${item.item} - ${item.price} OROMOZI`,
    callback: async () => {
      if (scene.playerStats.oromozi >= item.price) {
        scene.playerStats.oromozi -= item.price;
        addToInventory(scene, item.item);
        alert(`Purchased ${item.item} for ${item.price} OROMOZI (simulated).`);
      } else {
        alert("Insufficient OROMOZI to purchase this item!");
      }
      updateHUD(scene);
      clearButtons(scene);
      showRoyalMarketOptions(scene);
    }
  }));
  options.push({
    label: "Back",
    callback: () => {
      clearButtons(scene);
      showRoyalMarketOptions(scene);
    }
  });
  createScrollableMenu(scene, `${category}:\nSelect an item to purchase:`, options);
}

function showTradingPostOptions(scene) {
  scene.narrativeScreen = SCREEN_TRADING;
  showModalOverlay(scene);
  const options = [
    {
      label: "Post an Item",
      callback: () => {
        clearButtons(scene);
        showTradePostItemScreen(scene);
      }
    },
    {
      label: "View Trade Listings",
      callback: () => {
        clearButtons(scene);
        showTradeListingsScreen(scene);
      }
    },
    {
      label: "Back",
      callback: () => {
        clearButtons(scene);
        hideDialog(scene);
        hideModalOverlay(scene);
        scene.narrativeScreen = SCREEN_NONE;
      }
    }
  ];
  createScrollableMenu(scene, "Trading Post Options:\nSelect an option:", options);
}

function showTradePostItemScreen(scene) {
  const resources = scene.localInventory;
  if (!resources || resources.length === 0) {
    alert("No items available to post.");
    showTradingPostOptions(scene);
    return;
  }
  clearButtons(scene);
  const options = resources.map((item, index) => ({
    label: `${item.name} x${item.quantity}`,
    callback: () => {
      clearButtons(scene);
      promptTradeRequest(scene, item, index);
    }
  }));
  options.push({
    label: "Back",
    callback: () => {
      clearButtons(scene);
      showTradingPostOptions(scene);
    }
  });
  createScrollableMenu(scene, "Select an item to offer:", options);
}

function promptTradeRequest(scene, offerItem, offerIndex) {
  clearButtons(scene);
  const allLootItems = getAllLootItems(scene);
  const options = allLootItems.map(item => ({
    label: item,
    callback: async () => {
      scene.tradeListings.push({ offer: offerItem.name, quantity: 1, request: item });
      removeFromInventory(scene, offerItem.name, 1);
      alert(`Trade posted: ${offerItem.name} for ${item} (simulated).`);
      clearButtons(scene);
      showTradingPostOptions(scene);
    }
  }));
  options.push({
    label: "Back",
    callback: () => {
      clearButtons(scene);
      showTradePostItemScreen(scene);
    }
  });
  createScrollableMenu(scene, `Select an item to request for ${offerItem.name}:`, options);
}

function showTradeListingsScreen(scene) {
  if (!scene.tradeListings || scene.tradeListings.length === 0) {
    alert("No trade listings available.");
    showTradingPostOptions(scene);
    return;
  }
  clearButtons(scene);
  const options = scene.tradeListings.map((trade, index) => ({
    label: `${trade.offer} x${trade.quantity} for ${trade.request}`,
    callback: async () => {
      const offerItem = scene.localInventory.find(item => item.name === trade.request);
      if (offerItem && offerItem.quantity >= 1) {
        removeFromInventory(scene, trade.request, 1);
        addToInventory(scene, trade.offer, trade.quantity);
        scene.tradeListings.splice(index, 1);
        alert(`Trade accepted: Received ${trade.offer} for ${trade.request} (simulated).`);
      } else {
        alert(`You don’t have ${trade.request} to trade!`);
      }
      clearButtons(scene);
      showTradingPostOptions(scene);
    }
  }));
  options.push({
    label: "Back",
    callback: () => {
      clearButtons(scene);
      showTradingPostOptions(scene);
    }
  });
  createScrollableMenu(scene, "Trade Listings:\nSelect a trade to accept:", options);
}

function showTinkerersLabOptions(scene) {
  scene.narrativeScreen = SCREEN_TINKER;
  showModalOverlay(scene);
  const options = [
    {
      label: "Attempt to Invent",
      callback: () => {
        clearButtons(scene);
        showInventItemScreen(scene);
      }
    },
    {
      label: "Back",
      callback: () => {
        clearButtons(scene);
        hideDialog(scene);
        hideModalOverlay(scene);
        scene.narrativeScreen = SCREEN_NONE;
      }
    }
  ];
  createScrollableMenu(scene, "Tinkerer's Lab Options:\nSelect an option:", options);
}

function showInventItemScreen(scene) {
  const resources = scene.localInventory;
  if (!resources || resources.length < 3) {
    alert("You need at least 3 items to invent something.");
    showTinkerersLabOptions(scene);
    return;
  }
  clearButtons(scene);
  let selectedItems = [];
  const options = resources.map((item, index) => ({
    label: `${item.name} x${item.quantity}`,
    callback: () => {
      if (selectedItems.length < 3 && !selectedItems.includes(item.name)) {
        selectedItems.push(item.name);
        if (selectedItems.length === 3) {
          clearButtons(scene);
          confirmInvention(scene, selectedItems);
        } else {
          showDialog(scene, `Selected: ${selectedItems.join(", ")}\nSelect ${3 - selectedItems.length} more:`);
        }
      }
    }
  }));
  options.push({
    label: "Back",
    callback: () => {
      clearButtons(scene);
      showTinkerersLabOptions(scene);
    }
  });
  createScrollableMenu(scene, "Select 3 items to attempt invention (click 3 times):", options);
}

function confirmInvention(scene, items) {
  clearButtons(scene);
  showDialog(scene, `Invent using ${items.join(", ")}?\nConfirm invention?`);
  const options = [
    {
      label: "Yes",
      callback: async () => {
        const secretRecipes = [
          { ingredients: ["Iron Ore", "Copper Ore", "Wood"], result: "Mechanical Cog" },
          { ingredients: ["Fire Crystal", "Steel Ingot", "Thread"], result: "Flamethrower Gadget" },
          { ingredients: ["Vines", "Stone", "Herbs"], result: "Vine Trap" },
          { ingredients: ["Poisonous Berries", "Water", "Iron Ore"], result: "Toxic Sprayer" },
          { ingredients: ["Wood", "Thread", "Copper Ore"], result: "Wind-Up Toy" },
          { ingredients: ["Steel Ingot", "Fire Crystal", "Wood"], result: "Steam Pistol" },
          { ingredients: ["Leather", "Iron Ore", "Vines"], result: "Spring-Loaded Glove" }
        ];

        items.sort();
        const match = secretRecipes.find(recipe => {
          const sortedRecipe = [...recipe.ingredients].sort();
          return items.length === sortedRecipe.length && items.every((item, i) => item === sortedRecipe[i]);
        });

        const hasItems = items.every(item => {
          const invItem = scene.localInventory.find(i => i.name === item);
          return invItem && invItem.quantity >= 1;
        });

        if (hasItems) {
          items.forEach(item => removeFromInventory(scene, item));
          if (match) {
            const newItem = match.result;
            addToInventory(scene, newItem);
            alert(`Invention succeeded! Created ${newItem} (simulated).`);
          } else {
            alert("Invention failed! Items consumed (simulated).");
          }
        } else {
          alert("You don’t have all the required items!");
        }
        clearButtons(scene);
        showTinkerersLabOptions(scene);
      }
    },
    {
      label: "No",
      callback: () => {
        clearButtons(scene);
        showInventItemScreen(scene);
      }
    }
  ];
  createButtons(scene, options);
}

function showCraftingWorkshopOptions(scene) {
  scene.narrativeScreen = SCREEN_CRAFT;
  showModalOverlay(scene);
  const options = [
    {
      label: "Craft Item",
      callback: () => {
        clearButtons(scene);
        showCraftItemScreen(scene);
      }
    },
    {
      label: "Repair Item",
      callback: () => {
        clearButtons(scene);
        showRepairItemScreen(scene);
      }
    },
    {
      label: "Salvage Loot",
      callback: () => {
        clearButtons(scene);
        showSalvageItemScreen(scene);
      }
    },
    {
      label: "Back",
      callback: () => {
        clearButtons(scene);
        hideDialog(scene);
        hideModalOverlay(scene);
        scene.narrativeScreen = SCREEN_NONE;
      }
    }
  ];
  createScrollableMenu(scene, "Crafting Workshop Options:\nSelect an option:", options);
}

function showCraftItemScreen(scene) {
  const recipes = [
    { result: "Iron Sword", ingredients: ["Iron Ore", "Wood"], description: "A sturdy blade for combat." },
    { result: "Wooden Armor", ingredients: ["Wood", "Wood"], description: "Basic protection from the wilds." },
    { result: "Steel Axe", ingredients: ["Steel Ingot", "Wood"], description: "Chops trees and foes alike." },
    { result: "Leather Boots", ingredients: ["Leather", "Thread"], description: "Swift and silent footwear." },
    { result: "Healing Salve", ingredients: ["Herbs", "Water"], description: "Restores minor wounds." },
    { result: "Poison Dagger", ingredients: ["Iron Ore", "Poisonous Berries"], description: "A sneaky, toxic blade." },
    { result: "Stone Hammer", ingredients: ["Stone", "Wood"], description: "Good for breaking rocks." },
    { result: "Copper Ring", ingredients: ["Copper Ore", "Thread"], description: "A shiny trinket." },
    { result: "Fire Staff", ingredients: ["Wood", "Fire Crystal"], description: "Channels fiery magic." },
    { result: "Shield of Roots", ingredients: ["Wood", "Vines"], description: "Nature’s sturdy defense." }
  ];
  clearButtons(scene);
  const options = recipes.map(recipe => ({
    label: `${recipe.result} (${recipe.ingredients.join(", ")})`,
    callback: () => {
      clearButtons(scene);
      confirmCraftItem(scene, recipe);
    }
  }));
  options.push({
    label: "Back",
    callback: () => {
      clearButtons(scene);
      showCraftingWorkshopOptions(scene);
    }
  });
  createScrollableMenu(scene, "Select an item to craft:", options);
}

function confirmCraftItem(scene, recipe) {
  const hasIngredients = recipe.ingredients.every(ing => scene.localInventory.some(i => i.name === ing && i.quantity >= 1));
  if (!hasIngredients) {
    alert(`You don’t have all required ingredients: ${recipe.ingredients.join(", ")}`);
    showCraftingWorkshopOptions(scene);
    return;
  }
  showDialog(scene, `Craft ${recipe.result} using ${recipe.ingredients.join(", ")}?\n${recipe.description}\nConfirm crafting?`);
  const options = [
    {
      label: "Yes",
      callback: async () => {
        recipe.ingredients.forEach(item => removeFromInventory(scene, item));
        addToInventory(scene, recipe.result);
        alert(`Crafted ${recipe.result} (simulated).`);
        clearButtons(scene);
        showCraftingWorkshopOptions(scene);
      }
    },
    {
      label: "No",
      callback: () => {
        clearButtons(scene);
        showCraftItemScreen(scene);
      }
    }
  ];
  createButtons(scene, options);
}

function showRepairItemScreen(scene) {
  const resources = scene.localInventory;
  if (!resources || resources.length === 0) {
    alert("No items available to repair.");
    showCraftingWorkshopOptions(scene);
    return;
  }
  clearButtons(scene);
  const options = resources.map((item, index) => ({
    label: `${item.name} x${item.quantity}`,
    callback: async () => {
      const resourceItem = scene.localInventory.find(i => i.name === "Wood");
      if (resourceItem && resourceItem.quantity >= 1) {
        removeFromInventory(scene, "Wood");
        alert(`Repaired ${scene.localInventory[index].name} (simulated).`);
      } else {
        alert(`You don’t have Wood to repair this item!`);
      }
      clearButtons(scene);
      showCraftingWorkshopOptions(scene);
    }
  }));
  options.push({
    label: "Back",
    callback: () => {
      clearButtons(scene);
      showCraftingWorkshopOptions(scene);
    }
  });
  createScrollableMenu(scene, "Select an item to repair (requires Wood):", options);
}

function showSalvageItemScreen(scene) {
  const resources = scene.localInventory;
  if (!resources || resources.length === 0) {
    alert("No items available to salvage.");
    showCraftingWorkshopOptions(scene);
    return;
  }
  clearButtons(scene);
  const options = resources.map((item, index) => ({
    label: `${item.name} x${item.quantity}`,
    callback: async () => {
      const salvage = getRandomLootForZone(scene);
      removeFromInventory(scene, item.name, 1);
      addToInventory(scene, salvage);
      alert(`Salvaged ${item.name} into ${salvage} (simulated).`);
      clearButtons(scene);
      showCraftingWorkshopOptions(scene);
    }
  }));
  options.push({
    label: "Back",
    callback: () => {
      clearButtons(scene);
      showCraftingWorkshopOptions(scene);
    }
  });
  createScrollableMenu(scene, "Select an item to salvage:", options);
}

/* =======================================================
   6) VILLAGE CONTRACT INTERACTION HANDLER
======================================================= */
function handleVillageContractInteraction(scene, obj) {
  console.log("Village contract interaction triggered for:", obj.name);
  switch (obj.name.toLowerCase()) {
    case "trading_post":
      showTradingPostOptions(scene);
      break;
    case "crafting_workshop":
      showCraftingWorkshopOptions(scene);
      break;
    case "liquidity_bank":
      showLiquidityPoolOptions(scene);
      break;
    case "merchant_quarter":
      showMerchantQuarterOptions(scene);
      break;
    case "royal_market":
      showRoyalMarketOptions(scene);
      break;
    case "tinkerers_lab":
      showTinkerersLabOptions(scene);
      break;
    case "scavenger_mode":
      console.log("Entering Scavenger Mode...");
      showDialog(scene, "Enter Scavenger Mode with your current inventory?\n(Press SPACE to confirm)");
      scene.input.keyboard.once("keydown-SPACE", () => {
        const targetZone = zoneList.find(z => z.name === "Outer Grasslands");
        if (targetZone) {
          const currentOromozi = scene.playerStats.oromozi;
          scene.playerStats = createInitialStats(targetZone.name, currentOromozi);
          scene.scene.restart({ zone: targetZone, inventory: scene.localInventory, promptCount: 0 });
        } else {
          console.warn("Outer Grasslands zone not found!");
        }
      });
      break;
    case "battle_mode":
      console.log("Entering Battle Mode...");
      enterBattleMode(scene);
      break;
    case "fishing_spot":
      console.log("Entering Fishing Mode...");
      showDialog(scene, "Start fishing?\n(Press SPACE to confirm)");
      scene.input.keyboard.once("keydown-SPACE", () => {
        scene.scene.start('FishingScene');
      });
      break;
      case "camping_mode":
  console.log("Entering Camping Mode...");
  showDialog(scene, "Go camping?\n(Press SPACE to confirm)");
  scene.input.keyboard.once("keydown-SPACE", () => {
    scene.scene.start('CampingScene', {
      zone: scene.scene.settings.data.zone,
      inventory: scene.localInventory,
      promptCount: scene.promptCount,
      // Include fire state if previously set (e.g., from a prior CampingScene exit)
      isFireLit: scene.scene.settings.data.isFireLit || false,
      burnTime: scene.scene.settings.data.burnTime || 0,
      currentStokes: scene.scene.settings.data.currentStokes || 0,
      lightRadius: scene.scene.settings.data.lightRadius || 150,
      campfireScale: scene.scene.settings.data.campfireScale || 1.5,
      campfireOriginY: scene.scene.settings.data.campfireOriginY || 0.75,
      isTorchLit: scene.scene.settings.data.isTorchLit || false,
      torchBurnTime: scene.scene.settings.data.torchBurnTime || 0,
      torchCurrentStokes: scene.scene.settings.data.torchCurrentStokes || 0,
      torchLightRadius: scene.scene.settings.data.torchLightRadius || 150,
      torchScale: scene.scene.settings.data.torchScale || 0.75,
      torchOriginY: scene.scene.settings.data.torchOriginY || 0.75
    });
  });
  break;
    default:
      console.log("Unknown village interaction:", obj.name);
      break;
  }
}

/* =======================================================
   7) SCENE EXCLAMATION SPAWNING FUNCTIONS
======================================================= */
function spawnOneExclamation(scene) {
  const MAX_TRIES = 100;
  let tries = 0;
  const worldW = scene.background.displayWidth;
  const worldH = scene.background.displayHeight;
  while (tries < MAX_TRIES) {
    tries++;
    const exX = Phaser.Math.Between(50, worldW - 50);
    const exY = Phaser.Math.Between(50, worldH - 50);
    if (!overlapsObstacle(scene, exX, exY)) {
      const ex = scene.exclamations.create(exX, exY, "exclamation");
      ex.setScale(bgScale * 4);
      ex.setDepth(900);
      ex.setImmovable(true);
      return;
    }
  }
  console.warn("Unable to place exclamation after", MAX_TRIES, "tries.");
}

function spawnMultipleExclamations(scene, count) {
  if (scene.currentZone === "Village") return;
  for (let i = 0; i < count; i++) {
    spawnOneExclamation(scene);
  }
}

function overlapsObstacle(scene, x, y) {
  const EX_SIZE = 16;
  const exRect = new Phaser.Geom.Rectangle(x - EX_SIZE / 2, y - EX_SIZE / 2, EX_SIZE, EX_SIZE);
  const obstacles = scene.obstacles ? scene.obstacles.getChildren() : [];
  for (let obs of obstacles) {
    const obsBounds = obs.getBounds();
    if (Phaser.Geom.Intersects.RectangleToRectangle(exRect, obsBounds)) {
      return true;
    }
  }
  return false;
}

/* =======================================================
   8) HELPER UI FUNCTIONS
======================================================= */
function showDialog(scene, text) {
  const boxW = 220, boxH = 150;
  const boxX = (scene.game.config.width - boxW) / 2;
  const boxY = (scene.game.config.height - boxH) / 2;
  scene.dialogBg.clear();
  scene.dialogBg.fillStyle(0x000000, 0.8);
  scene.dialogBg.fillRect(boxX, boxY, boxW, boxH);
  scene.dialogText.setPosition(boxX + 10, boxY + 10);
  scene.dialogText.setText(text);
  scene.dialogBg.setVisible(true);
  scene.dialogText.setVisible(true);
  scene.dialogBg.setScrollFactor(0);
  scene.dialogText.setScrollFactor(0);
}

function hideDialog(scene) {
  scene.dialogBg.clear();
  scene.dialogBg.setVisible(false);
  scene.dialogText.setVisible(false);
  updateHUD(scene);
}

function createButtons(scene, lines) {
  clearButtons(scene);
  const boxW = 220, boxH = 150;
  const boxX = (scene.game.config.width - boxW) / 2;
  const boxY = (scene.game.config.height - boxH) / 2;
  let startX = boxX + 10;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const txt = scene.add.text(startX, boxY + 80 + i * 20, line.label, { font: "12px Arial", fill: "#ffff00" });
    txt.setDepth(1001);
    txt.setInteractive({ useHandCursor: true });
    txt.on("pointerdown", () => line.callback());
    scene.buttons.push(txt);
    txt.setScrollFactor(0);
  }
}

function clearButtons(scene) {
  scene.buttons.forEach(btn => btn.destroy());
  scene.buttons = [];
}

function getOverlappingExclamation(scene) {
  if (!scene.player || !scene.exclamations) return null;
  const playerRect = scene.player.getBounds();
  const exList = scene.exclamations.getChildren();
  for (let ex of exList) {
    if (Phaser.Geom.Intersects.RectangleToRectangle(playerRect, ex.getBounds())) {
      return ex;
    }
  }
  return null;
}

function endFlow(scene) {
  scene.narrativeScreen = SCREEN_NONE;
  scene.activePrompt = null;
  scene.chosenOptionIndex = -1;
  hideDialog(scene);
  console.log("Narrative flow ended.");
  updateHUD(scene);
  scene.promptCount++;
  console.log("Prompt count:", scene.promptCount);
}

/* =======================================================
   9) NARRATIVE FLOW FUNCTIONS
======================================================= */
function showPrologue(scene) {
  const zone = scene.currentZone;
  const prologues = scene.narrativePrologues?.[zone];
  if (!prologues || prologues.length === 0) {
    console.log("No prologues for zone:", zone);
    scene.narrativeScreen = SCREEN_PROMPT;
    showPrompt(scene);
    return;
  }
  const text = prologues[Phaser.Math.Between(0, prologues.length - 1)];
  showDialog(scene, text + "\n\n(Press SPACE to continue)");
}

function showPrompt(scene) {
  const zone = scene.currentZone;
  const prompts = scene.narrativeData?.zones?.[zone];
  if (!prompts || prompts.length === 0) {
    console.warn("No prompts for zone:", zone);
    hideDialog(scene);
    scene.narrativeScreen = SCREEN_NONE;
    return;
  }
  const randIndex = Phaser.Math.Between(0, prompts.length - 1);
  scene.activePrompt = prompts[randIndex];
  showDialog(scene, `--- ${zone} ---\n\n${scene.activePrompt.prompt}\n\n(Press SPACE to see choices)`);
}

function showChoices(scene) {
  if (!scene.activePrompt) return;
  showDialog(scene, "Pick one choice:");
  const lines = scene.activePrompt.options.map((opt, i) => ({
    label: opt,
    callback: () => {
      scene.chosenOptionIndex = i;
      scene.narrativeScreen = SCREEN_OUTCOME;
      showOutcome(scene);
    }
  }));
  if (scene.promptCount >= 10) {
    let extraOption = null;
    if (scene.currentZone === "Outer Grasslands") {
      extraOption = "Return to Village";
    } else if (scene.currentZone !== "Village") {
      let currentIndex = zoneList.findIndex(z => z.name === scene.currentZone);
      if (currentIndex > 0) {
        extraOption = `Return to ${zoneList[currentIndex - 1].name}`;
      }
    }
    if (extraOption) {
      lines.push({
        label: extraOption,
        callback: () => {
          handleReturn(scene);
        }
      });
    }
  }
  lines.push({
    label: "Back",
    callback: () => {
      scene.narrativeScreen = SCREEN_PROMPT;
      clearButtons(scene);
      showPrompt(scene);
    }
  });
  createButtons(scene, lines);
}

async function showOutcome(scene) {
  clearButtons(scene);
  if (!scene.activePrompt) return;
  if (scene.chosenOptionIndex < 0 || scene.chosenOptionIndex >= scene.activePrompt.outcomes.length) return;
  const outcomeText = scene.activePrompt.outcomes[scene.chosenOptionIndex];
  showDialog(scene, "Processing outcome, please wait...");
  await applyOutcome(scene, outcomeText);
  scene.narrativeScreen = SCREEN_OUTCOME;
}

function showItemMenu(scene) {
  showDialog(scene, "Item Options:\nPress 'U' to Use Item\nPress 'E' to Equip Item\n\n(Press SPACE to continue playing)");
  const uKey = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.U);
  const eKey = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);
  const spaceKey = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
  uKey.once("down", () => {
    spaceKey.removeAllListeners();
    eKey.removeAllListeners();
    scene.narrativeScreen = SCREEN_ITEM_PICK;
    showItemPick(scene, true);
  });
  eKey.once("down", () => {
    spaceKey.removeAllListeners();
    uKey.removeAllListeners();
    scene.narrativeScreen = SCREEN_ITEM_PICK;
    showItemPick(scene, false);
  });
  spaceKey.once("down", () => {
    uKey.removeAllListeners();
    eKey.removeAllListeners();
    hideDialog(scene);
    endFlow(scene);
  });
}

function showItemPick(scene, isUseFlow) {
  hideDialog(scene);
  const inv = scene.localInventory || [];
  if (inv.length === 0) {
    showDialog(scene, "Your inventory is empty.\n(Press SPACE to end)");
    return;
  }
  const lines = inv.map(item => ({
    label: `${item.name} x${item.quantity}`,
    callback: () => {
      clearButtons(scene);
      if (isUseFlow) handleUseItem(scene, item);
      else handleEquipItem(scene, item.name);
    }
  }));
  lines.push({
    label: "Cancel",
    callback: () => {
      clearButtons(scene);
      endFlow(scene);
    }
  });
  createButtons(scene, lines);
  showDialog(scene, `Select an item to ${isUseFlow ? "use" : "equip"}`);
}

function handleUseItem(scene, item) {
  const itemData = getItemData(scene, item.name);
  if (applyItemEffects(scene, itemData)) {
    removeFromInventory(scene, item.name, 1);
    alert(`Used ${item.name}.`);
  } else {
    alert(`${item.name} has no usable effects.`);
  }
  endFlow(scene);
}

function handleEquipItem(scene, itemName) {
  scene.equippedItems.push(itemName);
  recalcEquippedResist(scene);
  alert(`Equipped ${itemName}.`);
  endFlow(scene);
}

function handleReturn(scene) {
  let targetZone = null;
  if (scene.currentZone === "Outer Grasslands") {
    targetZone = zoneList.find(z => z.name.toLowerCase() === "village");
  } else if (scene.currentZone !== "Village") {
    let currentIndex = zoneList.findIndex(z => z.name === scene.currentZone);
    if (currentIndex > 0) targetZone = zoneList[currentIndex - 1];
  }
  if (targetZone) {
    console.log(`Return option selected. Traveling to zone: ${targetZone.name}`);
    showDialog(scene, `Returning to ${targetZone.name}...\n(Press SPACE to continue)`);
    scene.input.keyboard.once("keydown-SPACE", () => {
      const currentOromozi = scene.playerStats.oromozi;
      scene.playerStats = createInitialStats(targetZone.name, currentOromozi);
      scene.scene.restart({ zone: targetZone, inventory: scene.localInventory, promptCount: 0 });
    });
  } else {
    console.warn("Return option selected, but no target zone found.");
  }
}

/* =======================================================
   10) PHASER GAME CONFIG & SCENE FUNCTIONS
======================================================= */
function preload() {
  this.load.json("OuterGrasslandsMap", "assets/maps/outerGrasslands.json");
  this.load.json("ShadyGroveMap", "assets/maps/shadyGrove.json");
  this.load.json("AridDesertMap", "assets/maps/aridDesert.json");
  this.load.json("villageCommonsMap", "assets/maps/villageCommonsMap.json");

  this.load.image("outerGrasslands", "assets/backgrounds/outerGrasslands.png");
  this.load.image("shadyGrove", "assets/backgrounds/shadyGrove.png");
  this.load.image("aridDesert", "assets/backgrounds/aridDesert.png");
  this.load.image("villageCommons", "assets/backgrounds/villageCommons.png");
  this.load.image("outerGrasslandsForeground", "assets/foregrounds/outerGrasslandsForeground.png");
  this.load.image("shadyGroveForeground", "assets/foregrounds/shadyGroveForeground.png");
  this.load.image("aridDesertForeground", "assets/foregrounds/aridDesertForeground.png");

  this.load.spritesheet("player", "assets/sprites/player.png", {
    frameWidth: 48,
    frameHeight: 48,
    margin: 0,
    spacing: 0
  });

  this.load.image("exclamation", "assets/sprites/exclamation.png");

  this.load.json("narrativePrologues", "assets/data/narrativePrologues.json");
  this.load.json("narrativePrompts", "assets/data/narrativeprompt.json");
  this.load.json("lootTable", "assets/data/lootTable.json");
}

function createScene() {
  console.log("createScene: Received scene data:", this.scene.settings.data);
  let defaultZone = zoneList.find(z => z.name === "Village");
  if (!this.scene.settings.data || !this.scene.settings.data.zone) {
    this.scene.settings.data = {
      zone: defaultZone,
      inventory: [
        { name: "Bread", quantity: 1 },
        { name: "Water", quantity: 1 },
        { name: "Iron Sword", quantity: 1 },
        { name: "Wooden Armor", quantity: 1 },
        { name: "Healing Medicine", quantity: 1 }
      ],
      promptCount: 0
    };
    console.log("Defaulting zone to Village with preloaded loot items.");
  }

  const existingOromozi = this.playerStats ? this.playerStats.oromozi : 1000;
  if (!this.playerStats) this.playerStats = createInitialStats(this.scene.settings.data.zone.name, existingOromozi);
  this.localInventory = this.scene.settings.data.inventory || [];
  this.promptCount = this.scene.settings.data.promptCount || 0;
  this.returnButton = null;
  this.deposits = this.deposits || [];
  this.listedItems = this.listedItems || [];
  this.tradeListings = this.tradeListings || [];
  initEquippedData(this);

  if (this.scene.settings.data.zone.name !== "Village" && !this.initialScavengerInventory) {
    this.initialScavengerInventory = JSON.parse(JSON.stringify(this.localInventory));
    this.lastInventoryState = JSON.parse(JSON.stringify(this.localInventory));
    console.log("Initial Scavenger Mode inventory set:", this.initialScavengerInventory);
  }

  let zoneData;
  if (this.scene.settings.data.zone) {
    zoneData = this.scene.settings.data.zone;
    for (let i = 0; i < zoneList.length; i++) {
      if (zoneList[i].name === zoneData.name) {
        currentZoneIndex = i;
        break;
      }
    }
    console.log("createScene: New zone data found:", zoneData.name);
  } else {
    zoneData = zoneList[currentZoneIndex];
    console.log("createScene: No new zone data; using current zone:", zoneData.name);
  }
  this.currentZone = zoneData.name;
  this.playerStats.currentZone = this.currentZone;

  this.background = this.add.image(0, 0, zoneData.backgroundKey).setOrigin(0, 0).setScale(bgScale);
  this.physics.world.setBounds(0, 0, this.background.displayWidth, this.background.displayHeight);
  this.cameras.main.setBounds(0, 0, this.background.displayWidth, this.background.displayHeight);

  this.obstacles = this.physics.add.staticGroup();

  if (zoneData.name === "Village") {
    this.interactionObjects = this.physics.add.staticGroup();
    this.exclamations = this.physics.add.group({ immovable: true, allowGravity: false });
    const mapData = this.cache.json.get(zoneData.mapKey);
    if (mapData && mapData.layers) {
      mapData.layers.forEach(layer => {
        if (layer.type === "objectgroup" && layer.name === "Object Layer 1") {
          const offsetX = layer.offsetx || 0;
          const offsetY = layer.offsety || 0;
          layer.objects.forEach(obj => {
            const rect = this.add.rectangle(
              (obj.x + offsetX) * bgScale,
              (obj.y + offsetY) * bgScale,
              obj.width * bgScale,
              obj.height * bgScale,
              0xff0000,
              0
            );
            rect.setOrigin(0, 0);
            this.physics.add.existing(rect, true);
            this.obstacles.add(rect);
          });
        } else if (layer.type === "objectgroup" && layer.name.toLowerCase() === "interactions") {
          layer.objects.forEach(obj => {
            const interactiveObj = this.add.rectangle(
              obj.x * bgScale,
              obj.y * bgScale,
              obj.width * bgScale,
              obj.height * bgScale,
              0x00ff00,
              0
            );
            interactiveObj.setOrigin(0, 0);
            this.physics.add.existing(interactiveObj, true);
            interactiveObj.body.enable = false;
            interactiveObj.setInteractive();
            interactiveObj.on("pointerdown", () => {
              console.log("Clicked on village object:", obj);
              handleVillageContractInteraction(this, obj);
            });
            this.interactionObjects.add(interactiveObj);
          });
        }
      });
    }

    const fishingBox = this.add.rectangle(200 * bgScale, 200 * bgScale, 50 * bgScale, 50 * bgScale, 0x00ff00, 1);
    fishingBox.setOrigin(0, 0);
    fishingBox.setStrokeStyle(2, 0xffffff);
    this.physics.add.existing(fishingBox, true);
    fishingBox.body.enable = false;
    fishingBox.setInteractive();
    fishingBox.name = "fishing_spot";
    fishingBox.on("pointerdown", () => {
      console.log("Clicked on fishing box");
      handleVillageContractInteraction(this, fishingBox);
    });
    this.interactionObjects.add(fishingBox);
  
    // Red battle box
    const battleBox = this.add.rectangle(300 * bgScale, 200 * bgScale, 50 * bgScale, 50 * bgScale, 0xff0000, 1);
    battleBox.setOrigin(0, 0);
    battleBox.setStrokeStyle(2, 0xffffff);
    this.physics.add.existing(battleBox, true);
    battleBox.body.enable = false;
    battleBox.setInteractive();
    battleBox.name = "battle_mode";
    battleBox.on("pointerdown", () => {
      console.log("Clicked on battle box");
      handleVillageContractInteraction(this, battleBox);
    });
    this.interactionObjects.add(battleBox);
  
    // Yellow camping box
    const campingBox = this.add.rectangle(400 * bgScale, 200 * bgScale, 50 * bgScale, 50 * bgScale, 0xffff00, 1); // Yellow
    campingBox.setOrigin(0, 0);
    campingBox.setStrokeStyle(2, 0xffffff);
    this.physics.add.existing(campingBox, true);
    campingBox.body.enable = false;
    campingBox.setInteractive();
    campingBox.name = "camping_mode";
    campingBox.on("pointerdown", () => {
      console.log("Clicked on camping box");
      handleVillageContractInteraction(this, campingBox);
    });
    this.interactionObjects.add(campingBox);
  
  } else {
    const mapData = this.cache.json.get(zoneData.mapKey);
    if (mapData) {
      mapData.layers.forEach(layer => {
        if (layer.type === "objectgroup" && layer.name === "Object Layer 1") {
          layer.objects.forEach(obj => {
            const rect = this.add.rectangle(
              obj.x * bgScale,
              obj.y * bgScale,
              obj.width * bgScale,
              obj.height * bgScale,
              0xff0000,
              0
            );
            rect.setOrigin(0, 0);
            this.physics.add.existing(rect, true);
            this.obstacles.add(rect);
          });
        } else if (
          layer.type === "imagelayer" &&
          layer.name.toLowerCase() === zoneData.foregroundKey.toLowerCase()
        ) {
          const offX = layer.x || 0;
          const offY = layer.y || 0;
          this.foreground = this.add.image(offX * bgScale, offY * bgScale, zoneData.foregroundKey)
            .setOrigin(0, 0)
            .setScale(bgScale);
          this.foreground.setDepth(1000);
        }
      });
    }
  }

  this.player = this.physics.add.sprite(100 * bgScale, 100 * bgScale, "player");
  this.player.setScale(playerScale * 0.5);
  this.player.setCollideWorldBounds(true);
  this.player.setDepth(2000);

  this.player.body.setSize(16, 16);
  this.player.body.setOffset(16, 16);

  console.log("Available frames in player texture:", this.textures.get('player').frames);

  this.anims.create({
    key: "walk-down",
    frames: this.anims.generateFrameNumbers("player", { start: 18, end: 20 }),
    frameRate: 10,
    repeat: -1
  });

  this.anims.create({
    key: "walk-left",
    frames: this.anims.generateFrameNumbers("player", { start: 24, end: 26 }),
    frameRate: 10,
    repeat: -1
  });

  this.anims.create({
    key: "walk-right",
    frames: this.anims.generateFrameNumbers("player", { start: 6, end: 8 }),
    frameRate: 10,
    repeat: -1
  });

  this.anims.create({
    key: "walk-up",
    frames: this.anims.generateFrameNumbers("player", { start: 12, end: 14 }),
    frameRate: 10,
    repeat: -1
  });

  this.player.anims.play("walk-down", true);

  this.cameras.main.startFollow(this.player);
  this.cameras.main.setZoom(2);

  const cam = this.cameras.main;
  const visibleWidth = cam.width / cam.zoom;
  const visibleHeight = cam.height / cam.zoom;
  const frameX = (this.game.config.width - visibleWidth) / 2;
  const frameY = (this.game.config.height - visibleHeight) / 2;
  this.frameRect = new Phaser.Geom.Rectangle(frameX, frameY, visibleWidth, visibleHeight);
  this.frame = this.add.graphics();
  this.frame.lineStyle(4, 0xffffff, 1);
  this.frame.strokeRect(frameX, frameY, visibleWidth, visibleHeight);
  this.frame.setScrollFactor(0);
  this.frame.setDepth(10000);
  this.hudText = this.add.text(frameX + 10, frameY + visibleHeight - 10, "", {
    font: "16px Arial",
    fill: "#ffffff"
  });
  this.hudText.setOrigin(0, 1);
  this.hudText.setScrollFactor(0);
  this.hudText.setDepth(11000);

  this.keys = this.input.keyboard.addKeys({
    up: Phaser.Input.Keyboard.KeyCodes.W,
    left: Phaser.Input.Keyboard.KeyCodes.A,
    down: Phaser.Input.Keyboard.KeyCodes.S,
    right: Phaser.Input.Keyboard.KeyCodes.D,
    interact: Phaser.Input.Keyboard.KeyCodes.I,
    z: Phaser.Input.Keyboard.KeyCodes.Z,
    v: Phaser.Input.Keyboard.KeyCodes.V
  });
  this.spaceKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

  if (zoneData.name !== "Village") {
    this.exclamations = this.physics.add.group({ immovable: true, allowGravity: false });
  }

  this.narrativePrologues = this.cache.json.get("narrativePrologues");
  this.narrativeData = this.cache.json.get("narrativePrompts");

  this.dialogBg = this.add.graphics();
  this.dialogBg.setDepth(1000);
  this.dialogBg.setVisible(false);
  this.dialogText = this.add.text(0, 0, "", {
    font: "12px Arial",
    fill: "#ffffff",
    wordWrap: { width: 200 }
  });
  this.dialogText.setDepth(1001);
  this.dialogText.setVisible(false);
  this.buttons = [];
  this.narrativeScreen = SCREEN_NONE;
  this.activePrompt = null;
  this.chosenOptionIndex = -1;

  if (this.obstacles && this.obstacles.getLength() > 0) {
    this.physics.add.collider(this.player, this.obstacles);
  }

  updateHUD(this);

  if (this.currentZone !== "Village" && this.exclamations) {
    spawnMultipleExclamations(this, 6);
    this.time.addEvent({
      delay: 10000,
      callback: () => {
        spawnMultipleExclamations(this, 1);
      },
      loop: true
    });
  }
}

function updateScene(time, delta) {
  if (!this.player || !this.player.body) return;

  if (this.playerStats && this.playerStats.health <= 0 && this.currentZone !== "Village" && this.narrativeScreen !== SCREEN_NONE) {
    console.log("Player died in Scavenger Mode!");
    this.narrativeScreen = SCREEN_NONE;
    showDialog(this, "You have died!\nYou wake up in Village Commons...");
    this.time.delayedCall(2000, () => {
      this.cameras.main.fadeOut(1000, 0, 0, 0, (camera, progress) => {
        if (progress === 1) {
          const villageZone = zoneList.find(z => z.name === "Village");
          this.localInventory = JSON.parse(JSON.stringify(this.initialScavengerInventory));
          this.playerStats = createInitialStats(villageZone.name, this.playerStats.oromozi);
          this.scene.restart({ zone: villageZone, inventory: this.localInventory, promptCount: 0 });
          this.cameras.main.once('camerafadeincomplete', () => {
            console.log("Player respawned in Village Commons with initial inventory:", this.localInventory);
            hideDialog(this);
          });
          this.cameras.main.fadeIn(1000, 0, 0, 0);
        }
      });
    });
    return;
  }

  if (Phaser.Input.Keyboard.JustDown(this.keys.z)) {
    currentZoneIndex = (currentZoneIndex + 1) % zoneList.length;
    this.scene.restart({ zone: zoneList[currentZoneIndex], inventory: this.localInventory, promptCount: this.promptCount });
    return;
  }

  if (this.foreground) {
    const overlapsForeground = Phaser.Geom.Intersects.RectangleToRectangle(this.player.getBounds(), this.foreground.getBounds());
    if (overlapsForeground) {
      this.player.setDepth(this.foreground.depth - 1);
    } else {
      this.player.setDepth(this.foreground.depth + 1);
    }
  }

  if (this.narrativeScreen >= SCREEN_LIQUIDITY) {
    this.player.setVelocity(0);
    this.player.anims.stop();
    return;
  }

  switch (this.narrativeScreen) {
    case SCREEN_PROLOGUE:
    case SCREEN_PROMPT:
      this.player.setVelocity(0);
      this.player.anims.stop();
      if (Phaser.Input.Keyboard.JustDown(this.spaceKey)) {
        if (this.narrativeScreen === SCREEN_PROLOGUE) {
          this.narrativeScreen = SCREEN_PROMPT;
          showPrompt(this);
        } else if (this.narrativeScreen === SCREEN_PROMPT) {
          this.narrativeScreen = SCREEN_CHOICES;
          showChoices(this);
        }
      }
      return;
    case SCREEN_CHOICES:
      this.player.setVelocity(0);
      this.player.anims.stop();
      return;
    case SCREEN_OUTCOME:
      this.player.setVelocity(0);
      this.player.anims.stop();
      if (Phaser.Input.Keyboard.JustDown(this.spaceKey)) {
        this.narrativeScreen = SCREEN_ITEM_MENU;
        showItemMenu(this);
      }
      return;
    case SCREEN_ITEM_MENU:
    case SCREEN_ITEM_PICK:
      this.player.setVelocity(0);
      this.player.anims.stop();
      return;
    default:
      break;
  }

  const speed = 80;
  this.player.setVelocity(0);

  if (this.keys.left.isDown) {
    this.player.setVelocityX(-speed);
    this.player.anims.play("walk-left", true);
  } else if (this.keys.right.isDown) {
    this.player.setVelocityX(speed);
    this.player.anims.play("walk-right", true);
  } else if (this.keys.up.isDown) {
    this.player.setVelocityY(-speed);
    this.player.anims.play("walk-up", true);
  } else if (this.keys.down.isDown) {
    this.player.setVelocityY(speed);
    this.player.anims.play("walk-down", true);
  } else {
    this.player.setVelocity(0);
    this.player.anims.stop();
    this.player.anims.setCurrentFrame(this.anims.get("walk-down").frames[0]);
  }

  if (Phaser.Input.Keyboard.JustDown(this.keys.interact)) {
    const ex = getOverlappingExclamation(this);
    if (ex) {
      console.log("Interacting with ex at:", ex.x, ex.y);
      ex.destroy();
      this.narrativeScreen = SCREEN_PROLOGUE;
      showPrologue(this);
    } else {
      console.log("Interact pressed, but no exclamation overlap.");
    }
  }
}

/* =======================================================
   11) PHASER SCENE CLASS & CONFIG
======================================================= */
class MainGameScene extends Phaser.Scene {
  constructor() {
    super('MainGameScene');
  }

  preload() {
    preload.call(this);
  }

  create() {
    createScene.call(this);
  }

  update(time, delta) {
    updateScene.call(this, time, delta);
  }
}

const config = {
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  parent: "phaser-game",
  physics: {
    default: "arcade",
    arcade: { gravity: { y: 0 }, debug: false }
  },
  scene: [MainGameScene, FishingScene, CampingScene]
};

const game = new Phaser.Game(config);

window.preload = preload;
window.createScene = createScene;
window.updateScene = updateScene;