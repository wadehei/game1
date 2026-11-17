/**
 * 五子棋 3D 棋盘（Three.js 渲染层，状态契约与 GomokuBoard 2D 完全一致）
 * 立体棋子 + 拖拽旋转视角 + 落子 raycast；低多边形，pixelRatio ≤ 1.5
 * 棋盘网格线为程序化 canvas 纹理（与 ddz 牌面纹理同思路，非外部贴图模型）
 */
type THREE = typeof import('three');

import { MAX_PIXEL_RATIO } from '@/composables/use3dGuard';

export interface Gomoku3dState {
  board: number[][];
  turn: number;
  winLine: [number, number][];
  lastMove: { x: number; y: number } | null;
}

export interface Gomoku3dOptions {
  container: HTMLElement;
  getState: () => Gomoku3dState;
  /** 可落子时的 raycast 命中回调（已校验回合与空位） */
  onTapCell: (x: number, y: number) => void;
  /** 是否轮到"我"落子（决定点击落子与悬停指示是否生效） */
  canPlay: () => boolean;
}

const BOARD_SIZE = 15;
const CELL = 1;
const BOARD_W = (BOARD_SIZE - 1) * CELL; // 14
const STONE_Y = 0.42;
const DROP_H = 1.6;

export class GomokuBoard3D {
  private scene: import('three').Scene;
  private camera: import('three').PerspectiveCamera;
  private renderer: import('three').WebGLRenderer;
  private raycaster: import('three').Raycaster;
  private container: HTMLElement;
  private getState: () => Gomoku3dState;
  private onTapCell: (x: number, y: number) => void;
  private canPlay: () => boolean;

  private animationFrameId: number | null = null;
  private boundHandleResize: () => void;
  private boundPointerDown: (e: PointerEvent) => void;
  private boundPointerMove: (e: PointerEvent) => void;

  private stoneGroup: import('three').Group;
  private boardMesh: import('three').Mesh;
  private winLineMesh: import('three').Mesh | null = null;
  private stones = new Map<string, import('three').Mesh>();
  private lastMark: import('three').Mesh | null = null;

  // 轨道相机参数（拖拽旋转）
  private theta = 0;
  private phi = 0.98; // 与水平面夹角（弧度）
  private radius = 15.5;
  private dragging = false;
  private dragMoved = false;
  private lastPointer = { x: 0, y: 0 };

  private readonly THREE: THREE;

  constructor(options: Gomoku3dOptions, THREE: THREE) {
    this.container = options.container;
    this.getState = options.getState;
    this.onTapCell = options.onTapCell;
    this.canPlay = options.canPlay;
    this.THREE = THREE;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xf5f7fa);

