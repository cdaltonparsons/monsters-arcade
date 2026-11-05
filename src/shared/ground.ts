import Phaser from 'phaser';

/** A grassy field, plus world edges that stop the hero and the camera. */
export function drawGrass(scene: Phaser.Scene, width: number, height: number): void {
  scene.physics.world.setBounds(0, 0, width, height);
  // The world is bigger than the screen, so the camera has to know where it ends.
  scene.cameras.main.setBounds(0, 0, width, height);
  scene.add.rectangle(width / 2, height / 2, width, height, 0x8fd46f).setDepth(-3);

  for (let i = 0; i < (width * height) / 136000; i++) {
    const x = Phaser.Math.Between(0, width);
    const y = Phaser.Math.Between(0, height);
    scene.add.ellipse(x, y, Phaser.Math.Between(160, 420), Phaser.Math.Between(90, 200), 0x83cb64).setDepth(-2);
  }
  for (let i = 0; i < (width * height) / 63000; i++) {
    const x = Phaser.Math.Between(0, width);
    const y = Phaser.Math.Between(0, height);
    scene.add.image(x, y, 'scenery-flower').setScale(Phaser.Math.FloatBetween(0.5, 1)).setDepth(-1);
  }
}
