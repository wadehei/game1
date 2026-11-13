/**
 * 3D 牌桌原型
 * 使用 Three.js 创建 3D 斗地主牌桌
 *
 * 这是一个原型演示，展示 3D 化的可能性
 * 需要安装: npm install three @types/three
 */

import * as THREE from 'three';

// 牌桌配置
const TABLE_CONFIG = {
  width: 12,
  height: 8,
  color: 0x1b5e20,
  edgeColor: 0x4e342e,
};

// 牌配置
const CARD_CONFIG = {
  width: 0.6,
  height: 0.84,
  depth: 0.02,
  backColor: 0x1565c0,
  frontColor: 0xffffff,
};

export interface Table3DOptions {
  container: HTMLElement;
  onViewChange?: (camera: THREE.Camera) => void;
}

export class DoudizhuTable3D {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private container: HTMLElement;
  private animationFrameId: number | null = null;

  private table: THREE.Group | null = null;
  private cards: THREE.Group[] = [];

  private onViewChange?: (camera: THREE.Camera) => void;
  private boundHandleResize: () => void;

  constructor(options: Table3DOptions) {
    this.container = options.container;
    this.onViewChange = options.onViewChange;
    this.boundHandleResize = this.handleResize.bind(this);

    // 初始化场景
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x2e7d32);

    // 初始化相机
    this.camera = new THREE.PerspectiveCamera(
      60,
      this.container.clientWidth / this.container.clientHeight,
      0.1,
      100
    );
    this.camera.position.set(0, 8, 6);
    this.camera.lookAt(0, 0, 0);

