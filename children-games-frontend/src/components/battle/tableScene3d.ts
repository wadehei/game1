/**
 * 对战牌桌 3D 场景（UNO / 21点 / 比大小 共用渲染层，复用 ddz table3d 思路）
 * 桌面 + 对手位牌背扇 + 中央明牌 + 摸牌堆；快照驱动，低多边形纯色，pixelRatio ≤ 1.5
 * 卡面/牌背/名牌均为程序化 canvas 纹理（不上外部贴图模型）
 */
type THREE = typeof import('three');

import { MAX_PIXEL_RATIO } from '@/composables/use3dGuard';

export interface TableCardSpec {
  id: string;
  label: string;
  color: string; // CSS 色值
  textColor?: string;
}

export interface TableSeatSpec {
  seatId: number;
  name: string;
  cardCount: number;
  isTurn: boolean;
  /** 副标签（投注额/状态，如「投 20 · 已看」） */
  subLabel?: string;
  /** 座位灰化（如已弃牌） */
  dim?: boolean;
}

export interface TableSnapshot {
  seats: TableSeatSpec[]; // 对手（不含自己）
  centerCards: TableCardSpec[]; // 中央明牌
  deckCount: number; // 摸牌堆张数（0 隐藏堆叠）
  accentColor?: string; // 当前主色光环（UNO 当前颜色等）
}

export interface Table3dOptions {
  container: HTMLElement;
  getState: () => TableSnapshot;
}

const TABLE_R = 5.2; // 桌面半径

export class BattleTable3D {
  private scene: import('three').Scene;
  private camera: import('three').PerspectiveCamera;
  private renderer: import('three').WebGLRenderer;
  private container: HTMLElement;
  private getState: () => TableSnapshot;
  private animationFrameId: number | null = null;
  private boundHandleResize: () => void;

  private seatGroup: import('three').Group;
  private centerGroup: import('three').Group;
  private deckGroup: import('three').Group;
  private ringMesh: import('three').Mesh;
  private seatMeshes = new Map<number, import('three').Group>();
  private centerMeshes = new Map<string, import('three').Mesh>();
  private deckStack: import('three').Mesh[] = [];
  private lastDeckCount = -1;
  private lastCenterIds = '';
  private lastSeatSig = '';
  private lastSyncAt = 0;

  private readonly THREE: THREE;

  constructor(options: Table3dOptions, THREE: THREE) {
    this.container = options.container;
    this.getState = options.getState;
    this.THREE = THREE;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x2c3a4e);

