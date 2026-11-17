/**
 * 抓娃娃机 3D 场景（Three.js 渲染层，逻辑见 useClawGame）
 * 低多边形+纯色材质；pixelRatio ≤ 1.5；对象按奖品 id 复用（天然对象池）
 */
type THREE = typeof import('three');

import { MAX_PIXEL_RATIO } from '@/composables/use3dGuard';

export interface Claw3dPrizeSnapshot {
  id: number;
  x: number; // 0~1 归一化
  grabbed: boolean;
}

export interface Claw3dState {
  clawX: number; // 0~1
  dropping: boolean;
  releasing: boolean;
  holding: boolean;
  prizes: Claw3dPrizeSnapshot[];
}

export interface Claw3dOptions {
  container: HTMLElement;
  /** 每帧拉取逻辑层状态 */
  getState: () => Claw3dState;
}

// 机柜逻辑尺寸
const CAB_W = 10;
const CAB_D = 6;
const CAB_H = 8;

// 奖品淡出色板（低饱和儿童色）
const PRIZE_COLORS = [0xf6a5c0, 0xffd97a, 0x9fdcb4, 0x9ac1f0, 0xc9a7eb, 0xffab91];

export class ClawMachine3D {
  private scene: import('three').Scene;
  private camera: import('three').PerspectiveCamera;
  private renderer: import('three').WebGLRenderer;
  private container: HTMLElement;
  private getState: () => Claw3dState;
  private animationFrameId: number | null = null;
  private boundHandleResize: () => void;

  private clawGroup: import('three').Group;
  private clawFingers: import('three').Mesh[] = [];
  private prizeMeshes = new Map<number, import('three').Mesh>();
  private heldMesh: import('three').Mesh | null = null;
  private heldColorSeq = 0;

  private readonly THREE: THREE;

  constructor(options: Claw3dOptions, THREE: THREE) {
    this.container = options.container;
    this.getState = options.getState;
    this.THREE = THREE;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xfdeff4);

    this.camera = new THREE.PerspectiveCamera(
      50,
      this.container.clientWidth / this.container.clientHeight,
      0.1,
      100
    );
    this.camera.position.set(0, 7.2, 14.5);
    this.camera.lookAt(0, 2.6, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.container.appendChild(this.renderer.domElement);

    this.setupLights();
    this.buildCabinet();
    const claw = this.buildClaw();
    this.clawGroup = claw;
    this.scene.add(claw);

    this.boundHandleResize = this.handleResize.bind(this);
    window.addEventListener('resize', this.boundHandleResize);
  }

