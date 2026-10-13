/**
 * 在指定位置创建粒子爆炸效果
 */
export function createParticleBurst(
  container: HTMLElement,
  x: number, y: number,
  options?: { color?: string; count?: number; duration?: number }
): void {
  const { color, count = 12, duration = 600 } = options || {};
  const colors = color
    ? Array(count).fill(color)
    : ['#FFD700', '#FF6B6B', '#4ECDC4', '#FFE66D', '#F38181', '#95E1D3'];

  for (let i = 0; i < count; i++) {
    const particle = document.createElement('div');
    const angle = (Math.PI * 2 * i) / count;
    const distance = 30 + Math.random() * 40;
    const size = 4 + Math.random() * 6;
    const particleColor = colors[i % colors.length];
    const dx = Math.cos(angle) * distance;
    const dy = Math.sin(angle) * distance;

    particle.style.cssText = `
      position: absolute;
      left: ${x}px;
      top: ${y}px;
      width: ${size}px;
      height: ${size}px;
      background: ${particleColor};
      border-radius: 50%;
      pointer-events: none;
      z-index: 999;
      transition: all ${duration}ms ease-out;
      opacity: 1;
      transform: translate(-50%, -50%);
    `;

    container.appendChild(particle);

    requestAnimationFrame(() => {
      particle.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      particle.style.opacity = '0';
    });

    setTimeout(() => particle.remove(), duration + 50);
  }
}

/**
 * 创建星星飘落效果（用于胜利场景）
 */
export function createStarRain(container: HTMLElement, duration = 2000): void {
  const starCount = 15;
  for (let i = 0; i < starCount; i++) {
    const star = document.createElement('div');
    const left = Math.random() * 100;
    const delay = Math.random() * (duration * 0.5);
    const size = 12 + Math.random() * 16;
    const animDuration = 1500 + Math.random() * 1000;

    star.textContent = '⭐';
    star.style.cssText = `
      position: absolute;
      left: ${left}%;
      top: -20px;
      font-size: ${size}px;
      pointer-events: none;
      z-index: 999;
      animation: starFall ${animDuration}ms ease-in ${delay}ms forwards;
      opacity: 0;
    `;

    container.appendChild(star);
    setTimeout(() => star.remove(), duration + delay + animDuration);
  }

  // Inject keyframes if not present
  if (!document.getElementById('star-rain-keyframes')) {
    const style = document.createElement('style');
    style.id = 'star-rain-keyframes';
    style.textContent = `
      @keyframes starFall {
        0% { transform: translateY(0) rotate(0deg); opacity: 1; }
        100% { transform: translateY(100vh) rotate(360deg); opacity: 0.3; }
      }
    `;
    document.head.appendChild(style);
  }
}

/**
 * 数字弹跳动画（用于分数变化）
 */
export function animateNumber(
  element: HTMLElement,
  from: number, to: number,
  duration = 300
): void {
  const startTime = performance.now();
  const diff = to - from;

  const tick = (now: number) => {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    // Ease-out cubic
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = Math.round(from + diff * eased);
    element.textContent = String(current);

    if (progress < 1) {
      requestAnimationFrame(tick);
    }
  };

  requestAnimationFrame(tick);
}

/**
 * 元素弹跳进入动画
 */
export function bounceIn(element: HTMLElement, delay = 0): void {
  element.style.opacity = '0';
  element.style.transform = 'scale(0.3)';

  setTimeout(() => {
    element.style.transition = 'transform 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55), opacity 0.3s ease';
    element.style.transform = 'scale(1)';
    element.style.opacity = '1';

    // Cleanup transition after animation
    setTimeout(() => {
      element.style.transition = '';
    }, 550);
  }, delay);
}
