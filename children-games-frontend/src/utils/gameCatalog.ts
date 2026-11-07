import iconMemorySvg from '@/static/images/games/lobby/icon-memory.svg';
import iconFruitSvg from '@/static/images/games/lobby/icon-fruit.svg';
import iconPuzzleSvg from '@/static/images/games/lobby/icon-puzzle.svg';
import iconBalloonSvg from '@/static/images/games/lobby/icon-balloon.svg';
import iconTankSvg from '@/static/images/games/lobby/icon-tank.svg';
import iconMoleSvg from '@/static/images/games/lobby/icon-mole.svg';
import iconSimonSvg from '@/static/images/games/lobby/icon-simon.svg';
import iconMathSvg from '@/static/images/games/lobby/icon-math.svg';
import iconMatchSvg from '@/static/images/games/lobby/icon-match.svg';
import iconMatch3Svg from '@/static/images/games/lobby/icon-match3.svg';
import iconBrickSvg from '@/static/images/games/lobby/icon-brick.svg';
import iconSudokuSvg from '@/static/images/games/lobby/icon-sudoku.svg';
import iconClawSvg from '@/static/images/games/lobby/icon-claw.svg';

export interface GameCatalogItem {
  id: string;
  name: string;
  totalLevels: number;
  icon: string;
  bgColor: string;
}

export const games: readonly GameCatalogItem[] = [
  {
    id: 'memory',
    name: '记忆翻牌',
    totalLevels: 20,
    icon: iconMemorySvg,
    bgColor: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  },
  {
    id: 'fruit',
    name: '接水果',
    totalLevels: 30,
    icon: iconFruitSvg,
    bgColor: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
  },
  {
    id: 'puzzle',
    name: '拼图游戏',
    totalLevels: 25,
    icon: iconPuzzleSvg,
    bgColor: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
  },
  {
    id: 'balloon',
    name: '打气球',
    totalLevels: 30,
    icon: iconBalloonSvg,
    bgColor: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
  },
  {
    id: 'tank',
    name: '坦克大战',
    totalLevels: 25,
    icon: iconTankSvg,
    bgColor: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
  },
  {
    id: 'mole',
    name: '打地鼠',
    totalLevels: 20,
    icon: iconMoleSvg,
    bgColor: 'linear-gradient(135deg, #a8e063 0%, #56ab2f 100%)',
  },
  {
    id: 'simon',
    name: '音乐记忆',
    totalLevels: 15,
    icon: iconSimonSvg,
    bgColor: 'linear-gradient(135deg, #1a1a2e 0%, #5f27cd 100%)',
  },
  {
    id: 'math',
    name: '数学小怪兽',
    totalLevels: 20,
    icon: iconMathSvg,
    bgColor: 'linear-gradient(135deg, #43C59E 0%, #2d9d7a 100%)',
  },
  {
    id: 'match',
    name: '快乐连线',
    totalLevels: 20,
    icon: iconMatchSvg,
    bgColor: 'linear-gradient(135deg, #a18cd1 0%, #7c3aed 100%)',
  },
  {
    id: 'match3',
    name: '消消乐',
    totalLevels: 20,
    icon: iconMatch3Svg,
    bgColor: 'linear-gradient(135deg, #ff9966 0%, #ff5e62 100%)',
  },
  {
    id: 'brick',
    name: '打砖块',
    totalLevels: 20,
    icon: iconBrickSvg,
    bgColor: 'linear-gradient(135deg, #4D96FF 0%, #6BCB77 100%)',
  },
  {
    id: 'sudoku',
    name: '动物数独',
    totalLevels: 20,
    icon: iconSudokuSvg,
    bgColor: 'linear-gradient(135deg, #f6b862 0%, #e8874d 100%)',
  },
  {
    id: 'claw',
    name: '抓娃娃机',
    totalLevels: 20,
    icon: iconClawSvg,
    bgColor: 'linear-gradient(135deg, #f66d9b 0%, #c2429c 100%)',
  },
];
