/**
 * 消消乐 3D 棋盘（Three.js 渲染层，逻辑见 useMatch3Engine）
 * 方块按 cell.id 复用（对象池）；低多边形纯色；pixelRatio ≤ 1.5
 * 视觉约定：kind → 颜色+形状双轴区分（孩子不依赖 emoji 也能玩）
 */
type THREE = typeof import('three');

import { MAX_PIXEL_RATIO } from '@/composables/use3dGuard';

export interface Match3dCellSnapshot {
  id: number;
  r: number;
  c: number;
  kind: number;
  clearing?: boolean;
  popin?: boolean;
}

export interface Match3dState {
  cells: Match3dCellSnapshot[];
  selected: { r: number; c: number } | null;
}

export interface Match3dOptions {
  container: HTMLElement;
  /** 每帧拉取棋盘快照 */
  getState: () => Match3dState;
  /** 点击格子（由拾取转换成 r/c） */
  onTapCell: (r: number, c: number) => void;
}

const ROWS = 8;
const COLS = 8;
const CELL = 1; // 格距
const CELL_Y = 0.28; // 方块半高（顶面高度）

// 6 种 kind：低饱和儿童色 + 三种体形循环（双轴区分）
const KIND_COLORS = [0xf28b94, 0xf7b267, 0xf6e27f, 0x9fd0a5, 0x7fc4c9, 0x8fb4e8];

export class Match3Board3D {
  private scene: import('three').Scene;
  private camera: import('three').PerspectiveCamera;
  private renderer: import('three').WebGLRenderer;
  private raycaster: import('three').Raycaster;
  private container: HTMLElement;
  private onTapCell: (r: number, c: number) => void;
  private getState: () => Match3dState;
  private animationFrameId: number | null = null;
  private boundHandleResize: () => void;
  private boundPointerDown: (e: PointerEvent) => void;

  private cellGroup: import('three').Group;
  private cellMeshes = new Map<number, import('three').Mesh>();
  private debris: {
    mesh: import('three').Mesh;
    vx: number;
    vy: number;
    vz: number;
    life: number;
  }[] = [];

  private readonly THREE: THREE;

  constructor(options: Match3dOptions, THREE: THREE) {
    this.container = options.container;
    this.getState = options.getState;
    this.onTapCell = options.onTapCell;
    this.THREE = THREE;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xfdf6ec);

    this.camera = new THREE.PerspectiveCamera(
      46,
      this.container.clientWidth / this.container.clientHeight,
      0.1,
      60
    );
    this.camera.position.set(0, 11.4, 8.6);
    this.camera.lookAt(0, 0, 0.4);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.container.appendChild(this.renderer.domElement);

    this.raycaster = new THREE.Raycaster();

    this.setupLights();
    this.buildBase();

    this.cellGroup = new THREE.Group();
    this.scene.add(this.cellGroup);

    this.boundHandleResize = this.handleResize.bind(this);
    window.addEventListener('resize', this.boundHandleResize);

