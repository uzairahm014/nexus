import { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import { NEON, type GameProps } from './types';

const PATH: Array<[number, number]> = [
  [40, 300],
  [230, 300],
  [230, 150],
  [500, 150],
  [500, 450],
  [760, 450],
  [760, 250],
  [940, 250],
];

const SLOTS: Array<[number, number]> = [
  [150, 200], [150, 400], [320, 60], [320, 260], [410, 240], [610, 260],
  [610, 540], [690, 120], [860, 160], [860, 360],
];

interface Tower {
  x: number;
  y: number;
  level: number;
  range: number;
  cooldown: number;
  shape: Phaser.GameObjects.Arc;
}

interface Enemy {
  shape: Phaser.GameObjects.Arc;
  hp: number;
  maxHp: number;
  speed: number;
  segment: number;
  progress: number;
  reward: number;
}

class TowerScene extends Phaser.Scene {
  private enemies: Enemy[] = [];
  private towers: Tower[] = [];
  private credits = 160;
  private lives = 20;
  private wave = 0;
  private maxWaves = 10;
  private waveTimer = 0;
  private spawnLeft = 0;
  private spawnClock = 0;
  private elapsed = 0;
  private finished = false;
  private hud!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;
  private layer!: Phaser.GameObjects.Graphics;
  private enemyLayer!: Phaser.GameObjects.Graphics;
  private slotMarks: Phaser.GameObjects.Arc[] = [];

  constructor(private finish: (result: { score: number; meta: string }) => void) {
    super('tower');
  }

  create() {
    this.cameras.main.setBackgroundColor('#05030f');
    const { width, height } = this.scale;

    const floor = this.add.graphics();
    floor.fillStyle(0x0b0722, 1).fillRect(0, 0, width, height);
    floor.lineStyle(1, 0x1f1750, 0.8);
    for (let x = 0; x < width; x += 48) floor.lineBetween(x, 0, x, height);
    for (let y = 0; y < height; y += 48) floor.lineBetween(0, y, width, y);

    const path = this.add.graphics();
    path.lineStyle(52, 0x241a63, 1);
    path.beginPath();
    path.moveTo(PATH[0][0], PATH[0][1]);
    PATH.slice(1).forEach(([x, y]) => path.lineTo(x, y));
    path.strokePath();
    path.lineStyle(4, NEON.violet, 0.9);
    path.beginPath();
    path.moveTo(PATH[0][0], PATH[0][1]);
    PATH.slice(1).forEach(([x, y]) => path.lineTo(x, y));
    path.strokePath();

    SLOTS.forEach(([x, y]) => {
      const mark = this.add.circle(x, y, 20, 0x120d33).setStrokeStyle(2, NEON.cyan, 0.55).setInteractive({ useHandCursor: true });
      mark.on('pointerdown', () => this.build(x, y));
      this.slotMarks.push(mark);
    });

    this.layer = this.add.graphics().setDepth(6);
    this.enemyLayer = this.add.graphics().setDepth(7);

    this.hud = this.add
      .text(14, 12, '', { fontFamily: 'ui-sans-serif, system-ui', fontSize: '15px', color: '#f5f3ff' })
      .setDepth(20);
    this.hint = this.add
      .text(14, height - 34, 'Tap a node to build (60) · tap a tower to upgrade (80)', {
        fontFamily: 'ui-sans-serif, system-ui',
        fontSize: '12px',
        color: '#a5a3c9',
      })
      .setDepth(20);

    this.scale.on('resize', () => this.layout());
    this.startWave();
  }

  private layout() {
    this.hint.setY(this.scale.height - 34);
  }

  private build(x: number, y: number) {
    if (this.finished) return;
    const existing = this.towers.find((tower) => tower.x === x && tower.y === y);
    if (existing) {
      if (this.credits < 80) {
        this.flashHint('Not enough credits to upgrade');
        return;
      }
      this.credits -= 80;
      existing.level += 1;
      existing.range += 22;
      existing.shape.setScale(1 + existing.level * 0.16);
      this.flashHint(`Tower upgraded to level ${existing.level}`);
      return;
    }
    if (this.credits < 60) {
      this.flashHint('Not enough credits to build');
      return;
    }
    this.credits -= 60;
    const shape = this.add.circle(x, y, 14, NEON.cyan).setStrokeStyle(3, NEON.white, 0.85).setDepth(5);
    this.towers.push({ x, y, level: 1, range: 132, cooldown: 0, shape });
    this.flashHint('Tower online');
  }

  private flashHint(text: string) {
    this.hint.setText(text);
    this.time.delayedCall(1600, () => this.hint.setText('Tap a node to build (60) · tap a tower to upgrade (80)'));
  }

  private startWave() {
    this.wave += 1;
    if (this.wave > this.maxWaves) return;
    this.spawnLeft = 4 + this.wave * 2;
    this.spawnClock = 0;
    this.waveTimer = 0;
    this.flashHint(`Wave ${this.wave} incoming`);
  }

  private spawnEnemy() {
    const boss = this.wave % 5 === 0 && this.spawnLeft === 1;
    const hp = Math.round((26 + this.wave * 14) * (boss ? 6 : 1));
    const shape = this.add
      .circle(PATH[0][0], PATH[0][1], boss ? 15 : 10, boss ? NEON.magenta : NEON.rose)
      .setStrokeStyle(2, NEON.white, 0.5)
      .setDepth(8);
    this.enemies.push({
      shape,
      hp,
      maxHp: hp,
      speed: (boss ? 46 : 68) + this.wave * 2,
      segment: 0,
      progress: 0,
      reward: boss ? 70 : 14,
    });
    this.spawnLeft -= 1;
  }

  private damageEnemy(enemy: Enemy, damage: number) {
    enemy.hp -= damage;
    if (enemy.hp > 0) return;
    enemy.shape.destroy();
    this.enemies = this.enemies.filter((item) => item !== enemy);
    this.credits += enemy.reward;
  }

  update(_time: number, delta: number) {
    if (this.finished) return;
    const seconds = delta / 1000;
    this.elapsed += seconds;
    this.waveTimer += seconds;

    /* waves */
    if (this.spawnLeft > 0) {
      this.spawnClock += seconds;
      if (this.spawnClock > 0.85) {
        this.spawnClock = 0;
        this.spawnEnemy();
      }
    } else if (this.enemies.length === 0) {
      if (this.wave >= this.maxWaves) {
        this.finished = true;
        const score = this.wave * 1000 + this.credits + this.lives * 200;
        this.finish({ score, meta: `${this.maxWaves} waves cleared · ${this.lives} lives left` });
        return;
      }
      if (this.waveTimer > 2.4) this.startWave();
    }

    /* enemies walk the path */
    this.enemies.forEach((enemy) => {
      const from = PATH[enemy.segment];
      const to = PATH[enemy.segment + 1];
      if (!to) {
        this.lives -= 1;
        enemy.shape.destroy();
        this.enemies = this.enemies.filter((item) => item !== enemy);
        this.cameras.main.flash(120, 244, 63, 94);
        return;
      }
      const length = Phaser.Math.Distance.Between(from[0], from[1], to[0], to[1]);
      enemy.progress += (enemy.speed * seconds) / length;
      if (enemy.progress >= 1) {
        enemy.progress = 0;
        enemy.segment += 1;
      }
      const target = PATH[enemy.segment + 1] ?? to;
      const x = Phaser.Math.Linear(from[0], target[0], enemy.progress);
      const y = Phaser.Math.Linear(from[1], target[1], enemy.progress);
      enemy.shape.setPosition(x, y);
    });

    /* towers fire */
    this.towers.forEach((tower) => {
      tower.cooldown -= seconds;
      if (tower.cooldown > 0) return;
      const inRange = this.enemies
        .map((enemy) => ({ enemy, distance: Phaser.Math.Distance.Between(tower.x, tower.y, enemy.shape.x, enemy.shape.y) }))
        .filter((entry) => entry.distance <= tower.range)
        .sort((a, b) => a.distance - b.distance);
      if (inRange.length === 0) return;
      tower.cooldown = Math.max(0.22, 0.8 - tower.level * 0.12);
      this.damageEnemy(inRange[0].enemy, 12 + tower.level * 7);
    });

    this.layer.clear();
    this.towers.forEach((tower) => {
      this.layer.lineStyle(1, NEON.cyan, 0.28).strokeCircle(tower.x, tower.y, tower.range);
    });
    this.enemyLayer.clear();
    this.enemies.forEach((enemy) => {
      const pct = Math.max(0, enemy.hp / enemy.maxHp);
      this.enemyLayer.fillStyle(0x1a1258, 1).fillRect(enemy.shape.x - 14, enemy.shape.y - 22, 28, 4);
      this.enemyLayer.fillStyle(pct > 0.4 ? NEON.cyan : NEON.amber, 1).fillRect(enemy.shape.x - 14, enemy.shape.y - 22, 28 * pct, 4);
    });

    this.hud.setText(
      `WAVE ${this.wave}/${this.maxWaves}   LIVES ${this.lives}   CREDITS ${this.credits}   TOWERS ${this.towers.length}`,
    );

    if (this.lives <= 0 && !this.finished) {
      this.finished = true;
      const score = this.wave * 600 + this.credits + Math.max(0, this.lives) * 100;
      this.finish({ score, meta: `Held to wave ${this.wave}` });
    }
  }
}

export default function TowerDefence({ paused, onFinish }: GameProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);

  useEffect(() => {
    const game = gameRef.current;
    if (!game) return;
    if (paused) game.scene.pause('tower');
    else game.scene.resume('tower');
  }, [paused]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: mount,
      width: mount.clientWidth || 960,
      height: mount.clientHeight || 600,
      backgroundColor: '#05030f',
      scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH },
      scene: [new TowerScene(onFinish)],
      audio: { noAudio: true },
    });
    gameRef.current = game;
    return () => {
      game.destroy(true);
      gameRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={mountRef} className="h-full w-full" data-testid="tower-canvas" />;
}