    this.camera = new THREE.PerspectiveCamera(
      42,
      this.container.clientWidth / this.container.clientHeight,
      0.1,
      60
    );
    this.camera.position.set(0, 7.6, 8.2);
    this.camera.lookAt(0, 0.2, -0.6);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);

    this.setupLights();
    this.buildTable();

    this.seatGroup = new THREE.Group();
    this.centerGroup = new THREE.Group();
    this.deckGroup = new THREE.Group();
    this.ringMesh = this.buildAccentRing();
    this.scene.add(this.seatGroup, this.centerGroup, this.deckGroup, this.ringMesh);

    this.boundHandleResize = this.handleResize.bind(this);
    window.addEventListener('resize', this.boundHandleResize);
  }

  private setupLights(): void {
    const THREE = this.THREE;
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.62));

    const dir = new THREE.DirectionalLight(0xffffff, 0.75);
    dir.position.set(3, 10, 4);
    dir.castShadow = true;
    dir.shadow.mapSize.width = 1024;
    dir.shadow.mapSize.height = 1024;
    this.scene.add(dir);

    // 桌面上方吊灯氛围
    const lamp = new THREE.PointLight(0xffe8c2, 0.6, 22);
    lamp.position.set(0, 6, 0);
    this.scene.add(lamp);
  }

  private buildTable(): void {
    const THREE = this.THREE;
    // 呢面桌面（椭圆感：圆柱压 z 轴）
    const felt = new THREE.Mesh(
      new THREE.CylinderGeometry(TABLE_R, TABLE_R, 0.35, 36),
      new THREE.MeshStandardMaterial({ color: 0x1f6f43, roughness: 0.9 })
    );
    felt.scale.z = 0.78;
    felt.position.y = -0.18;
    felt.receiveShadow = true;
    this.scene.add(felt);

    // 外圈木边
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(TABLE_R + 0.12, 0.22, 10, 36),
      new THREE.MeshStandardMaterial({ color: 0x6b4426, roughness: 0.6 })
    );
    rim.rotation.x = Math.PI / 2;
    rim.scale.z = 0.78;
    rim.position.y = -0.05;
    this.scene.add(rim);

    // 地面（桌子影子落地）
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 40),
      new THREE.MeshStandardMaterial({ color: 0x223044, roughness: 1 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.2;
    floor.receiveShadow = true;
    this.scene.add(floor);
  }

  private buildAccentRing(): import('three').Mesh {
    const THREE = this.THREE;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(TABLE_R * 0.72, TABLE_R * 0.8, 36),
      new THREE.MeshBasicMaterial({
        color: 0xffd54f,
        transparent: true,
        opacity: 0.35,
        side: THREE.DoubleSide,
      })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.scale.z = 0.78;
    ring.position.y = 0.012;
    ring.visible = false;
    return ring;
  }

  // ── 程序化纹理 ──
  private makeCardFaceTexture(spec: TableCardSpec): import('three').CanvasTexture {
    const THREE = this.THREE;
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 180;
    const ctx = canvas.getContext('2d')!;
    const r = 14;
    // 圆角白底 + 内嵌色块（经典 UNO 式牌面）
    ctx.fillStyle = '#ffffff';
    this.roundRect(ctx, 0, 0, 128, 180, r);
    ctx.fill();
    ctx.fillStyle = spec.color;
    this.roundRect(ctx, 10, 10, 108, 160, r - 6);
    ctx.fill();
    // 中央椭圆白托 + 大字
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(64, 90, 42, 54, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = spec.textColor || '#ffffff';
    ctx.font = 'bold 44px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const label = spec.label.length > 4 ? spec.label.slice(0, 4) : spec.label;
    ctx.fillText(label, 64, 90);
    // 角标
    ctx.font = 'bold 20px Arial';
    ctx.fillText(label.slice(0, 2), 22, 24);
    ctx.save();
    ctx.translate(106, 156);
    ctx.rotate(Math.PI);
    ctx.fillText(label.slice(0, 2), 0, 0);
    ctx.restore();

    const texture = new THREE.CanvasTexture(canvas);
    texture.flipY = false;
    return texture;
  }

  private makeCardBackTexture(): import('three').CanvasTexture {
    const THREE = this.THREE;
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 180;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#34495e';
    this.roundRect(ctx, 0, 0, 128, 180, 14);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 3;
    this.roundRect(ctx, 8, 8, 112, 164, 10);
    ctx.stroke();
    // 斜纹
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
    ctx.lineWidth = 5;
    for (let i = -180; i < 220; i += 22) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + 180, 180);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.font = 'bold 26px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('★', 64, 96);

    const texture = new THREE.CanvasTexture(canvas);
    texture.flipY = false;
    return texture;
  }

  private makeNameTexture(
    name: string,
    active: boolean,
    subLabel: string,
    dim: boolean
  ): import('three').CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 84;
    const ctx = canvas.getContext('2d')!;
    ctx.globalAlpha = dim ? 0.55 : 1;
    ctx.fillStyle = active ? '#667eea' : 'rgba(30, 40, 60, 0.85)';
    this.roundRect(ctx, 0, 0, 256, 84, 16);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 28px Arial';
    const shown = name.length > 6 ? `${name.slice(0, 6)}…` : name;
    ctx.fillText(shown, 128, subLabel ? 26 : 42);
    if (subLabel) {
      ctx.font = '22px Arial';
      ctx.fillStyle = active ? '#ffe9b8' : 'rgba(255, 255, 255, 0.75)';
      const sub = subLabel.length > 12 ? `${subLabel.slice(0, 12)}…` : subLabel;
      ctx.fillText(sub, 128, 60);
    }
    const texture = new this.THREE.CanvasTexture(canvas);
    texture.flipY = false;
    return texture;
  }

  private roundRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number
  ): void {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  private makeCardMesh(spec: TableCardSpec | null): import('three').Mesh {
    const THREE = this.THREE;
    const geo = new THREE.BoxGeometry(0.92, 0.04, 1.3);
    let topMat: import('three').MeshStandardMaterial;
    if (spec) {
      topMat = new THREE.MeshStandardMaterial({
        map: this.makeCardFaceTexture(spec),
        roughness: 0.4,
      });
    } else {
      topMat = new THREE.MeshStandardMaterial({
        map: this.makeCardBackTexture(),
        roughness: 0.5,
      });
    }
    const sideMat = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.5 });
    const materials = [sideMat, sideMat, topMat, sideMat, sideMat, sideMat];
    const mesh = new THREE.Mesh(geo, materials);
    mesh.castShadow = true;
    return mesh;
  }

  private makeSeat(seat: TableSeatSpec): import('three').Group {
    const THREE = this.THREE;
    const group = new THREE.Group();

    // 名牌
    const namePlate = new THREE.Mesh(
      new THREE.PlaneGeometry(1.7, 0.56),
      new THREE.MeshBasicMaterial({
        map: this.makeNameTexture(seat.name, seat.isTurn, seat.subLabel || '', !!seat.dim),
        transparent: true,
      })
    );
    namePlate.position.set(0, 1.15, 0);
    group.add(namePlate);

    // 牌背扇形（按张数封顶 12 张显示）
    const shown = Math.min(seat.cardCount, 12);
    for (let i = 0; i < shown; i += 1) {
      const card = this.makeCardMesh(null);
      const spread = (i - (shown - 1) / 2) * 0.16;
      card.position.set(spread, 0.5 + i * 0.02, -Math.abs(spread) * 0.18);
      card.rotation.z = spread * 0.55;
      card.rotation.x = -0.35;
      group.add(card);
    }

    // 回合高亮光环（座位脚下）
    if (seat.isTurn) {
      const halo = new THREE.Mesh(
        new THREE.RingGeometry(0.9, 1.05, 24),
        new THREE.MeshBasicMaterial({
          color: 0xffd54f,
          transparent: true,
          opacity: 0.75,
          side: THREE.DoubleSide,
        })
      );
      halo.rotation.x = -Math.PI / 2;
      halo.position.y = 0.02;
      group.add(halo);
    }

    return group;
  }

  private seatPosition(index: number, total: number): { x: number; z: number; ry: number } {
    // 对手排坐在桌子对侧弧线（面向主玩家）
    const angle = (index / Math.max(total, 1)) * Math.PI - Math.PI / 2;
    const spreadAngle = angle * 0.72;
    return {
      x: Math.sin(spreadAngle) * (TABLE_R - 0.9) * 0.92,
      z: -Math.cos(spreadAngle) * (TABLE_R - 0.9) * 0.55 - 0.6,
      ry: 0,
    };
  }

  /** 每帧同步快照（diff 每 150ms 节流，动画与光环实时） */
  private sync(): void {
    const now = performance.now();
    if (now - this.lastSyncAt < 150) {
      return;
    }
    this.lastSyncAt = now;
    const state = this.getState();
    const centerIds = state.centerCards.map((c) => c.id).join('|');

    // 座位：增删重建（座位数低频变化），回合态变化只换光环/名牌
    const seatSig = state.seats
      .map((s) => `${s.seatId}:${s.cardCount}:${s.isTurn ? 1 : 0}`)
      .join('|');
    if (this.seatMeshes.size !== state.seats.length || this.lastSeatSig !== seatSig) {
      this.lastSeatSig = seatSig;
      for (const [, g] of this.seatMeshes) this.disposeGroup(g);
      this.seatMeshes.clear();
      this.seatGroup.clear();
      state.seats.forEach((seat, i) => {
        const g = this.makeSeat(seat);
        const pos = this.seatPosition(i, state.seats.length);
        g.position.set(pos.x, 0, pos.z);
        this.seatGroup.add(g);
        this.seatMeshes.set(seat.seatId, g);
      });
    }

    // 中央明牌
    if (centerIds !== this.lastCenterIds) {
      this.lastCenterIds = centerIds;
      for (const [, m] of this.centerMeshes) this.disposeMesh(m);
      this.centerMeshes.clear();
      this.centerGroup.clear();
      state.centerCards.forEach((spec, i) => {
        const mesh = this.makeCardMesh(spec);
        const spread = (i - (state.centerCards.length - 1) / 2) * 1.15;
        mesh.position.set(spread, 0.12, 0.3);
        mesh.rotation.y = spread * 0.22 + (Math.random() - 0.5) * 0.14;
        this.centerGroup.add(mesh);
        this.centerMeshes.set(spec.id, mesh);
      });
    }

    // 摸牌堆
    if (state.deckCount !== this.lastDeckCount) {
      this.lastDeckCount = state.deckCount;
      for (const m of this.deckStack) this.disposeMesh(m);
      this.deckStack = [];
      this.deckGroup.clear();
      if (state.deckCount > 0) {
        const layers = Math.min(Math.ceil(state.deckCount / 8), 7);
        for (let i = 0; i < layers; i += 1) {
          const mesh = this.makeCardMesh(null);
          mesh.position.set(TABLE_R - 1.5, 0.08 + i * 0.055, 0.6);
          mesh.rotation.y = Math.PI * 0.06 * (i % 2 === 0 ? 1 : -1);
          this.deckGroup.add(mesh);
          this.deckStack.push(mesh);
        }
      }
    }

    // 主色光环
    if (state.accentColor) {
      this.ringMesh.visible = true;
      (this.ringMesh.material as import('three').MeshBasicMaterial).color.set(state.accentColor);
    } else {
      this.ringMesh.visible = false;
    }
  }

  private disposeMesh(mesh: import('three').Mesh): void {
    mesh.geometry.dispose();
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) {
      const std = m as import('three').MeshStandardMaterial;
      std.map?.dispose();
      m.dispose();
    }
  }

  private disposeGroup(group: import('three').Group): void {
    group.traverse((obj) => {
      if (obj instanceof this.THREE.Mesh) {
        this.disposeMesh(obj);
      }
    });
  }

  startRenderLoop(): void {
    const animate = (): void => {
      this.animationFrameId = requestAnimationFrame(animate);
      this.sync();
      this.renderer.render(this.scene, this.camera);
    };
    animate();
  }

  stopRenderLoop(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  private handleResize(): void {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width === 0 || height === 0) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  dispose(): void {
    this.stopRenderLoop();
    window.removeEventListener('resize', this.boundHandleResize);
    this.scene.traverse((object) => {
      if (object instanceof this.THREE.Mesh) {
        object.geometry.dispose();
        if (Array.isArray(object.material)) {
          object.material.forEach((m) => m.dispose());
        } else {
          object.material.dispose();
        }
      }
    });
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}

export async function createBattleTable3D(options: Table3dOptions): Promise<BattleTable3D> {
  const THREE = await import('three');
  return new BattleTable3D(options, THREE);
}