    this.boundPointerDown = this.handlePointerDown.bind(this);
    this.renderer.domElement.addEventListener('pointerdown', this.boundPointerDown);
  }

  private setupLights(): void {
    const THREE = this.THREE;
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.7));

    const dir = new THREE.DirectionalLight(0xffffff, 0.7);
    dir.position.set(5, 12, 5);
    dir.castShadow = true;
    dir.shadow.mapSize.width = 1024;
    dir.shadow.mapSize.height = 1024;
    this.scene.add(dir);
  }

  private buildBase(): void {
    const THREE = this.THREE;
    // 棋盘底板：微微外扩的托盘
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(COLS * CELL + 0.9, 0.5, ROWS * CELL + 0.9),
      new THREE.MeshStandardMaterial({ color: 0xf3e3cb, roughness: 0.85 })
    );
    board.position.y = -0.25;
    board.receiveShadow = true;
    this.scene.add(board);

    // 底座边沿
    const rim = new THREE.Mesh(
      new THREE.BoxGeometry(COLS * CELL + 1.3, 0.34, ROWS * CELL + 1.3),
      new THREE.MeshStandardMaterial({ color: 0xd9b98c, roughness: 0.8 })
    );
    rim.position.y = -0.6;
    this.scene.add(rim);
  }

  // r,c → 场景坐标（棋盘居中）
  private gridPos(r: number, c: number): { x: number; z: number } {
    return { x: (c - (COLS - 1) / 2) * CELL, z: (r - (ROWS - 1) / 2) * CELL };
  }

  private makeCellMesh(kind: number): import('three').Mesh {
    const THREE = this.THREE;
    const color = KIND_COLORS[kind % KIND_COLORS.length];
    const mat = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.45,
      emissive: color,
      emissiveIntensity: 0,
    });
    const shape = kind % 3;
    let geo: import('three').BufferGeometry;
    if (shape === 0) {
      geo = new THREE.BoxGeometry(0.86, 0.5, 0.86);
    } else if (shape === 1) {
      geo = new THREE.SphereGeometry(0.5, 14, 12);
    } else {
      geo = new THREE.CylinderGeometry(0.46, 0.46, 0.52, 14);
    }
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.kind = kind;
    mesh.userData.bursting = false;
    return mesh;
  }

  /** 每帧同步棋盘状态 */
  private sync(dt: number): void {
    const state = this.getState();
    const alive = new Set<number>();

    for (const cell of state.cells) {
      alive.add(cell.id);
      let mesh = this.cellMeshes.get(cell.id);
      if (!mesh) {
        mesh = this.makeCellMesh(cell.kind);
        const pos = this.gridPos(cell.r, cell.c);
        mesh.position.set(pos.x, CELL_Y + 3.2, pos.z); // 新块从上方落入
        mesh.userData.rc = { r: cell.r, c: cell.c };
        this.cellGroup.add(mesh);
        this.cellMeshes.set(cell.id, mesh);
      }

      // kind 变化（交换/洗牌在原格上换种类）：换色换形
      if (mesh.userData.kind !== cell.kind) {
        this.rekindMesh(mesh, cell.kind);
      }
      mesh.userData.rc = { r: cell.r, c: cell.c };

      const pos = this.gridPos(cell.r, cell.c);
      const selected =
        !!state.selected && state.selected.r === cell.r && state.selected.c === cell.c;
      // 与选中块相邻的块轻微提亮（提示可交换对象，与 2D 版 .neighbor 一致）
      const neighbor =
        !!state.selected &&
        Math.abs(state.selected.r - cell.r) + Math.abs(state.selected.c - cell.c) === 1;

      // 目标位（clearing 的块原地爆裂不下坠）
      const targetY = selected ? CELL_Y + 0.42 : CELL_Y;
      if (cell.clearing) {
        this.burst(mesh, cell);
      } else if (mesh.userData.bursting !== true) {
        mesh.position.x += (pos.x - mesh.position.x) * Math.min(1, dt * 14);
        mesh.position.z += (pos.z - mesh.position.z) * Math.min(1, dt * 14);
        const dropIn = mesh.position.y > CELL_Y + 0.05 && !selected;
        mesh.position.y += (targetY - mesh.position.y) * Math.min(1, dt * (dropIn ? 9 : 14));
      }

      // 选中高亮（emissive 提亮），邻块轻微提亮
      const mat = mesh.material as import('three').MeshStandardMaterial;
      const targetEmissive = selected ? 0.45 : neighbor ? 0.16 : 0;
      mat.emissiveIntensity += (targetEmissive - mat.emissiveIntensity) * Math.min(1, dt * 12);
    }

    // 清掉已从棋盘消失的块
    for (const [id, mesh] of this.cellMeshes) {
      if (!alive.has(id)) {
        this.cellGroup.remove(mesh);
        mesh.geometry.dispose();
        (mesh.material as import('three').Material).dispose();
        this.cellMeshes.delete(id);
      }
    }

    this.updateDebris(dt);
  }

  private rekindMesh(mesh: import('three').Mesh, kind: number): void {
    const THREE = this.THREE;
    mesh.userData.kind = kind;
    const color = KIND_COLORS[kind % KIND_COLORS.length];
    const mat = mesh.material as import('three').MeshStandardMaterial;
    mat.color.setHex(color);
    mat.emissive.setHex(color);

    // 换形：kind 的形状轴（box/sphere/cylinder）不同则重建几何
    const isBox = mesh.geometry instanceof THREE.BoxGeometry;
    const isSphere = mesh.geometry instanceof THREE.SphereGeometry;
    const have = isBox ? 0 : isSphere ? 1 : 2;
    const want = kind % 3;
    if (have !== want) {
      mesh.geometry.dispose();
      if (want === 0) {
        mesh.geometry = new THREE.BoxGeometry(0.86, 0.5, 0.86);
      } else if (want === 1) {
        mesh.geometry = new THREE.SphereGeometry(0.5, 14, 12);
      } else {
        mesh.geometry = new THREE.CylinderGeometry(0.46, 0.46, 0.52, 14);
      }
    }
  }

  // 消除爆裂：块体回缩 + 撒 6 粒碎片
  private burst(mesh: import('three').Mesh, cell: Match3dCellSnapshot): void {
    if (mesh.userData.bursting) return;
    mesh.userData.bursting = true;

    const color = KIND_COLORS[cell.kind % KIND_COLORS.length];
    const pos = this.gridPos(cell.r, cell.c);
    for (let i = 0; i < 6; i += 1) {
      const debris = new this.THREE.Mesh(
        new this.THREE.BoxGeometry(0.16, 0.16, 0.16),
        new this.THREE.MeshStandardMaterial({ color, roughness: 0.6 })
      );
      debris.position.set(pos.x, CELL_Y, pos.z);
      this.cellGroup.add(debris);
      const angle = (i / 6) * Math.PI * 2;
      this.debris.push({
        mesh: debris,
        vx: Math.cos(angle) * (1.6 + Math.random()),
        vy: 2.6 + Math.random() * 1.4,
        vz: Math.sin(angle) * (1.6 + Math.random()),
        life: 0.55,
      });
    }

    // 块体快速缩没
    const shrink = () => {
      mesh.scale.multiplyScalar(0.78);
      if (mesh.scale.x > 0.06) {
        requestAnimationFrame(shrink);
      } else {
        this.cellGroup.remove(mesh);
        mesh.geometry.dispose();
        (mesh.material as import('three').Material).dispose();
        this.cellMeshes.delete(cell.id);
      }
    };
    requestAnimationFrame(shrink);
  }

  private updateDebris(dt: number): void {
    for (let i = this.debris.length - 1; i >= 0; i -= 1) {
      const d = this.debris[i];
      d.life -= dt;
      d.vy -= 9.5 * dt; // 重力
      d.mesh.position.x += d.vx * dt;
      d.mesh.position.y += d.vy * dt;
      d.mesh.position.z += d.vz * dt;
      d.mesh.rotation.x += dt * 9;
      d.mesh.rotation.z += dt * 7;
      if (d.life <= 0 || d.mesh.position.y < -1.2) {
        this.cellGroup.remove(d.mesh);
        d.mesh.geometry.dispose();
        (d.mesh.material as import('three').Material).dispose();
        this.debris.splice(i, 1);
      }
    }
  }

  private handlePointerDown(e: PointerEvent): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new this.THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    const hits = this.raycaster.intersectObjects(this.cellGroup.children, false);
    const hit = hits.find((h) => {
      const rc = h.object.userData.rc as { r: number; c: number } | undefined;
      return !!rc;
    });
    if (hit) {
      const rc = hit.object.userData.rc as { r: number; c: number };
      this.onTapCell(rc.r, rc.c);
    }
  }

  startRenderLoop(): void {
    let lastTs = 0;
    const animate = (ts: number): void => {
      this.animationFrameId = requestAnimationFrame(animate);
      const dt = lastTs === 0 ? 0.016 : Math.min((ts - lastTs) / 1000, 0.05);
      lastTs = ts;
      this.sync(dt);
      this.renderer.render(this.scene, this.camera);
    };
    this.animationFrameId = requestAnimationFrame(animate);
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
    this.renderer.domElement.removeEventListener('pointerdown', this.boundPointerDown);
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

export async function createMatch3Board3D(options: Match3dOptions): Promise<Match3Board3D> {
  const THREE = await import('three');
  return new Match3Board3D(options, THREE);
}
