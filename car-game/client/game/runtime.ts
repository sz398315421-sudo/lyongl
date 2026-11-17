import * as pc from 'playcanvas';
import type { GameState, HudSnapshot, ItemKind, KartState, MatchState } from '../../shared/types';
import { createMatch, playerRank, playerRacer, stepMatch } from '../../game-core/match';
import { createTrack } from '../../game-core/track';
import { KART } from '../../game-core/config';
import { lerp, angleDifference } from '../../game-core/math';
import { buildScene, type SceneObjects } from './scene';
import { InputController } from './input';
import { TRACK_VISUAL_LAYOUT } from './track-layout';
import type { OnlineSession } from '../network/OnlineSession';

type KartPose = Pick<KartState, 'x' | 'z' | 'heading' | 'steering' | 'speed' | 'drifting' | 'driftDirection' | 'boostRemaining'>;

export class GameRuntime {
  readonly input: InputController;
  readonly track = createTrack();
  private match: MatchState = createMatch(this.track);
  private online: OnlineSession | null = null;
  private localRacerId = 'player';
  private racerAvatars: string[] = [];
  private app: pc.AppBase;
  private scene: SceneObjects;
  private accumulator = 0;
  private hudTimer = 0;
  private previous: KartPose[] = [];
  private lastItems: Array<ItemKind | null> = [];
  private useFxRemaining: number[] = [];
  private useFxKind: Array<ItemKind | null> = [];
  private paused = false;
  private hasFocus = true;
  private observer: ResizeObserver;
  private cameraReady = false;
  private disposed = false;
  private cameraPosition = new pc.Vec3();
  private cameraTarget = new pc.Vec3();
  private lookTarget = new pc.Vec3();
  private smoothedLookTarget = new pc.Vec3();

  constructor(private canvas: HTMLCanvasElement, private onSnapshot: (snapshot: HudSnapshot) => void) {
    const options = new pc.AppOptions();
    options.graphicsDevice = new pc.WebglGraphicsDevice(canvas, { alpha: false, antialias: true, powerPreference: 'high-performance' });
    options.componentSystems = [pc.CameraComponentSystem, pc.LightComponentSystem, pc.RenderComponentSystem];
    this.app = new pc.AppBase(canvas);
    this.app.init(options);
    this.input = new InputController();
    this.app.graphicsDevice.maxPixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
    this.app.setCanvasFillMode(pc.FILLMODE_NONE, canvas.parentElement!.clientWidth, canvas.parentElement!.clientHeight);
    this.app.setCanvasResolution(pc.RESOLUTION_AUTO);
    this.scene = buildScene(this.app, this.track);
    this.previous = this.match.racers.map(racer => this.pose(racer.kart));
    this.observer = new ResizeObserver(this.resize);
    this.observer.observe(canvas.parentElement!);
    this.resize();
    window.addEventListener('blur', this.onBlur);
    window.addEventListener('focus', this.onFocus);
    document.addEventListener('visibilitychange', this.onVisibility);
    this.app.on('update', this.update);
    this.app.start();
    this.emit();
  }

  private pose(kart: KartState): KartPose {
    return {
      x: kart.x, z: kart.z, heading: kart.heading, steering: kart.steering, speed: kart.speed,
      drifting: kart.drifting, driftDirection: kart.driftDirection, boostRemaining: kart.boostRemaining,
    };
  }

  private resize = () => {
    if (this.disposed) return;
    const parent = this.canvas.parentElement!;
    this.app.resizeCanvas(parent.clientWidth, parent.clientHeight);
    this.cameraReady = false;
  };
  private onBlur = () => { this.hasFocus = false; this.updatePaused(); };
  private onFocus = () => { this.hasFocus = true; this.updatePaused(); };
  private onVisibility = () => { this.updatePaused(); };
  private resetEffectMemory() {
    this.lastItems = this.match.racers.map(racer => racer.item);
    this.useFxRemaining = this.match.racers.map(() => 0);
    this.useFxKind = this.match.racers.map(() => null);
  }
  private captureItemEvents() {
    this.match.racers.forEach((racer, index) => {
      const previousItem = this.lastItems[index];
      if (previousItem && !racer.item) {
        this.useFxRemaining[index] = 0.72;
        this.useFxKind[index] = previousItem;
      }
      this.lastItems[index] = racer.item;
    });
  }
  private updatePaused() {
    this.paused = document.hidden || !this.hasFocus;
    this.accumulator = 0;
    this.input.clear();
    this.emit();
  }

