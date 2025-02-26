export function createInitialStats(zoneName, existingOromozi = 1000) {
  return { 
    health: 100, 
    thirst: 100, 
    hunger: 100, 
    stamina: 100, 
    oromozi: existingOromozi, 
    currentZone: zoneName || "" 
  };
}

export function initEquippedData(scene) {
  scene.equippedItems = [];
  scene.equippedResist = {};
}

export function updateHUD(scene) {
  if (!scene.hudText || !scene.playerStats) return;
  const s = scene.playerStats;
  scene.hudText.setText("");
  if (scene.currentZone === "Village") {
    scene.hudText.setText(`OROMOZI: ${s.oromozi}`);
  } else {
    scene.hudText.setText(
      `HEALTH: ${s.health}   STAMINA: ${s.stamina}\nHUNGER: ${s.hunger}   THIRST: ${s.thirst}\nOROMOZI: ${s.oromozi}`
    );
  }
}

export function spawnOneExclamation(scene) {
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
      ex.setScale(SCALES.bgScale * 4);
      ex.setDepth(900);
      ex.setImmovable(true);
      return;
    }
  }
  console.warn("Unable to place exclamation after", MAX_TRIES, "tries.");
}

export function spawnMultipleExclamations(scene, count) {
  if (scene.currentZone === "Village") return;
  for (let i = 0; i < count; i++) {
    spawnOneExclamation(scene);
  }
}

export function overlapsObstacle(scene, x, y) {
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

export function showDialog(scene, text) {
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
}

export function hideDialog(scene) {
  scene.dialogBg.clear();
  scene.dialogBg.setVisible(false);
  scene.dialogText.setVisible(false);
  updateHUD(scene);
}

export function getOverlappingExclamation(scene) {
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

// Add other functions like showPrologue, showPrompt, etc., as needed from main.js