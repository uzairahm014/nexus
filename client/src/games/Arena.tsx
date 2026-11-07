import { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import { NEON, type GameProps } from './types';

interface Enemy extends Phaser.Physics.Arcade.Image {
  hp: number;
  speed: number;
  maxHp: number;
}

class ArenaScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Image;
  private enemies!: Phaser.Physics.Arcade.Group;
  private bullets!: Phaser.Physics.Arcade.Group;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private hud!: Phaser.GameObjects.Text;
  private healthBar!: Phaser.GameObjects.Graphics;
  private health = 100;
  private score = 0;
  private wave = 1;
  private elapsed = 0;
  private kills = 0;
  private nextShot = 0;
  private nextSpawn = 0;
  private nextWave = 20;
  private damageCooldown = 0;
  private joystick: { x: number; y: number; active: boolean } = { x: 0, y: 0, active: false };
  private joystickOrigin = { x: 0, y: 0 };
  private finished = false;

  constructor(private finish: (result: { score: number; meta: string }) => void) {
    super('arena');
  }

  create() {
    const { width, height } = this.scale;
    this.physics.world.setBounds(0, 0, 2200, 1600);
    this.cameras.main.setBounds(0, 0, 2200, 1600);
    this.cameras.main.setBackgroundColor('#05030f');

    /* grid floor */
    const grid = this.add.graphics();
    grid.lineStyle(1, 0x241a63, 0.55);
    for (let x = 0; x <= 2200; x += 80) grid.lineBetween(x, 0, x, 1600);
    for (let y = 0; y <= 1600; y += 80) grid.lineBetween(0, y, 2200, y);
    grid.setDepth(-10);

    /* arena ring */
    const ring = this.add.graphics();
    ring.lineStyle(4, NEON.violet, 0.8);
    ring.strokeCircle(1100, 800, 700);
    ring.lineStyle(1, NEON.cyan, 0.25);
    ring.strokeCircle(1100, 800, 500);
    ring.setDepth(-9);

    /* textures */
    const graphics = this.add.graphics();
    graphics.fillStyle(NEON.cyan, 1);
    graphics.fillCircle(20, 20, 16);
    graphics.fillStyle(NEON.white, 1);
    graphics.fillCircle(20, 20, 7);
    graphics.generateTexture('arena-ship', 40, 40);
    graphics.clear();
    graphics.fillStyle(NEON.magenta, 1);
    graphics.fillCircle(18, 18, 15);
    graphics.fillStyle(0x1a1258, 1);
    graphics.fillCircle(18, 18, 7);
    graphics.generateTexture('arena-enemy', 36, 36);
    graphics.clear();
    graphics.fillStyle(NEON.white, 1);
    graphics.fillCircle(5, 5, 4);
    graphics.generateTexture('arena-bullet', 10, 10);
    graphics.destroy();

    this.player = this.physics.add.image(1100, 800, 'arena-ship');
    this.player.setCollideWorldBounds(true).setDamping(true).setDrag(0.86).setDepth(5);

    this.enemies = this.physics.add.group();
    this.bullets = this.physics.add.group();

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.keys = this.input.keyboard!.addKeys('W,A,S,D,SPACE') as Record<string, Phaser.Input.Keyboard.Key>;

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.joystickOrigin = { x: pointer.x, y: pointer.y };
      this.joystick.active = true;
    });
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!this.joystick.active || !pointer.isDown) return;
      const dx = pointer.x - this.joystickOrigin.x;
      const dy = pointer.y - this.joystickOrigin.y;
      const length = Math.hypot(dx, dy) || 1;
      const capped = Math.min(length, 70) / 70;
      this.joystick.x = (dx / length) * capped;
      this.joystick.y = (dy / length) * capped;
    });
    this.input.on('pointerup', () => {
      this.joystick.active = false;
      this.joystick.x = 0;
      this.joystick.y = 0;
    });

    this.hud = this.add
      .text(16, 14, '', { fontFamily: 'ui-sans-serif, system-ui', fontSize: '15px', color: '#f5f3ff' })
      .setScrollFactor(0)
      .setDepth(20);
    this.healthBar = this.add.graphics().setScrollFactor(0).setDepth(20);

    this.cameras.main.startFollow(this.player, true, 0.09, 0.09);
    this.cameras.main.setZoom(Math.min(1.35, Math.max(0.85, width / 900)));
    this.physics.add.overlap(this.bullets, this.enemies, (bullet, enemy) => this.hitEnemy(bullet as Phaser.Physics.Arcade.Image, enemy as Enemy));
    this.cameras.main.fadeIn(400, 5, 3, 15);
    void height;
    this.spawnWave();
  }

  private spawnWave() {
    const count = 2 + this.wave;
    for (let i = 0; i < count; i += 1) {
      const angle = (i / count) * Math.PI * 2 + Math.random();
      const radius = 620;
      const enemy = this.enemies.create(
        Phaser.Math.Clamp(this.player.x + Math.cos(angle) * radius, 40, 2160),
        Phaser.Math.Clamp(this.player.y + Math.sin(angle) * radius, 40, 1560),
        'arena-enemy',
      ) as Enemy;
      enemy.maxHp = 20 + this.wave * 14;
      enemy.hp = enemy.maxHp;
      enemy.speed = 46 + this.wave * 9 + Math.random() * 20;
      enemy.setDepth(4);
    }
    this.nextSpawn = this.time.now + 1600;
  }

  private fire(time: number) {
    if (time < this.nextShot) return;
    const alive = this.enemies.getChildren() as Enemy[];
    let target: Enemy | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    alive.forEach((enemy) => {
      const distance = Phaser.Math.Distance.Between(this.player.x, this.player.y, enemy.x, enemy.y);
      if (distance < bestDistance) {
        bestDistance = distance;
        target = enemy;
      }
    });
    if (!target) return;
    const angle = Phaser.Math.Angle.Between(this.player.x, this.player.y, (target as Enemy).x, (target as Enemy).y);
    const bullet = this.bullets.create(this.player.x, this.player.y, 'arena-bullet') as Phaser.Physics.Arcade.Image;
    bullet.setDepth(6);
    this.physics.velocityFromRotation(angle, 760, (bullet.body as Phaser.Physics.Arcade.Body).velocity);
    this.time.delayedCall(1200, () => bullet.active && bullet.destroy());
    this.nextShot = time + 190;
  }

  private hitEnemy(bullet: Phaser.Physics.Arcade.Image, enemy: Enemy) {
    if (!bullet.active || !enemy.active) return;
    bullet.destroy();
    enemy.hp -= 18;
    enemy.setTint(0xffffff);
    this.time.delayedCall(60, () => enemy.active && enemy.clearTint());
    if (enemy.hp <= 0) {
      this.kills += 1;
      this.score += 120 + this.wave * 10;
      this.tweens.add({ targets: enemy, scale: 1.8, alpha: 0, duration: 180, onComplete: () => enemy.destroy() });
    }
  }

  update(time: number, delta: number) {
    if (this.finished) return;
    const seconds = delta / 1000;
    this.elapsed += seconds;
    this.damageCooldown = Math.max(0, this.damageCooldown - seconds);

    const speed = 320;
    let vx = 0;
    let vy = 0;
    if (this.cursors.left?.isDown || this.keys.A?.isDown) vx -= 1;
    if (this.cursors.right?.isDown || this.keys.D?.isDown) vx += 1;
    if (this.cursors.up?.isDown || this.keys.W?.isDown) vy -= 1;
    if (this.cursors.down?.isDown || this.keys.S?.isDown) vy += 1;
    if (this.joystick.active) {
      vx += this.joystick.x;
      vy += this.joystick.y;
    }
    const magnitude = Math.hypot(vx, vy);
    if (magnitude > 0) {
      this.player.setVelocity((vx / Math.max(1, magnitude)) * speed, (vy / Math.max(1, magnitude)) * speed);
      this.player.rotation = Math.atan2(vy, vx) + Math.PI / 2;
    }

    this.fire(time);

    /* enemies chase the player */
    (this.enemies.getChildren() as Enemy[]).forEach((enemy) => {
      if (!enemy.active) return;
      const angle = Phaser.Math.Angle.Between(enemy.x, enemy.y, this.player.x, this.player.y);
      this.physics.velocityFromRotation(angle, enemy.speed, (enemy.body as Phaser.Physics.Arcade.Body).velocity);
      if (Phaser.Math.Distance.Between(enemy.x, enemy.y, this.player.x, this.player.y) < 30 && this.damageCooldown === 0) {
        this.health -= 10;
        this.damageCooldown = 0.6;
        this.cameras.main.shake(120, 0.006);
        this.cameras.main.flash(90, 244, 63, 94);
        enemy.hp = 0;
        enemy.destroy();
      }
    });

    if (this.time.now > this.nextWave) {
      this.wave += 1;
      this.nextWave = this.time.now + 20000;
      this.score += 400;
      this.spawnWave();
    }

    this.hud.setText(
      `SCORE ${this.score}   WAVE ${this.wave}   KILLS ${this.kills}\n${this.health}% HULL   WASD / drag to move · auto-target`,
    );
    this.healthBar.clear();
    this.healthBar.fillStyle(0x1a1258, 0.9).fillRoundedRect(16, 58, 220, 10, 5);
    this.healthBar
      .fillStyle(this.health > 55 ? NEON.cyan : this.health > 25 ? NEON.amber : NEON.rose, 1)
      .fillRoundedRect(16, 58, Math.max(0, 220 * (this.health / 100)), 10, 5);

    if (this.health <= 0 && !this.finished) {
      this.finished = true;
      const finalScore = this.score + Math.floor(this.elapsed) * 5;
      this.cameras.main.shake(320, 0.02);
      this.finish({ score: finalScore, meta: `Wave ${this.wave} · ${this.kills} kills` });
    }
  }
}

export default function Arena({ paused, onFinish }: GameProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const pausedRef = useRef(paused);

  useEffect(() => {
    const game = gameRef.current;
    if (!game) return;
    pausedRef.current = paused;
    if (paused) game.scene.pause('arena');
    else game.scene.resume('arena');
  }, [paused]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: mount,
      width: mount.clientWidth || 900,
      height: mount.clientHeight || 600,
      backgroundColor: '#05030f',
      physics: { default: 'arcade', arcade: { gravity: { x: 0, y: 0 }, debug: false } },
      scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
      scene: [new ArenaScene(onFinish)],
      audio: { noAudio: true },
    });
    gameRef.current = game;
    return () => {
      game.destroy(true);
      gameRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={mountRef} className="h-full w-full" data-testid="arena-canvas" />;
}
