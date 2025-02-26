class VillageCommons extends Phaser.Scene {
  constructor() {
    super('VillageCommons');
  }

  preload() {
    this.load.spritesheet('player', 'assets/sprites/player.png', { frameWidth: 32, frameHeight: 32 });
    this.load.image('villageCommons', 'assets/backgrounds/villageCommons.png');
    this.load.json('villageCommonsMap', 'assets/maps/villageCommonsMap.json');
    this.load.image('exclamation', 'assets/sprites/exclamation.png');
  }

  create() {
    this.background = this.add.image(0, 0, 'villageCommons')
      .setOrigin(0, 0)
      .setScale(0.3);
    this.physics.world.setBounds(0, 0, this.background.displayWidth, this.background.displayHeight);
    this.cameras.main.setBounds(0, 0, this.background.displayWidth, this.background.displayHeight);

    this.obstacles = this.physics.add.staticGroup();
    this.interactionObjects = this.physics.add.group();

    const mapData = this.cache.json.get('villageCommonsMap');
    if (mapData && mapData.layers) {
      mapData.layers.forEach(layer => {
        if (layer.type === "objectgroup") {
          if (layer.name === "Object Layer 1") {
            const offsetX = layer.offsetx || 0;
            const offsetY = layer.offsety || 0;
            layer.objects.forEach(obj => {
              const rect = this.add.rectangle(
                (obj.x + offsetX) * 0.3,
                (obj.y + offsetY) * 0.3,
                obj.width * 0.3,
                obj.height * 0.3,
                0xff0000,
                0
              );
              rect.setOrigin(0, 0);
              this.physics.add.existing(rect, true);
              this.obstacles.add(rect);
            });
          } else if (layer.name.toLowerCase() === "interactions") {
            layer.objects.forEach(obj => {
              const interactiveObj = this.add.rectangle(
                obj.x * 0.3,
                obj.y * 0.3,
                obj.width * 0.3,
                obj.height * 0.3,
                0x00ff00,
                0
              );
              interactiveObj.setOrigin(0, 0);
              this.physics.add.existing(interactiveObj, true);
              interactiveObj.setInteractive();
              interactiveObj.objName = obj.name;

              const marker = this.add.image(
                interactiveObj.x + interactiveObj.width / 2,
                interactiveObj.y - 10,
                'exclamation'
              );
              marker.setDepth(500);

              interactiveObj.on('pointerdown', () => {
                const distance = Phaser.Math.Distance.Between(
                  this.player.x,
                  this.player.y,
                  interactiveObj.x,
                  interactiveObj.y
                );
                if (distance < 50) {
                  if (interactiveObj.objName === 'flower') {
                    this.add.text(
                      interactiveObj.x,
                      interactiveObj.y - 20,
                      '+1 Flower',
                      { fontSize: '12px', color: '#ffffff' }
                    ).setDepth(1001);
                  } else if (interactiveObj.objName === 'tree') {
                    this.add.text(
                      interactiveObj.x,
                      interactiveObj.y - 20,
                      'Tree inspected',
                      { fontSize: '12px', color: '#ffffff' }
                    ).setDepth(1001);
                  }
                }
              });
              this.interactionObjects.add(interactiveObj);
            });
          }
        }
      });
    }

    this.player = this.physics.add.sprite(100 * 0.3, 100 * 0.3, 'player');
    this.player.setScale(2.5 * 0.5);
    this.player.setCollideWorldBounds(true);
    this.player.setDepth(2000);
    this.physics.add.collider(this.player, this.obstacles);

    this.cameras.main.startFollow(this.player);
    this.cameras.main.setZoom(2);

    this.anims.create({
      key: 'walk-down',
      frames: this.anims.generateFrameNumbers('player', { start: 0, end: 5 }),
      frameRate: 10,
      repeat: -1
    });
    this.anims.create({
      key: 'walk-up',
      frames: this.anims.generateFrameNumbers('player', { start: 6, end: 11 }),
      frameRate: 10,
      repeat: -1
    });
    this.anims.create({
      key: 'walk-right',
      frames: this.anims.generateFrameNumbers('player', { start: 12, end: 17 }),
      frameRate: 10,
      repeat: -1
    });
    this.anims.create({
      key: 'walk-left',
      frames: this.anims.generateFrameNumbers('player', { start: 18, end: 23 }),
      frameRate: 10,
      repeat: -1
    });
    this.anims.create({
      key: 'attack',
      frames: this.anims.generateFrameNumbers('player', { start: 24, end: 29 }),
      frameRate: 15,
      repeat: 0
    });

    this.hudText = this.add.text(10, 10, 'Items: 0', {
      font: '16px Arial',
      fill: '#ffffff'
    });
    this.hudText.setScrollFactor(0);
    this.hudText.setDepth(1000);

    this.keys = this.input.keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      right: Phaser.Input.Keyboard.KeyCodes.D,
      interact: Phaser.Input.Keyboard.KeyCodes.I
    });
  }

  update() {
    const speed = 80;
    this.player.setVelocity(0);

    if (this.keys.left.isDown) {
      this.player.setVelocityX(-speed);
      this.player.anims.play('walk-left', true);
    } else if (this.keys.right.isDown) {
      this.player.setVelocityX(speed);
      this.player.anims.play('walk-right', true);
    } else if (this.keys.up.isDown) {
      this.player.setVelocityY(-speed);
      this.player.anims.play('walk-up', true);
    } else if (this.keys.down.isDown) {
      this.player.setVelocityY(speed);
      this.player.anims.play('walk-down', true);
    } else {
      this.player.anims.stop();
      this.player.setFrame(0);
    }

    if (Phaser.Input.Keyboard.JustDown(this.keys.interact)) {
      this.player.anims.play('attack', true);
    }

    this.hudText.setText('Items: 0');
  }
}