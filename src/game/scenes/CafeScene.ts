import Phaser from 'phaser';
import { archetypes, CHARACTER_ASSETS } from '../../data/catalog';
import { gameStore } from '../../store/gameStore';

export class CafeScene extends Phaser.Scene {
  private people = new Map<string, Phaser.GameObjects.Image>();
  private unsubscribe?: () => void;
  private receiptId = '';
  private owner?: Phaser.GameObjects.Image;
  private drinkVisual?: Phaser.GameObjects.Graphics;
  private drinkKey = '';
  constructor() {
    super('CafeScene');
  }
  preload() {
    this.load.image('interior', '/assets/backgrounds/cafe-interior.jpeg');
    this.load.image('owner', '/assets/characters/owner.png');
    archetypes.forEach((id) =>
      this.load.image(id, `/assets/characters/${CHARACTER_ASSETS[id]}.png`),
    );
  }
  create() {
    this.cameras.main.setBackgroundColor('#e7d6b6');
    if (this.textures.exists('interior'))
      this.add.image(640, 360, 'interior').setDisplaySize(1280, 720);
    const sunlight = this.add.graphics();
    sunlight.fillStyle(0xffe6a6, 0.06).fillTriangle(200, 0, 450, 720, 1100, 720);
    this.owner = this.add.image(370, 875, 'owner').setOrigin(0.5, 1).setDepth(5);
    this.owner.setScale(600 / this.owner.height);
    this.createCounter();
    const sync = () => this.sync();
    this.unsubscribe = gameStore.subscribe(sync);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.unsubscribe?.();
      this.people.clear();
    });
    this.sync();
  }
  private createCounter() {
    const g = this.add.graphics().setDepth(20);
    g.fillStyle(0x3e291c, 0.12).fillRoundedRect(143, 632, 1004, 65, 12);
    g.fillStyle(0x9f6e42).fillRoundedRect(138, 589, 1000, 145, 8);
    g.lineStyle(4, 0x65452e).strokeRoundedRect(138, 589, 1000, 145, 8);
    g.fillStyle(0xc08a53).fillRect(151, 615, 974, 99);
    for (let x = 171; x < 1125; x += 120) {
      g.lineStyle(2, 0x98683e, 0.6).lineBetween(x, 618, x, 714);
      g.lineStyle(1, 0xe1b17c, 0.4).lineBetween(x + 7, 620, x + 7, 714);
    }
    g.fillStyle(0xd6a570).fillRoundedRect(116, 568, 1046, 42, 10);
    g.lineStyle(4, 0x664732).strokeRoundedRect(116, 568, 1046, 42, 10);
    g.lineStyle(2, 0xf4d4a0).lineBetween(133, 578, 1143, 578);
    g.lineStyle(1, 0xa97b4d, 0.4).lineBetween(200, 592, 850, 590);
    // Modular foreground prop: a small espresso machine, no baked text.
    g.fillStyle(0x5c493b, 0.2).fillEllipse(208, 568, 150, 21);
    g.fillStyle(0xadb2a0).fillRoundedRect(153, 457, 131, 101, 12);
    g.lineStyle(3, 0x594436).strokeRoundedRect(153, 457, 131, 101, 12);
    g.fillStyle(0x596352).fillRoundedRect(168, 503, 104, 42, 5);
    g.fillStyle(0xd5d5b7).fillRoundedRect(149, 553, 140, 13, 4);
    g.fillStyle(0xf6e7c6).fillCircle(181, 481, 8).fillCircle(208, 481, 8);
    g.lineStyle(5, 0x604a38).lineBetween(237, 488, 253, 488);
    g.fillStyle(0xf8edd4).fillRoundedRect(198, 520, 25, 26, 4);
    // A plant at the other end of the counter.
    g.fillStyle(0xbc7653).fillRoundedRect(1048, 529, 47, 39, 5);
    g.lineStyle(3, 0x704d32).strokeRoundedRect(1048, 529, 47, 39, 5);
    g.lineStyle(4, 0x5a7143).lineBetween(1072, 535, 1070, 476);
    g.fillStyle(0x6f8453)
      .fillEllipse(1054, 503, 36, 18)
      .fillEllipse(1088, 487, 36, 19)
      .fillEllipse(1070, 470, 17, 30);
  }
  private sync() {
    const { session, panel, paused, reducedMotion, lastReceipt, selectedCustomerId } =
      gameStore.getState();
    const customers = [...(session?.day.customers ?? [])].sort(
      (a, b) => Number(b.id === selectedCustomerId) - Number(a.id === selectedCustomerId),
    );
    const featured = customers[0];
    const drinkKey =
      featured && ['preparing', 'ready'].includes(featured.service.stage)
        ? `${featured.id}-${featured.service.stage}`
        : '';
    if (drinkKey !== this.drinkKey) {
      if (this.drinkVisual) {
        this.tweens.killTweensOf(this.drinkVisual);
        this.drinkVisual.destroy();
      }
      this.drinkKey = drinkKey;
      if (drinkKey && featured) {
        const cup = this.add.graphics().setDepth(22);
        cup.fillStyle(0x5c493b, 0.12).fillEllipse(711, 567, 66, 12);
        cup
          .fillStyle(featured.service.stage === 'ready' ? 0xd9e7bc : 0xf5e7cb)
          .fillRoundedRect(693, 527, 36, 38, 5);
        cup.lineStyle(2, 0x705d3c).strokeRoundedRect(693, 527, 36, 38, 5);
        cup.fillStyle(0xf9f3df).fillRoundedRect(689, 523, 44, 7, 3);
        cup.fillStyle(0x8b9d6e).fillRoundedRect(692, 542, 38, 12, 2);
        if (featured.service.stage === 'preparing') {
          cup
            .lineStyle(2, 0xfff8dc, 0.85)
            .lineBetween(701, 514, 703, 502)
            .lineBetween(713, 516, 715, 499)
            .lineBetween(724, 514, 726, 505);
          if (!reducedMotion)
            this.tweens.add({ targets: cup, alpha: 0.55, duration: 650, yoyo: true, repeat: -1 });
        }
        this.drinkVisual = cup;
      } else this.drinkVisual = undefined;
    }
    const live = new Set(customers.map((c) => c.id));
    for (const [id, sprite] of this.people) {
      if (!live.has(id)) {
        this.people.delete(id);
        if (reducedMotion || panel) sprite.destroy();
        else
          this.tweens.add({
            targets: sprite,
            x: sprite.x + 70,
            alpha: 0,
            duration: 350,
            onComplete: () => sprite.destroy(),
          });
      }
    }
    customers.forEach((customer, index) => {
      const x = [710, 920, 1090][index];
      let sprite = this.people.get(customer.id);
      if (!sprite) {
        sprite = this.add
          .image(reducedMotion ? x : 1270, index === 0 ? 865 : 810, customer.archetype)
          .setOrigin(0.5, 1)
          .setDepth(10 - index);
        sprite
          .setScale((index === 0 ? 600 : 490) / sprite.height)
          .setInteractive({ useHandCursor: true });
        sprite.on('pointerdown', () => {
          const state = gameStore.getState();
          if (!state.panel) state.selectCustomer(customer.id);
        });
        this.people.set(customer.id, sprite);
        if (!reducedMotion)
          this.tweens.add({ targets: sprite, x, duration: 700, ease: 'Sine.easeOut' });
      } else {
        sprite.setDepth(10 - index).setScale((index === 0 ? 600 : 490) / sprite.height);
        if (!this.tweens.isTweening(sprite)) sprite.setX(x).setY(index === 0 ? 865 : 810);
      }
      sprite.setAlpha(index === 0 ? 1 : 0.85);
    });
    if (lastReceipt && lastReceipt.id !== this.receiptId) {
      this.receiptId = lastReceipt.id;
      if (!reducedMotion && !panel) {
        for (let i = 0; i < 7; i++) {
          const dot = this.add.circle(705 + (i - 3) * 12, 455, 4, 0xffefb8).setDepth(30);
          this.tweens.add({
            targets: dot,
            y: 365 + i * 5,
            x: dot.x + (i - 3) * 10,
            alpha: 0,
            duration: 650,
            onComplete: () => dot.destroy(),
          });
        }
      }
    }
    if (paused || panel) this.tweens.pauseAll();
    else this.tweens.resumeAll();
  }
}