    // 初始化渲染器
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
    });
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.container.appendChild(this.renderer.domElement);

    // 添加光照
    this.setupLights();

    // 创建牌桌
    this.createTable();

    // 窗口大小变化
    window.addEventListener('resize', this.boundHandleResize);
  }

  private setupLights(): void {
    // 环境光
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);

    // 方向光（模拟顶灯）
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(0, 10, 5);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 50;
    directionalLight.shadow.camera.left = -10;
    directionalLight.shadow.camera.right = 10;
    directionalLight.shadow.camera.top = 10;
    directionalLight.shadow.camera.bottom = -10;
    this.scene.add(directionalLight);

    // 点光源（增加氛围）
    const pointLight = new THREE.PointLight(0xffd700, 0.3, 20);
    pointLight.position.set(0, 5, 0);
    this.scene.add(pointLight);
  }

  private createTable(): void {
    this.table = new THREE.Group();

    // 桌面
    const tableGeometry = new THREE.BoxGeometry(TABLE_CONFIG.width, 0.2, TABLE_CONFIG.height);
    const tableMaterial = new THREE.MeshStandardMaterial({
      color: TABLE_CONFIG.color,
      roughness: 0.8,
      metalness: 0.1,
    });
    const tableMesh = new THREE.Mesh(tableGeometry, tableMaterial);
    tableMesh.position.y = -0.1;
    tableMesh.receiveShadow = true;
    this.table.add(tableMesh);

    // 桌边
    const edgeGeometry = new THREE.BoxGeometry(
      TABLE_CONFIG.width + 0.4,
      0.3,
      TABLE_CONFIG.height + 0.4
    );
    const edgeMaterial = new THREE.MeshStandardMaterial({
      color: TABLE_CONFIG.edgeColor,
      roughness: 0.6,
      metalness: 0.2,
    });
    const edgeMesh = new THREE.Mesh(edgeGeometry, edgeMaterial);
    edgeMesh.position.y = -0.25;
    edgeMesh.receiveShadow = true;
    this.table.add(edgeMesh);

    // 桌面装饰线
    const lineGeometry = new THREE.RingGeometry(2.5, 2.6, 64);
    const lineMaterial = new THREE.MeshBasicMaterial({
      color: 0xffd700,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.3,
    });
    const lineMesh = new THREE.Mesh(lineGeometry, lineMaterial);
    lineMesh.rotation.x = -Math.PI / 2;
    lineMesh.position.y = 0.01;
    this.table.add(lineMesh);

    this.scene.add(this.table);
  }

  /**
   * 创建一张 3D 牌
   */
  createCard(value: number, suit: number, faceUp: boolean = true): THREE.Group {
    const cardGroup = new THREE.Group();

    // 牌的主体
    const cardGeometry = new THREE.BoxGeometry(
      CARD_CONFIG.width,
      CARD_CONFIG.depth,
      CARD_CONFIG.height
    );

    // 创建材质数组（6个面）
    const materials = [];
    const sideColor = 0xcccccc;

    if (faceUp) {
      // 正面朝上
      materials.push(
        new THREE.MeshStandardMaterial({ color: sideColor }), // right
        new THREE.MeshStandardMaterial({ color: sideColor }), // left
        new THREE.MeshStandardMaterial({ color: CARD_CONFIG.frontColor }), // top (front)
        new THREE.MeshStandardMaterial({ color: sideColor }), // bottom
        new THREE.MeshStandardMaterial({ color: sideColor }), // front
        new THREE.MeshStandardMaterial({ color: sideColor }) // back
      );
    } else {
      // 背面朝上
      materials.push(
        new THREE.MeshStandardMaterial({ color: sideColor }),
        new THREE.MeshStandardMaterial({ color: sideColor }),
        new THREE.MeshStandardMaterial({ color: CARD_CONFIG.backColor }),
        new THREE.MeshStandardMaterial({ color: sideColor }),
        new THREE.MeshStandardMaterial({ color: sideColor }),
        new THREE.MeshStandardMaterial({ color: sideColor })
      );
    }

    const cardMesh = new THREE.Mesh(cardGeometry, materials);
    cardMesh.castShadow = true;
    cardMesh.receiveShadow = true;
    cardGroup.add(cardMesh);

    // 添加牌的图案（简化版）
    if (faceUp) {
      this.addCardFace(cardGroup, value, suit);
    } else {
      this.addCardBack(cardGroup);
    }

    return cardGroup;
  }

  private addCardFace(cardGroup: THREE.Group, value: number, suit: number): void {
    // 创建 Canvas 纹理
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 180;
    const ctx = canvas.getContext('2d')!;

    // 白色背景
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 128, 180);

    // 边框
    ctx.strokeStyle = '#cccccc';
    ctx.lineWidth = 2;
    ctx.strokeRect(2, 2, 124, 176);

    // 花色颜色
    const isRed = suit === 1 || suit === 2; // heart, diamond
    ctx.fillStyle = isRed ? '#e53935' : '#212121';

    // 左上角数字
    ctx.font = 'bold 24px Arial';
    const valueStr =
      value >= 16
        ? value === 16
          ? '小'
          : '大'
        : value === 11
          ? 'J'
          : value === 12
            ? 'Q'
            : value === 13
              ? 'K'
              : value === 14
                ? 'A'
                : value === 15
                  ? '2'
                  : String(value);
    ctx.fillText(valueStr, 8, 30);

    // 左上角花色
    const suitSymbols = ['♠', '♥', '♦', '♣', '★'];
    ctx.font = '20px Arial';
    ctx.fillText(suitSymbols[suit], 10, 52);

    // 中心大图案
    ctx.font = '60px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(suitSymbols[suit], 64, 110);

    // 创建纹理
    const texture = new THREE.CanvasTexture(canvas);
    texture.flipY = false;

    // 创建正面材质
    const faceMaterial = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.5,
      metalness: 0.1,
    });

    // 替换顶部材质
    const planeGeometry = new THREE.PlaneGeometry(
      CARD_CONFIG.width - 0.02,
      CARD_CONFIG.height - 0.02
    );
    const faceMesh = new THREE.Mesh(planeGeometry, faceMaterial);
    faceMesh.rotation.x = -Math.PI / 2;
    faceMesh.position.y = CARD_CONFIG.depth / 2 + 0.001;
    cardGroup.add(faceMesh);
  }

  private addCardBack(cardGroup: THREE.Group): void {
    // 创建背面纹理
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 180;
    const ctx = canvas.getContext('2d')!;

    // 蓝色渐变背景
    const gradient = ctx.createLinearGradient(0, 0, 128, 180);
    gradient.addColorStop(0, '#1565c0');
    gradient.addColorStop(0.5, '#1976d2');
    gradient.addColorStop(1, '#1565c0');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 180);

    // 边框
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 4]);
    ctx.strokeRect(8, 8, 112, 164);

    // 中心装饰
    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(64, 90, 25, 0, Math.PI * 2);
    ctx.stroke();

    // 星星
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.font = '24px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('★', 64, 100);

    // 创建纹理
    const texture = new THREE.CanvasTexture(canvas);
    texture.flipY = false;

    // 创建背面材质
    const backMaterial = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.5,
      metalness: 0.1,
    });

    // 替换顶部材质
    const planeGeometry = new THREE.PlaneGeometry(
      CARD_CONFIG.width - 0.02,
      CARD_CONFIG.height - 0.02
    );
    const backMesh = new THREE.Mesh(planeGeometry, backMaterial);
    backMesh.rotation.x = -Math.PI / 2;
    backMesh.position.y = CARD_CONFIG.depth / 2 + 0.001;
    cardGroup.add(backMesh);
  }

  /**
   * 将牌放到指定位置
   */
  placeCard(card: THREE.Group, x: number, y: number, z: number, rotation: number = 0): void {
    card.position.set(x, y, z);
    card.rotation.y = rotation;
    this.scene.add(card);
    this.cards.push(card);
  }

  /**
   * 发牌动画
   */
  async dealCardsAnimation(cards: THREE.Group[][]): Promise<void> {
    const duration = 1000;
    const startTime = performance.now();

    return new Promise((resolve) => {
      const animate = (time: number) => {
        const elapsed = time - startTime;
        const progress = Math.min(elapsed / duration, 1);

        // 每张牌的位置
        cards.forEach((playerCards, playerIndex) => {
          const angle = (playerIndex / 3) * Math.PI * 2 - Math.PI / 2;
          const targetX = Math.cos(angle) * 3;
          const targetZ = Math.sin(angle) * 3;

          playerCards.forEach((card, cardIndex) => {
            const cardProgress = Math.max(
              0,
              Math.min(1, (progress * cards.length * 17 - cardIndex - playerIndex * 17) / 1)
            );

            if (cardProgress > 0) {
              const startX = 0;
              const startZ = 0;
              const eased = 1 - Math.pow(1 - cardProgress, 3);

              card.position.x = startX + (targetX - startX) * eased + (cardIndex - 8) * 0.1;
              card.position.z = startZ + (targetZ - startZ) * eased;
              card.position.y = 0.5 * Math.sin(cardProgress * Math.PI);
            }
          });
        });

        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          resolve();
        }
      };

      requestAnimationFrame(animate);
    });
  }

  /**
   * 开始渲染循环
   */
  startRenderLoop(): void {
    const animate = () => {
      this.animationFrameId = requestAnimationFrame(animate);
      this.renderer.render(this.scene, this.camera);
      this.onViewChange?.(this.camera);
    };
    animate();
  }

  /**
   * 停止渲染
   */
  stopRenderLoop(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  private handleResize(): void {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  /**
   * 清理资源
   */
  dispose(): void {
    this.stopRenderLoop();
    window.removeEventListener('resize', this.boundHandleResize);

    // 清理 Three.js 资源
    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        if (Array.isArray(object.material)) {
          object.material.forEach((m) => m.dispose());
        } else {
          object.material.dispose();
        }
      }
    });

    this.renderer.dispose();
    this.container.removeChild(this.renderer.domElement);
  }
}

/**
 * 创建 3D 牌桌实例
 */
export function createTable3D(options: Table3DOptions): DoudizhuTable3D {
  return new DoudizhuTable3D(options);
}