  start = (avatar = 'default') => {
    this.online = null;
    this.localRacerId = 'player';
    this.match = createMatch(this.track, avatar || 'default', 'racing');
    this.previous = this.match.racers.map(racer => this.pose(racer.kart));
    this.resetEffectMemory();
    this.scene.setPlayerAvatar(avatar || 'default');
    this.scene.racers.forEach(racer => { racer.kart.enabled = true; });
    this.input.setActive(true);
    this.accumulator = 0;
    this.cameraReady = false;
    this.emit();
  };

  menu = (avatar = 'default') => {
    this.online = null;
    this.localRacerId = 'player';
    this.match = createMatch(this.track, avatar || 'default', 'menu');
    this.previous = this.match.racers.map(racer => this.pose(racer.kart));
    this.resetEffectMemory();
    this.scene.setPlayerAvatar(avatar || 'default');
    this.scene.racers.slice(1).forEach(racer => { racer.kart.enabled = false; });
    this.input.setActive(false);
    this.cameraReady = false;
    this.emit();
  };

  setPlayerAvatar = (avatar = 'default') => {
    this.scene.setPlayerAvatar(avatar || 'default');
  };

  startOnline = (session: OnlineSession): boolean => {
    const match = session.matchSnapshot();
    if (!match) return false;
    this.online = session;
    this.localRacerId = session.sessionId;
    this.match = match;
    this.previous = match.racers.map(racer => this.pose(racer.kart));
    this.resetEffectMemory();
    this.racerAvatars = [];
    this.syncRacerAvatars();
    this.scene.racers.forEach((racer, index) => { racer.kart.enabled = index < match.racers.length; });
    this.input.setActive(true);
    this.accumulator = 0;
    this.cameraReady = false;
    this.emit();
    return true;
  };

  private syncRacerAvatars() {
    this.match.racers.forEach((racer, index) => {
      if (this.racerAvatars[index] === racer.avatar) return;
      this.racerAvatars[index] = racer.avatar;
      this.scene.setRacerAvatar(index, racer.avatar, racer.name);
    });
  }

  // Keep the stage 01 diagnostic shape stable for existing browser tests.
  inspect = (): GameState => {
    const player = playerRacer(this.match, this.localRacerId);
    return structuredClone({ kart: player.kart, race: player.race });
  };

  inspectMatch = (): MatchState => structuredClone(this.match);

  inspectView = () => {
    const right = this.scene.camera.getWorldTransform().getX(new pc.Vec3());
    const playerIndex = Math.max(0, this.match.racers.findIndex(racer => racer.id === this.localRacerId));
    const playerVisual = this.scene.racers[playerIndex];
    const avatarTexture = playerVisual.avatarMaterial.diffuseMap;
    return {
      cameraRight: { x: right.x, y: right.y, z: right.z },
      avatarFaceCount: playerVisual.avatarFaceCount,
      avatarTextureSize: avatarTexture ? { width: avatarTexture.width, height: avatarTexture.height } : null,
    };
  };

  private update = (frameDt: number) => {
    if (this.disposed) return;
    const dt = Math.min(frameDt, 0.1);
    if (this.online) {
      if (this.match.phase === 'racing') this.online.tick(performance.now(), () => this.input.read());
      const next = this.online.matchSnapshot();
      if (next) {
        const resetBefore = playerRacer(this.match, this.localRacerId).kart.resetCount;
        this.match = next;
        this.previous = next.racers.map(racer => this.pose(racer.kart));
        this.syncRacerAvatars();
        if (resetBefore !== playerRacer(next, this.localRacerId).kart.resetCount) this.cameraReady = false;
        if (next.phase === 'finished') this.input.setActive(false);
      }
    } else if (!this.paused && this.match.phase === 'racing') {
      this.accumulator += dt;
      let steps = 0;
      while (this.accumulator >= KART.fixedDt && steps < KART.maxSteps) {
        this.previous = this.match.racers.map(racer => this.pose(racer.kart));
        const resetBefore = playerRacer(this.match).kart.resetCount;
        stepMatch(this.match, this.input.read(), this.track);
        this.accumulator -= KART.fixedDt;
        steps++;
        if (resetBefore !== playerRacer(this.match).kart.resetCount) this.cameraReady = false;
      }
      if (steps === KART.maxSteps) this.accumulator = 0;
      if (this.match.racers.every(racer => racer.race.phase === 'finished')) this.input.setActive(false);
    }
    this.captureItemEvents();
    this.draw(dt);
    this.hudTimer += dt;
    if (this.hudTimer >= 0.1) { this.hudTimer = 0; this.emit(); }
  };