    this.camera = new THREE.PerspectiveCamera(
      45,
      this.container.clientWidth / this.container.clientHeight,
      0.1,
      80
    );

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);

    this.raycaster = new THREE.Raycaster();

    this.setupLights();
    this.boardMesh = this.buildBoard();
    this.stoneGroup = new THREE.Group();
    this.scene.add(this.stoneGroup);

    this.updateCamera();

    this.boundHandleResize = this.handleResize.bind(this);
    window.addEventListener('resize', this.boundHandleResize);
    this.boundPointerDown = this.handlePointerDown.bind(this);
    this.boundPointerMove = this.handlePointerMove.bind(this);
    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', this.boundPointerDown);
    el.addEventListener('pointermove', this.boundPointerMove);
    el.addEventListener('pointerup', (e) => this.handlePointerUp(e));
    el.addEventListener('pointercancel', () => this.handlePointerCancel());
  }

  private setupLights(): void {
    const THREE = this.THREE;
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.72));

    const dir = new THREE.DirectionalLight(0xffffff, 0.68);
    dir.position.set(6, 14, 6);
    dir.castShadow = true;
    dir.shadow.mapSize.width = 1024;
    dir.shadow.mapSize.height = 1024;
    this.scene.add(dir);
  }

  /** 程序化网格线纹理：15×15 线 + 星位 */
  private makeBoardTexture(): import('three').CanvasTexture {
    const THREE = this.THREE;
    const canvas = document.createElement('canvas');
    canvas.width = 896;
    canvas.height = 896;
    const ctx = canvas.getContext('2d')!;

    // 木纹底色
    ctx.fillStyle = '#e8c88f';
    ctx.fillRect(0, 0, 896, 896);
    ctx.fillStyle = '#f5deb3';
    ctx.fillRect(0, 0, 896, 8);

    const pad = 32;
    const step = (896 - pad * 2) / (BOARD_SIZE - 1);
    ctx.strokeStyle = 'rgba(110, 70, 25, 0.7)';
    ctx.lineWidth = 2;
    for (let i = 0; i < BOARD_SIZE; i += 1) {
      const p = pad + i * step;
      ctx.beginPath();
      ctx.moveTo(pad, p);
      ctx.lineTo(896 - pad, p);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(p, pad);
      ctx.lineTo(p, 896 - pad);
      ctx.stroke();
    }
    // 星位
    ctx.fillStyle = 'rgba(110, 70, 25, 0.9)';
    for (const [sx, sy] of [
      [3, 3],
      [11, 3],
      [3, 11],
      [11, 11],
      [7, 7],
    ]) {
      ctx.beginPath();
      ctx.arc(pad + sx * step, pad + sy * step, 5, 0, Math.PI * 2);
      ctx.fill();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.flipY = false;
    return texture;
  }

  private buildBoard(): import('three').Mesh {
    const THREE = this.THREE;
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(BOARD_W + 1.6, 0.5, BOARD_W + 1.6),
      new THREE.MeshStandardMaterial({ color: 0xd9b98c, roughness: 0.75 })
    );
    board.position.y = -0.25;
    board.receiveShadow = true;
    this.scene.add(board);

    // 顶面网格（程序化纹理面片）
    const top = new THREE.Mesh(
      new THREE.PlaneGeometry(BOARD_W + 0.7, BOARD_W + 0.7),
      new THREE.MeshStandardMaterial({ map: this.makeBoardTexture(), roughness: 0.65 })
    );
    top.rotation.x = -Math.PI / 2;
    top.position.y = 0.005;
    top.receiveShadow = true;
    this.scene.add(top);

    // 底座
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(BOARD_W + 2.6, 0.36, BOARD_W + 2.6),
      new THREE.MeshStandardMaterial({ color: 0x8a6b48, roughness: 0.85 })
    );
    base.position.y = -0.62;
    this.scene.add(base);

    return board;
  }

  // 棋盘逻辑坐标 → 场景坐标（交点居中，y 轴向上）
  private gridToWorld(x: number, y: number): { wx: number; wz: number } {
    return {
      wx: (x - (BOARD_SIZE - 1) / 2) * CELL,
      wz: (y - (BOARD_SIZE - 1) / 2) * CELL,
    };
  }

  private makeStone(color: number): import('three').Mesh {
    const THREE = this.THREE;
    const isBlack = color === 1;
    const mat = new THREE.MeshStandardMaterial({
      color: isBlack ? 0x1c1c1e : 0xf2f2f4,
      roughness: isBlack ? 0.35 : 0.28,
      metalness: 0.05,
    });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.44, 18, 14), mat);
    mesh.castShadow = true;
    mesh.userData.color = color;
    return mesh;
  }

  private updateCamera(): void {
    this.camera.position.set(
      this.radius * Math.cos(this.phi) * Math.sin(this.theta),
      this.radius * Math.sin(this.phi),
      this.radius * Math.cos(this.phi) * Math.cos(this.theta)
    );
    this.camera.lookAt(0, 0, 0);
  }

  private sync(): void {
    const THREE = this.THREE;
    const state = this.getState();
    const alive = new Set<string>();

    for (let y = 0; y < BOARD_SIZE; y += 1) {
      const row = state.board[y];
      if (!row) continue;
      for (let x = 0; x < BOARD_SIZE; x += 1) {
        const cell = row[x];
        if (!cell) continue;
        const key = `${x}-${y}`;
        alive.add(key);
        let stone = this.stones.get(key);
        if (!stone) {
          stone = this.makeStone(cell);
          const { wx, wz } = this.gridToWorld(x, y);
          stone.position.set(wx, STONE_Y + DROP_H, wz); // 从上方落下
          stone.userData.targetColor = cell;
          this.stoneGroup.add(stone);
          this.stones.set(key, stone);
        } else if (stone.userData.targetColor !== cell) {
          // 异常恢复（快照重放换色）：直接换材质
          this.stoneGroup.remove(stone);
          this.stones.delete(key);
          const fresh = this.makeStone(cell);
          const { wx, wz } = this.gridToWorld(x, y);
          fresh.position.set(wx, STONE_Y, wz);
          fresh.userData.targetColor = cell;
          this.stoneGroup.add(fresh);
          this.stones.set(key, fresh);
          alive.add(`${x}-${y}`);
          stone = fresh;
        }

        // 落子下落动画
        const isLast = !!state.lastMove && state.lastMove.x === x && state.lastMove.y === y;
        const targetY = STONE_Y + (isLast ? 0.08 : 0);
        stone.position.y += (targetY - stone.position.y) * 0.18;
        if (stone.position.y < STONE_Y) stone.position.y = STONE_Y;
      }
    }

    // 清理消失的棋子（悔棋/重开）
    for (const [key, stone] of this.stones) {
      if (!alive.has(key)) {
        this.stoneGroup.remove(stone);
        stone.geometry.dispose();
        (stone.material as import('three').Material).dispose();
        this.stones.delete(key);
      }
    }

    // 最后一手标记（小红点悬在子上方）
    if (state.lastMove && state.board[state.lastMove.y]?.[state.lastMove.x]) {
      if (!this.lastMark) {
        this.lastMark = new THREE.Mesh(
          new THREE.SphereGeometry(0.1, 8, 8),
          new THREE.MeshBasicMaterial({ color: 0xe74c3c })
        );
        this.stoneGroup.add(this.lastMark);
      }
      const { wx, wz } = this.gridToWorld(state.lastMove.x, state.lastMove.y);
      this.lastMark.position.set(wx, STONE_Y + 0.62, wz);
      this.lastMark.visible = true;
    } else if (this.lastMark) {
      this.lastMark.visible = false;
    }

    // 胜利连线（悬浮光带）
    if (state.winLine.length >= 2) {
      const first = state.winLine[0];
      const last = state.winLine[state.winLine.length - 1];
      const a = this.gridToWorld(first[0], first[1]);
      const b = this.gridToWorld(last[0], last[1]);
      if (!this.winLineMesh) {
        this.winLineMesh = new THREE.Mesh(
          new THREE.CylinderGeometry(0.09, 0.09, 1, 8),
          new THREE.MeshBasicMaterial({ color: 0xe67e22 })
        );
        this.stoneGroup.add(this.winLineMesh);
      }
      const dx = b.wx - a.wx;
      const dz = b.wz - a.wz;
      const len = Math.hypot(dx, dz) + 0.7;
      this.winLineMesh.scale.set(1, len, 1);
      this.winLineMesh.position.set((a.wx + b.wx) / 2, STONE_Y, (a.wz + b.wz) / 2);
      // 圆柱 y 轴对齐连线方向（棋盘平面内）
      const dir = new THREE.Vector3(dx, 0, dz).normalize();
      this.winLineMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    } else if (this.winLineMesh) {
      this.winLineMesh.visible = false;
    }
  }

  // ── 交互：拖拽旋转 + 点击落子 ──
  private handlePointerDown(e: PointerEvent): void {
    this.dragging = true;
    this.dragMoved = false;
    this.lastPointer = { x: e.clientX, y: e.clientY };
  }

  private handlePointerMove(e: PointerEvent): void {
    if (!this.dragging) return;
    const dx = e.clientX - this.lastPointer.x;
    const dy = e.clientY - this.lastPointer.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) this.dragMoved = true;
    if (!this.dragMoved) return;
    this.theta -= dx * 0.008;
    this.phi = Math.max(0.22, Math.min(1.32, this.phi + dy * 0.006));
    this.lastPointer = { x: e.clientX, y: e.clientY };
    this.updateCamera();
  }

  private handlePointerUp(e: PointerEvent): void {
    if (!this.dragging) return;
    this.dragging = false;
    if (this.dragMoved) return;
    // 未拖动 = 点击：raycast 落子
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new this.THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = this.raycaster.intersectObject(this.boardMesh, false)[0];
    if (!hit) return;
    // 命中点 → 最近交点
    const state = this.getState();
    const half = (BOARD_SIZE - 1) / 2;
    const gx = Math.round(hit.point.x / CELL + half);
    const gy = Math.round(hit.point.z / CELL + half);
    if (gx < 0 || gx >= BOARD_SIZE || gy < 0 || gy >= BOARD_SIZE) return;
    if (!this.canPlay()) return;
    if (state.board[gy]?.[gx]) return;
    this.onTapCell(gx, gy);
  }

  private handlePointerCancel(): void {
    this.dragging = false;
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
    const el = this.renderer.domElement;
    el.removeEventListener('pointerdown', this.boundPointerDown);
    el.removeEventListener('pointermove', this.boundPointerMove);
    el.removeEventListener('pointerup', this.handlePointerUp);
    el.removeEventListener('pointercancel', this.handlePointerCancel);
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
    if (el.parentElement === this.container) {
      this.container.removeChild(el);
    }
  }
}

export async function createGomokuBoard3D(options: Gomoku3dOptions): Promise<GomokuBoard3D> {
  const THREE = await import('three');
  return new GomokuBoard3D(options, THREE);
}
