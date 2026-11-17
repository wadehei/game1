/**
 * SVG 程序化生成扑克牌面
 * 零外部图片依赖，纯代码生成
 */

import { Card, Suit, CardValue } from '../utils/types';
import { getCardDisplayName, getSuitSymbol, getSuitColor } from '../utils/deck';

/**
 * 生成单张牌的 SVG 字符串
 */
export function renderCardSVG(card: Card, width: number = 60, height: number = 84): string {
  const displayName = getCardDisplayName(card.value);
  const suitSymbol = getSuitSymbol(card.suit);
  const color = getSuitColor(card.suit);
  const fillColor = color === 'red' ? '#e53935' : '#212121';

  // 王牌特殊处理
  if (card.suit === Suit.Joker) {
    return renderJokerSVG(card.value === 16, width, height);
  }

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <!-- 牌背景 -->
  <rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="4" ry="4"
        fill="white" stroke="#bbb" stroke-width="1"/>

  <!-- 左上角 -->
  <text x="6" y="14" font-family="Arial, sans-serif" font-size="11" font-weight="bold"
        fill="${fillColor}">${displayName}</text>
  <text x="6" y="26" font-family="Arial, sans-serif" font-size="10"
        fill="${fillColor}">${suitSymbol}</text>

  <!-- 中心图案 -->
  <text x="${width / 2}" y="${height / 2 + 8}" font-family="Arial, sans-serif" font-size="28"
        text-anchor="middle" fill="${fillColor}">${suitSymbol}</text>

  <!-- 右下角（倒置） -->
  <g transform="translate(${width - 6}, ${height - 6}) rotate(180)">
    <text x="0" y="-12" font-family="Arial, sans-serif" font-size="11" font-weight="bold"
          fill="${fillColor}" text-anchor="start">${displayName}</text>
    <text x="0" y="0" font-family="Arial, sans-serif" font-size="10"
          fill="${fillColor}" text-anchor="start">${suitSymbol}</text>
  </g>
</svg>`;

  return svg.trim();
}

/**
 * 生成王牌 SVG
 */
function renderJokerSVG(isBig: boolean, width: number, height: number): string {
  const color = isBig ? '#e53935' : '#333';
  const text = isBig ? '大' : '小';
  const starColor = isBig ? '#ffd700' : '#c0c0c0';

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <!-- 牌背景 -->
  <rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="4" ry="4"
        fill="white" stroke="#bbb" stroke-width="1"/>

  <!-- 中心星星 -->
  <polygon points="${width / 2},${height / 2 - 15} ${width / 2 + 8},${height / 2} ${width / 2 + 20},${height / 2 + 5} ${width / 2 + 10},${height / 2 + 12} ${width / 2 + 14},${height / 2 + 25} ${width / 2},${height / 2 + 18} ${width / 2 - 14},${height / 2 + 25} ${width / 2 - 10},${height / 2 + 12} ${width / 2 - 20},${height / 2 + 5} ${width / 2 - 8},${height / 2}"
           fill="${starColor}" stroke="${color}" stroke-width="1"/>

  <!-- 文字 -->
  <text x="${width / 2}" y="${height / 2 + 40}" font-family="Arial, sans-serif" font-size="14"
        font-weight="bold" text-anchor="middle" fill="${color}">${text}王</text>

  <!-- 左上角 -->
  <text x="6" y="16" font-family="Arial, sans-serif" font-size="10" font-weight="bold"
        fill="${color}">${text}</text>

  <!-- 右下角（倒置） -->
  <g transform="translate(${width - 6}, ${height - 6}) rotate(180)">
    <text x="0" y="-4" font-family="Arial, sans-serif" font-size="10" font-weight="bold"
          fill="${color}" text-anchor="start">${text}</text>
  </g>
</svg>`;

  return svg.trim();
}

/**
 * 生成牌背 SVG
 */
export function renderCardBackSVG(width: number = 60, height: number = 84): string {
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <defs>
    <pattern id="cardBackPattern" x="0" y="0" width="12" height="12" patternUnits="userSpaceOnUse">
      <circle cx="6" cy="6" r="2" fill="rgba(255,255,255,0.3)"/>
    </pattern>
    <linearGradient id="cardBackGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1565c0"/>
      <stop offset="50%" stop-color="#1976d2"/>
      <stop offset="100%" stop-color="#1565c0"/>
    </linearGradient>
  </defs>

  <!-- 牌背景 -->
  <rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="4" ry="4"
        fill="url(#cardBackGradient)" stroke="#0d47a1" stroke-width="1"/>

  <!-- 纹理 -->
  <rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="4" ry="4"
        fill="url(#cardBackPattern)"/>

  <!-- 内边框 -->
  <rect x="5" y="5" width="${width - 10}" height="${height - 10}" rx="2" ry="2"
        fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="1" stroke-dasharray="4,2"/>

  <!-- 中心装饰 -->
  <circle cx="${width / 2}" cy="${height / 2}" r="12" fill="none" stroke="rgba(255,255,255,0.6)" stroke-width="1.5"/>
  <text x="${width / 2}" y="${height / 2 + 5}" font-family="Arial, sans-serif" font-size="12"
        text-anchor="middle" fill="rgba(255,255,255,0.8)">★</text>
</svg>`;

  return svg.trim();
}

/**
 * 将 SVG 字符串转换为 data URL
 */
export function svgToDataUrl(svg: string): string {
  const encoded = encodeURIComponent(svg);
  return `data:image/svg+xml;charset=utf-8,${encoded}`;
}

/**
 * 生成牌的 data URL（可直接用于 img src）
 */
export function getCardImageUrl(card: Card, width?: number, height?: number): string {
  return svgToDataUrl(renderCardSVG(card, width, height));
}

/**
 * 生成牌背的 data URL
 */
export function getCardBackImageUrl(width?: number, height?: number): string {
  return svgToDataUrl(renderCardBackSVG(width, height));
}

/**
 * Vue 组件中使用的内联 SVG 样式
 */
export function getCardInlineStyles(card: Card): Record<string, string> {
  const color = getSuitColor(card.suit);
  return {
    color: color === 'red' ? '#e53935' : '#212121',
  };
}

/**
 * 花色颜色常量
 */
export const SUIT_COLORS = {
  spade: '#212121',
  heart: '#e53935',
  diamond: '#e53935',
  club: '#212121',
  joker: '#333',
} as const;

/**
 * 生成响应式牌面组件的数据
 */
export interface CardRenderData {
  value: CardValue;
  suit: Suit;
  displayName: string;
  suitSymbol: string;
  color: string;
  isJoker: boolean;
  isBigJoker: boolean;
}

export function getCardRenderData(card: Card): CardRenderData {
  return {
    value: card.value,
    suit: card.suit,
    displayName: getCardDisplayName(card.value),
    suitSymbol: getSuitSymbol(card.suit),
    color: getSuitColor(card.suit) === 'red' ? '#e53935' : '#212121',
    isJoker: card.suit === Suit.Joker,
    isBigJoker: card.value === 17,
  };
}
