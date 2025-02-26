class VillageCommons extends Phaser.Scene {
    // Same as above
  }
  
  const config = {
    type: Phaser.AUTO,
    width: 800,
    height: 600,
    physics: {
      default: 'arcade',
      arcade: { debug: false }
    },
    scene: [VillageCommons]
  };
  
  const game = new Phaser.Game(config);