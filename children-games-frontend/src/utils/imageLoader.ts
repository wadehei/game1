/**
 * Canvas 游戏图片预加载工具
 * 用于在游戏启动前批量加载 SVG/PNG 资源，避免渲染时闪烁
 */
export class ImageLoader {
  private images = new Map<string, HTMLImageElement>();

  /**
   * 批量加载图片资源
   * @param map key→src 映射表
   * @returns 加载完成后返回自身
   */
  async loadAll(map: Record<string, string>): Promise<this> {
    await Promise.all(
      Object.entries(map).map(
        ([key, src]) =>
          new Promise<void>((resolve) => {
            const img = new Image();
            img.onload = () => {
              this.images.set(key, img);
              resolve();
            };
            img.onerror = () => {
              console.warn(`[ImageLoader] 图片加载失败: ${key} → ${src}`);
              resolve();
            };
            img.src = src;
          }),
      ),
    );
    return this;
  }

  /**
   * 获取已加载的图片
   * @param key 图片标识
   * @returns HTMLImageElement 或 undefined（未加载成功时）
   */
  get(key: string): HTMLImageElement | undefined {
    return this.images.get(key);
  }

  /**
   * 检查图片是否已加载
   */
  has(key: string): boolean {
    return this.images.has(key);
  }

  /**
   * 已加载图片数量
   */
  get size(): number {
    return this.images.size;
  }
}
