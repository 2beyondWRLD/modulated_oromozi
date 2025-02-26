import { zoneList, SCREEN_STATES, SCALES } from './constants.js';
import * as Utils from './utils.js';

export default class FishingScene extends Phaser.Scene {
  constructor() {
    super('FishingScene');
  }

  preload() {
    this.load.spritesheet('player', 'assets/sprites/player.png', { frameWidth: 48, frameHeight: 48 });
    this.load.image('lakeBackground', 'assets/backgrounds/fishingLake.png'); // New lake scene
    this.load.json('fishingLakeMap', 'assets/maps/fishingLake.json');
  }

  create() {
    const zoneData = zoneList.find(z => z.name === "fishingLake");
    this.currentZone = zoneData.name;
    this.playerStats = this.playerStats || { currentZone: this.currentZone, hunger: 50, health: 50 };

    // Background setup
    this.background = this.add.image(0, 0, 'lakeBackground').setOrigin(0, 0).setScale(SCALES.BG_SCALE);
    this.physics.world.setBounds(0, 0, this.background.displayWidth, this.background.displayHeight);
    this.cameras.main.setBounds(0, 0, this.background.displayWidth, this.background.displayHeight);

    this.obstacles = this.physics.add.staticGroup();

    // Load map data
    const lakeMapData = this.cache.json.get('fishingLakeMap');
    if (lakeMapData && lakeMapData.layers) {
      lakeMapData.layers.forEach(layer => {
        if (layer.type === "objectgroup" && layer.name === "Object Layer 1") {
          layer.objects.forEach(obj => {
            const rect = this.add.rectangle(
              obj.x * SCALES.BG_SCALE,
              obj.y * SCALES.BG_SCALE,
              obj.width * SCALES.BG_SCALE,
              obj.height * SCALES.BG_SCALE,
              0xff0000,
              0
            );
            rect.setOrigin(0, 0);
            this.physics.add.existing(rect, true);
            this.obstacles.add(rect);
          });
        }
      });
    }

    // Player setup
    this.player = this.physics.add.sprite(50 * SCALES.BG_SCALE, 60 * SCALES.BG_SCALE, 'player');
    this.player.setScale(SCALES.PLAYER_SCALE * 0.5);
    this.player.setCollideWorldBounds(true);
    this.player.setDepth(2000);
    this.physics.add.collider(this.player, this.obstacles);

    // Animations
    this.anims.create({
      key: 'walk-down',
      frames: this.anims.generateFrameNumbers('player', { start: 0, end: 7 }),
      frameRate: 10,
      repeat: -1
    });

    // Move player to fishing spot
    this.anims.play('walk-down', true);
    this.tweens.add({
      targets: this.player,
      x: 100 * SCALES.BG_SCALE, // Near lake edge
      y: 70 * SCALES.BG_SCALE,
      duration: 2000,
      onComplete: () => {
        this.player.anims.stop();
        this.player.setFrame(0);
        this.showCastingPrompt();
      }
    });

    this.keys = this.input.keyboard.addKeys({
      interact: Phaser.Input.Keyboard.KeyCodes.I,
      space: Phaser.Input.Keyboard.KeyCodes.SPACE,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D
    });

    this.narrativeScreen = SCREEN_STATES.NONE;
  }

  update() {
    if (this.narrativeScreen === SCREEN_STATES.FISHING + 1) {
      if (Phaser.Input.Keyboard.JustDown(this.keys.space)) {
        this.handleCast();
      }
    } else if (this.narrativeScreen === SCREEN_STATES.FISHING + 2) {
      if (this.keys.left.isDown || this.keys.right.isDown) {
        this.reelProgress += 0.5;
        if (this.reelProgress >= 100) {
          this.catchFish();
        }
      }
      this.reelTimer -= this.game.loop.delta / 1000;
      if (this.reelTimer <= 0) {
        this.failReel();
      }

      this.progressBar.clear();
      this.progressBar.fillStyle(0x00ff00, 1);
      this.progressBar.fillRect(300, 500, this.reelProgress * 2, 20);
    }
  }

  showCastingPrompt() {
    this.narrativeScreen = SCREEN_STATES.FISHING + 1;
    this.showDialog("Press SPACE to cast your line into the lake.");
  }

  handleCast() {
    this.hideDialog();
    this.narrativeScreen = SCREEN_STATES.FISHING + 2;
    this.reelProgress = 0;
    this.reelTimer = 10;
    this.showDialog("You’ve got a bite! Press LEFT and RIGHT rapidly to reel in!");

    this.progressBar = this.add.graphics();
    this.progressBar.lineStyle(2, 0xffffff, 1);
    this.progressBar.strokeRect(300, 500, 200, 20);
    this.progressBar.setScrollFactor(0);
    this.progressBar.setDepth(1001);
  }

  catchFish() {
    this.hideDialog();
    this.progressBar.destroy();
    this.narrativeScreen = SCREEN_STATES.NONE;
    Utils.addToInventory(this, "Fish", 1);
    this.playerStats.hunger = Math.min(this.playerStats.hunger + 5, 100);
    this.playerStats.health = Math.min(this.playerStats.health + 3, 100);
    this.showDialog("You caught a Fish! (+5 Hunger, +3 Health)\nPress I to exit.");
    this.setupExit();
  }

  failReel() {
    this.hideDialog();
    this.progressBar.destroy();
    this.narrativeScreen = SCREEN_STATES.NONE;
    this.showDialog("The fish got away...\nPress I to exit.");
    this.setupExit();
  }

  setupExit() {
    this.input.keyboard.once("keydown-I", () => {
      this.scene.start("MainScene", { playerStats: this.playerStats });
    });
  }

  showDialog(text) {
    const boxW = 220, boxH = 150;
    const boxX = (this.game.config.width - boxW) / 2;
    const boxY = (this.game.config.height - boxH) / 2;
    this.dialogBg = this.add.graphics();
    this.dialogBg.setDepth(1000);
    this.dialogBg.fillStyle(0x000000, 0.8);
    this.dialogBg.fillRect(boxX, boxY, boxW, boxH);
    this.dialogText = this.add.text(boxX + 10, boxY + 10, text, {
      font: "12px Arial",
      fill: "#ffffff",
      wordWrap: { width: 200 }
    });
    this.dialogText.setDepth(1001);
    this.dialogBg.setScrollFactor(0);
    this.dialogText.setScrollFactor(0);
  }

  hideDialog() {
    if (this.dialogBg) this.dialogBg.destroy();
    if (this.dialogText) this.dialogText.destroy();
  }
}