  private setupLights(): void {
    const THREE = this.THREE;
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.65));

    const dir = new THREE.DirectionalLight(0xffffff, 0.75);
    dir.position.set(4, 12, 6);
    dir.castShadow = true;
    dir.shadow.mapSize.width = 1024;
    dir.shadow.mapSize.height = 1024;
    dir.shadow.camera.near = 1;
    dir.shadow.camera.far = 40;
    this.scene.add(dir);

    // 机柜内暖色小灯（氛围）
    const lamp = new THREE.PointLight(0xffe0b2, 0.7, 24);
    lamp.position.set(0, CAB_H - 1.2, 0);
    this.scene.add(lamp);
  }

  private buildCabinet(): void {
    const THREE = this.THREE;
    const shell = new THREE.MeshStandardMaterial({ color: 0xf3b8cf, roughness: 0.7 });
    const inner = new THREE.MeshStandardMaterial({ color: 0xfff4f8, roughness: 0.9 });

    // 左右壁
    const wallGeo = new THREE.BoxGeometry(0.4, CAB_H, CAB_D);
    const left = new THREE.Mesh(wallGeo, shell);
    left.position.set(-CAB_W / 2, CAB_H / 2, 0);
    const right = new THREE.Mesh(wallGeo, shell);
    right.position.set(CAB_W / 2, CAB_H / 2, 0);
    this.scene.add(left, right);

    // 顶板
    const top = new THREE.Mesh(new THREE.BoxGeometry(CAB_W + 0.4, 0.5, CAB_D), shell);
    top.position.set(0, CAB_H + 0.25, 0);
    this.scene.add(top);

    // 背板
    const back = new THREE.Mesh(new THREE.BoxGeometry(CAB_W, CAB_H, 0.3), inner);
    back.position.set(0, CAB_H / 2, -CAB_D / 2);
    this.scene.add(back);

    // 奖品池底板
    const pool = new THREE.Mesh(
      new THREE.BoxGeometry(CAB_W, 0.5, CAB_D),
      new THREE.MeshStandardMaterial({ color: 0xf6dfea, roughness: 0.9 })
    );
    pool.position.set(0, -0.25, 0);
    pool.receiveShadow = true;
    this.scene.add(pool);

    // 前玻璃（透明薄板）
    const glass = new THREE.Mesh(
      new THREE.BoxGeometry(CAB_W, CAB_H - 2.4, 0.06),
      new THREE.MeshStandardMaterial({
        color: 0xd9ecf5,
        transparent: true,
        opacity: 0.14,
        roughness: 0.15,
      })
    );
    glass.position.set(0, (CAB_H - 2.4) / 2 + 1.2, CAB_D / 2);
    this.scene.add(glass);

    // 出货口（前下方开洞暗示：一个深色凹槽）
    const chute = new THREE.Mesh(
      new THREE.BoxGeometry(3.2, 1.6, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x5c4756, roughness: 0.8 })
    );
    chute.position.set(-2.6, 0.8, CAB_D / 2 + 0.05);
    this.scene.add(chute);

    // 导轨横梁（爪子吊臂轨道）
    const beam = new THREE.Mesh(
      new THREE.BoxGeometry(CAB_W - 1, 0.28, 0.5),
      new THREE.MeshStandardMaterial({ color: 0xe08bb0, roughness: 0.5 })
    );
    beam.position.set(0, CAB_H - 0.9, 0);
    this.scene.add(beam);
  }

  private buildClaw(): import('three').Group {
    const THREE = this.THREE;
    const group = new THREE.Group();

    // 吊杆
    const rod = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 2.2, 10),
      new THREE.MeshStandardMaterial({ color: 0x8a93a6, roughness: 0.4, metalness: 0.4 })
    );
    rod.position.y = 1.1;
    group.add(rod);

    // 爪头
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.42, 14, 12),
      new THREE.MeshStandardMaterial({ color: 0xe8447f, roughness: 0.4 })
    );
    head.castShadow = true;
    group.add(head);

    // 三根爪指（绕头均布，收拢=向内转）
    const fingerGeo = new THREE.BoxGeometry(0.16, 1.1, 0.1);
    const fingerMat = new THREE.MeshStandardMaterial({ color: 0xc2416e, roughness: 0.5 });
    for (let i = 0; i < 3; i += 1) {
      const finger = new THREE.Mesh(fingerGeo, fingerMat);
      const pivot = new THREE.Group();
      pivot.rotation.y = (i / 3) * Math.PI * 2;
      finger.position.set(0.34, -0.62, 0);
      finger.rotation.z = 0.42;
      finger.castShadow = true;
      pivot.add(finger);
      group.add(pivot);
      this.clawFingers.push(finger);
    }

    group.position.set(0, CAB_H - 0.9, 0);
    return group;
  }

  // clawX(0~1) → 场景 x（留出边距）
  private normToX(norm: number): number {
    return (norm - 0.5) * (CAB_W - 1.6);
  }

  private makePrizeMesh(id: number): import('three').Mesh {
    const THREE = this.THREE;
    const color = PRIZE_COLORS[id % PRIZE_COLORS.length];
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
    const roll = id % 3;
    let mesh: import('three').Mesh;
    if (roll === 0) {
      mesh = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.95, 0.95), mat);
    } else if (roll === 1) {
      mesh = new THREE.Mesh(new THREE.SphereGeometry(0.58, 14, 12), mat);
    } else {
      mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.9, 12), mat);
    }
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  /** 每帧同步逻辑状态到场景 */
  private sync(): void {
    const state = this.getState();

    // 爪子位置：巡航 + 下爪/收爪
    const beamY = CAB_H - 0.9;
    const idleY = beamY;
    const dropY = 2.1;
    const targetY = state.dropping && !state.releasing ? dropY : idleY;
    this.clawGroup.position.x += (this.normToX(state.clawX) - this.clawGroup.position.x) * 0.35;
    this.clawGroup.position.y +=
      (targetY - this.clawGroup.position.y) * (state.dropping ? 0.16 : 0.1);

    // 爪指开合：下爪张开，抓到收拢
    const fingerTarget = state.holding ? 0.08 : state.dropping && !state.releasing ? 0.62 : 0.42;
    for (const finger of this.clawFingers) {
      finger.rotation.z += (fingerTarget - finger.rotation.z) * 0.18;
    }

    // 抓住的奖品挂在爪心
    if (state.holding && !this.heldMesh) {
      this.heldColorSeq += 1;
      this.heldMesh = this.makePrizeMesh(this.heldColorSeq);
      this.scene.add(this.heldMesh);
    }
    if (this.heldMesh) {
      if (state.holding) {
        this.heldMesh.position.set(this.clawGroup.position.x, this.clawGroup.position.y - 1.15, 0);
      } else {
        // 松爪：掉进出货口方向
        const mesh = this.heldMesh;
        this.heldMesh = null;
        const fall = () => {
          mesh.position.y -= 0.55;
          mesh.position.x += (-2.6 - mesh.position.x) * 0.12;
          mesh.rotation.z += 0.12;
          if (mesh.position.y > 0.75) {
            requestAnimationFrame(fall);
          } else {
            this.scene.remove(mesh);
            mesh.geometry.dispose();
            (mesh.material as import('three').Material).dispose();
          }
        };
        requestAnimationFrame(fall);
      }
    }

    // 奖品池同步：按 id 建模/移动/移除（抓走的缩小消失）
    const alive = new Set<number>();
    for (const prize of state.prizes) {
      alive.add(prize.id);
      let mesh = this.prizeMeshes.get(prize.id);
      if (!mesh) {
        mesh = this.makePrizeMesh(prize.id);
        mesh.position.set(this.normToX(prize.x), 0.62, (Math.random() - 0.5) * (CAB_D - 2.2));
        this.scene.add(mesh);
        this.prizeMeshes.set(prize.id, mesh);
      }
      const targetX = this.normToX(prize.x);
      mesh.position.x += (targetX - mesh.position.x) * 0.2;
      if (prize.grabbed) {
        mesh.scale.multiplyScalar(0.82);
        if (mesh.scale.x < 0.08) {
          this.disposeMesh(prize.id, mesh);
          alive.delete(prize.id);
        }
      }
    }
    for (const [id, mesh] of this.prizeMeshes) {
      if (!alive.has(id)) {
        this.disposeMesh(id, mesh);
      }
    }
  }

  private disposeMesh(id: number, mesh: import('three').Mesh): void {
    this.scene.remove(mesh);
    mesh.geometry.dispose();
    (mesh.material as import('three').Material).dispose();
    this.prizeMeshes.delete(id);
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

export async function createClawMachine3D(options: Claw3dOptions): Promise<ClawMachine3D> {
  const THREE = await import('three');
  return new ClawMachine3D(options, THREE);
}