  private draw(dt: number) {
    const player = playerRacer(this.match, this.localRacerId);
    const blend = this.online || this.paused || this.match.phase !== 'racing' ? 1 : this.accumulator / KART.fixedDt;
    this.match.racers.forEach((racer, index) => {
      const model = this.scene.racers[index];
      if (!model) return;
      this.useFxRemaining[index] = Math.max(0, (this.useFxRemaining[index] ?? 0) - dt);
      model.kart.enabled = this.match.phase !== 'menu' || index === 0;
      const previous = this.previous[index] ?? this.pose(racer.kart);
      const x = lerp(previous.x, racer.kart.x, blend);
      const z = lerp(previous.z, racer.kart.z, blend);
      const heading = previous.heading + angleDifference(racer.kart.heading, previous.heading) * blend;
      model.kart.setPosition(x, 0.1, z);
      model.kart.setEulerAngles(0, heading * pc.math.RAD_TO_DEG, 0);
      const lean = racer.kart.drifting ? racer.kart.driftDirection * 5 : racer.kart.steering * 1.5;
      const pitch = racer.kart.boostRemaining > 0 ? -2.2 : racer.kart.speed > 1 ? 0.8 : 0;
      model.body.setLocalEulerAngles(pitch, racer.kart.drifting ? -racer.kart.driftDirection * 2.5 : 0, lean);
      for (const axle of model.frontWheels) axle.setLocalEulerAngles(0, -racer.kart.steering * 18, 0);
      for (const wheel of model.wheels) if (!this.paused) wheel.rotateLocal(0, 0, racer.kart.speed * dt * 130);
      for (const spark of model.sparks) spark.enabled = racer.kart.boostRemaining > 0 || racer.kart.driftCharge >= KART.driftChargeTime;

      const itemKinds: ItemKind[] = ['paper-plane', 'glue', 'cardboard-shield', 'spring'];
      for (const itemKind of itemKinds) {
        const indicator = model.effects.itemIndicators[itemKind];
        indicator.enabled = this.match.phase === 'racing' && racer.kind === 'player' && racer.item === itemKind;
        if (indicator.enabled) indicator.rotateLocal(0, dt * 65, 0);
      }
      const shield = model.effects.shield;
      shield.enabled = this.match.phase === 'racing' && racer.shieldActive;
      if (shield.enabled) {
        shield.rotateLocal(0, dt * 38, 0);
        const pulse = 1.06 + Math.sin(this.match.elapsed * 8 + index) * 0.06;
        shield.setLocalScale(pulse, pulse, pulse);
      } else {
        shield.setLocalScale(1, 1, 1);
      }
      const rocket = model.effects.rocket;
      rocket.enabled = this.match.phase === 'racing' && racer.kart.boostRemaining > 0;
      if (rocket.enabled) {
        const pulse = 0.94 + Math.sin(this.match.elapsed * 34 + index) * 0.11;
        rocket.setLocalScale(1, pulse, 1 + Math.sin(this.match.elapsed * 22 + index) * 0.08);
      } else {
        rocket.setLocalScale(1, 1, 1);
      }
      const planeBurst = model.effects.planeBurst;
      planeBurst.enabled = this.useFxRemaining[index] > 0 && this.useFxKind[index] === 'paper-plane';
      if (planeBurst.enabled) {
        planeBurst.rotateLocal(0, dt * 160, 0);
        planeBurst.setLocalScale(1.1 + this.useFxRemaining[index] * 0.25, 1.1 + this.useFxRemaining[index] * 0.25, 1.1 + this.useFxRemaining[index] * 0.25);
      } else {
        planeBurst.setLocalScale(1, 1, 1);
      }
    });

    this.scene.itemBoxes.forEach((box, index) => {
      box.enabled = this.match.phase === 'racing' && this.match.itemBoxCooldowns[index] <= 0;
      if (box.enabled) box.rotateLocal(0, dt * 80, 0);
    });
    this.scene.glueTraps.forEach((trap, index) => {
      const active = this.match.glueTraps[index];
      trap.enabled = Boolean(active);
      if (active) {
        trap.setPosition(active.x, 0.19, active.z);
        trap.setEulerAngles(0, active.heading * pc.math.RAD_TO_DEG, 0);
        const pulse = 1 + Math.sin(this.match.elapsed * 7 + index) * 0.045;
        trap.setLocalScale(pulse, 1, pulse);
      } else {
        trap.setLocalScale(1, 1, 1);
      }
    });
    this.scene.gates.forEach((gate, index) => { gate.enabled = this.match.phase === 'racing' && index === player.race.nextCheckpoint; });

    const kart = player.kart;
    if (this.match.phase === 'menu') {
      const narrow = this.canvas.clientWidth < 760;
      const trayScale = TRACK_VISUAL_LAYOUT.trayWidth / 172;
      this.cameraTarget.set(narrow ? 150 : 132, (narrow ? 178 : 145) * trayScale, narrow ? 180 : 148);
      this.lookTarget.set(narrow ? 0 : -14, narrow ? 10 : 0, narrow ? 0 : 4);
      this.scene.camera.camera!.fov = narrow ? 62 : 50;
    } else {
      const portrait = this.canvas.clientWidth / this.canvas.clientHeight < 0.8;
      const distance = (portrait ? 11 : 8.5) + kart.speed * 0.045;
      this.cameraTarget.set(kart.x - Math.sin(kart.heading) * distance, portrait ? 7.2 : 5.8, kart.z - Math.cos(kart.heading) * distance);
      this.lookTarget.set(kart.x + Math.sin(kart.heading) * 5, 0.8, kart.z + Math.cos(kart.heading) * 5);
      this.scene.camera.camera!.fov = (portrait ? 62 : 57) + (kart.boostRemaining > 0 ? 4 : 0);
    }
    if (!this.cameraReady) {
      this.cameraPosition.copy(this.cameraTarget);
      this.smoothedLookTarget.copy(this.lookTarget);
      this.cameraReady = true;
    } else {
      this.cameraPosition.lerp(this.cameraPosition, this.cameraTarget, 1 - Math.exp(-7 * dt));
      this.smoothedLookTarget.lerp(this.smoothedLookTarget, this.lookTarget, 1 - Math.exp(-10 * dt));
    }
    this.scene.camera.setPosition(this.cameraPosition);
    this.scene.camera.lookAt(this.smoothedLookTarget);
  }

  private emit() {
    const player = playerRacer(this.match, this.localRacerId);
    this.onSnapshot({
      phase: this.match.phase === 'finished' ? 'finished' : this.match.phase === 'menu' ? 'menu' : 'racing',
      speed: Math.round(player.kart.speed * 3.6),
      lap: Math.min(3, player.race.completedLaps + 1),
      elapsed: player.race.elapsed,
      charge: player.kart.driftCharge / KART.driftChargeTime,
      boosting: player.kart.boostRemaining > 0,
      offTrack: player.kart.offTrackTime > 0,
      paused: this.paused && this.match.phase === 'racing',
      nextCheckpoint: player.race.nextCheckpoint,
      resetCount: player.kart.resetCount,
      rank: this.match.phase === 'menu' ? 1 : playerRank(this.match, this.track, this.localRacerId),
      totalRacers: this.match.racers.length,
      item: player.item,
      shieldActive: player.shieldActive,
      results: this.match.results,
    });
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.input.dispose();
    this.observer.disconnect();
    window.removeEventListener('blur', this.onBlur);
    window.removeEventListener('focus', this.onFocus);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.app.off('update', this.update);
    this.scene.dispose();
    this.app.destroy();
  }
}
