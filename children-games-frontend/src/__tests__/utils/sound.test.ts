import { describe, it, expect, vi, beforeEach } from 'vitest';
import { soundManager } from '../../utils/sound';

describe('soundManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should play click sound', () => {
    const playSpy = vi.spyOn(soundManager, 'playClick');
    soundManager.playClick();
    expect(playSpy).toHaveBeenCalled();
  });

  it('should play deal sound', () => {
    const playSpy = vi.spyOn(soundManager, 'playDeal');
    soundManager.playDeal();
    expect(playSpy).toHaveBeenCalled();
  });

  it('should play success sound', () => {
    const playSpy = vi.spyOn(soundManager, 'playSuccess');
    soundManager.playSuccess();
    expect(playSpy).toHaveBeenCalled();
  });

  it('should play fail sound', () => {
    const playSpy = vi.spyOn(soundManager, 'playFail');
    soundManager.playFail();
    expect(playSpy).toHaveBeenCalled();
  });

  it('should play flip sound', () => {
    const playSpy = vi.spyOn(soundManager, 'playFlip');
    soundManager.playFlip();
    expect(playSpy).toHaveBeenCalled();
  });

  it('should play chip sound', () => {
    const playSpy = vi.spyOn(soundManager, 'playChip');
    soundManager.playChip();
    expect(playSpy).toHaveBeenCalled();
  });
});
