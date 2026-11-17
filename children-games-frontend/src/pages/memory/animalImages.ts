import dogSvg from '@/static/images/games/memory/dog.svg';
import catSvg from '@/static/images/games/memory/cat.svg';
import pandaSvg from '@/static/images/games/memory/panda.svg';
import foxSvg from '@/static/images/games/memory/fox.svg';
import frogSvg from '@/static/images/games/memory/frog.svg';
import monkeySvg from '@/static/images/games/memory/monkey.svg';
import pigSvg from '@/static/images/games/memory/pig.svg';
import cowSvg from '@/static/images/games/memory/cow.svg';
import chickenSvg from '@/static/images/games/memory/chicken.svg';
import octopusSvg from '@/static/images/games/memory/octopus.svg';
import lionSvg from '@/static/images/games/memory/lion.svg';
import tigerSvg from '@/static/images/games/memory/tiger.svg';
import bearSvg from '@/static/images/games/memory/bear.svg';
import koalaSvg from '@/static/images/games/memory/koala.svg';
import rabbitSvg from '@/static/images/games/memory/rabbit.svg';
import dragonSvg from '@/static/images/games/memory/dragon.svg';

/**
 * 记忆翻牌：emoji → 动物插画素材映射（2D/3D 渲染层共用，逻辑层只产 emoji）
 */
export const emojiToSvg: Record<string, string> = {
  '🐶': dogSvg,
  '🐱': catSvg,
  '🐼': pandaSvg,
  '🦊': foxSvg,
  '🐸': frogSvg,
  '🐵': monkeySvg,
  '🐷': pigSvg,
  '🐮': cowSvg,
  '🐔': chickenSvg,
  '🐙': octopusSvg,
  '🦁': lionSvg,
  '🐯': tigerSvg,
  '🐻': bearSvg,
  '🐨': koalaSvg,
  '🐰': rabbitSvg,
  '🐲': dragonSvg,
};

export const getAnimalImage = (emoji: string): string => emojiToSvg[emoji] || dogSvg;
