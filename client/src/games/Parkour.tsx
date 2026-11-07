import { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import { NEON, type GameProps } from './types';

const WORLD_WIDTH = 7200;
const GROUND_Y = 760;

class ParkourScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Image;
  private platforms!: Phaser.Physics.Arcade.StaticGroup;
  private shards!: Phaser.Physics.Arcade.Group;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private hud!: Phaser.GameObjects.Text;
  private collected = 0;
  private totalShards = 0;
  private deaths = 0;
  private elapsed = 0;
  private checkpoint = { x: 80, y: GROUND_Y - 80 };
  private finished = false;
  private finishX = 0;

  constructor(private finish: (result: { score: number; meta: string }) => void) {
    super('parkour');
  }

  create() {
    this.physics.world.setBounds(0, 0, WORLD_WIDTH, 1100);
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, 1100);
    this.cameras.main.setBackgroundColor('#070417');

    const sky = this.add.graphics();
    for (let i = 0; i < 12; i += 1) {
      sky.fillStyle(0x1a1258, 0.14 + i * 0.02);
      sky.fillRect(0, 0, WORLD_WIDTH, 900 - i * 40);
    }
    sky.setScrollFactor(0.2).setDepth(-20);

    const stars = this.add.graphics().setScrollFactor(0.35).setDepth(-19);
    stars.fillStyle(0xf5f3ff, 0.7);
    for (let i = 0; i < 240; i += 1) {
      stars.fillCircle(Math.random() * 1600, Math.random() * 420, Math.random() * 1.7);
    }

    const graphics = this.add.graphics();
    graphics.fillStyle(NEON.cyan, 1);
    graphics.fillRoundedRect(4, 4, 26, 38, 7);
    graphics.fillStyle(NEON.white, 1);
    graphics.fillRoundedRect(11, 12, 12, 9, 3);
    graphics.generateTexture('runner', 34, 46);
    graphics.clear();
    graphics.fillStyle(NEON.amber, 1);
    graphics.fillTriangle(10, 0, 20, 16, 0, 16);
    graphics.generateTexture('shard', 20, 18);
    graphics.destroy();

    this.platforms = this.physics.add.staticGroup();
    this.shards = this.physics.add.group();

    /* ground start pad */
    this.addPlatform(0, GROUND_Y, 520, 60, NEON.violet);

    let x = 560;
    let y = GROUND_Y - 20;
    for (let i = 0; i < 46; i += 1) {
      const width = Phaser.Math.Between(110, 240);
      const rise = Phaser.Math.Between(-90, 110);
      y = Phaser.Math.Clamp(y + rise, 320, GROUND_Y);
      this.addPlatform(x, y, width, 26, i % 4 === 0 ? NEON.magenta : NEON.violet);
      if (i % 3 === 0) {
        const shard = this.shards.create(x + width / 2, y - 70, 'shard') as Phaser.Physics.Arcade.Image;
        shard.setDepth(4);
        this.totalShards += 1;
      }
      x += width + Phaser.Math.Between(90, 190);
    }
    this.finishX = x + 120;
    this.addPlatform(x, y, 320, 40, NEON.cyan);
    this.add.text(x + 60, y - 96, 'FINISH', {
      fontFamily: 'ui-sans-serif, system-ui',
      fontSize: '28px',
      color: '#22d3ee',
      fontStyle: 'bold',
    });

    this.player = this.physics.add.image(this.checkpoint.x, this.checkpoint.y, 'runner');
    this.player.setCollideWorldBounds(true).setDepth(6);
    (this.player.body as Phaser.Physics.Arcade.Body).setSize(24, 40);
    this.physics.add.collider(this.player, this.platforms);
    this.physics.add.overlap(this.player, this.shards, (_player, shard) => {
      const item = shard as Phaser.Physics.Arcade.Image;
      if (!item.active) return;
      this.collected += 1;
      this.tweens.add({ targets: item, y: item.y - 26, alpha: 0, duration: 220, onComplete: () => item.destroy() });
    });

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.keys = this.input.keyboard!.addKeys('W,A,D,SPACE') as Record<string, Phaser.Input.Keyboard.Key>;
    this.input.on('pointerdown', () => this.jump());

    this.hud = this.add
      .text(16, 14, '', { fontFamily: 'ui-sans-serif, system-ui', fontSize: '15px', color: '#f5f3ff' })
      .setScrollFactor(0)
      .setDepth(20);

    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);
    this.cameras.main.setDeadzone(120, 90);
    this.cameras.main.fadeIn(350, 5, 3, 15);
  }

  private addPlatform(x: number, y: number, width: number, height: number, color: number) {
    const platform = this.platforms.create(x + width / 2, y, '') as Phaser.Physics.Arcade.Image;
    platform.setVisible(false);
    platform.setSize(width, height);
    platform.refreshBody();
    const visual = this.add.graphics();
    visual.fillStyle(0x120d33, 1);
    visual.fillRoundedRect(x, y - height / 2, width, height, 8);
    visual.lineStyle(2, color, 0.9);
    visual.strokeRoundedRect(x, y - height / 2, width, height, 8);
    visual.fillStyle(color, 0.35);
    visual.fillRect(x + 6, y - height / 2 - 3, width - 12, 3);
    return platform;
  }

  private jump() {
    if (this.finished) return;
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    if (body.blocked.down || body.touching.down) {
      this.player.setVelocityY(-720);
      this.cameras.main.flash(60, 34, 211, 238);
    }
  }

  update(_time: number, delta: number) {
    if (this.finished) return;
    const seconds = delta / 1000;
    this.elapsed += seconds;

    const left = this.cursors.left?.isDown || this.keys.A?.isDown;
    const right = this.cursors.right?.isDown || this.keys.D?.isDown;
    const jump = this.cursors.up?.isDown || this.keys.W?.isDown || this.keys.SPACE?.isDown;

    if (left) this.player.setVelocityX(-330);
    else if (right) this.player.setVelocityX(330);
    else this.player.setVelocityX(this.player.body!.velocity.x * 0.82);

    if (jump) this.jump();

    if (this.player.y > 1080) {
      this.deaths += 1;
      this.player.setPosition(this.checkpoint.x, this.checkpoint.y);
      this.player.setVelocity(0, 0);
      this.cameras.main.shake(180, 0.008);
    }

    /* checkpoint every ~1400px of progress */
    const progress = Math.floor(this.player.x / 1400);
    if (progress > Math.floor(this.checkpoint.x / 1400) && this.player.y < GROUND_Y + 40) {
      this.checkpoint = { x: this.player.x, y: this.player.y - 40 };
    }

    this.hud.setText(
      `SHARDS ${this.collected}/${this.totalShards}   TIME ${this.elapsed.toFixed(1)}s   FALLS ${this.deaths}\nA/D or ← → to run · SPACE / tap to jump`,
    );

    if (this.player.x > this.finishX && !this.finished) {
      this.finished = true;
      const score = Math.max(0, this.collected * 150 + Math.round(Math.max(0, 9000 - this.elapsed * 45)) - this.deaths * 150);
      this.finish({
        score,
        meta: `${this.collected}/${this.totalShards} shards · ${this.elapsed.toFixed(1)}s · ${this.deaths} falls`,
      });
    }
  }
}

export default function Parkour({ paused, onFinish }: GameProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);

  useEffect(() => {
    const game = gameRef.current;
    if (!game) return;
    if (paused) game.scene.pause('parkour');
    else game.scene.resume('parkour');
  }, [paused]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: mount,
      width: mount.clientWidth || 900,
      height: mount.clientHeight || 600,
      backgroundColor: '#070417',
      physics: { default: 'arcade', arcade: { gravity: { x: 0, y: 1500 }, debug: false } },
      scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
      scene: [new ParkourScene(onFinish)],
      audio: { noAudio: true },
    });
    gameRef.current = game;
    return () => {
      game.destroy(true);
      gameRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={mountRef} className="h-full w-full" data-testid="parkour-canvas" />;
}
