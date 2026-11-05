import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useGameSounds } from '@/composables/useGameSounds';
import { useGameProgress } from '@/composables/useGameProgress';
import { useGameLifecycle } from '@/composables/useGameLifecycle';
import { getLevelOverride } from '@/api/game';
import { speak, playVoice } from '@/utils/voice';
import { defaultLevelConfig } from '@/utils/levelDefaults';

export interface Cell {
  id: number;
  r: number;
  c: number;
  kind: number;
  clearing?: boolean;
  popin?: boolean;
}

const ROWS = 8;
const COLS = 8;
// 四类主题按关卡轮换：数字/动物/植物/水果（都是小朋友认识的东西）
const THEMES: string[][] = [
  ['0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣'],
  ['🐱', '🐶', '🐰', '🐼', '🦊', '🐸'],
  ['🌳', '🌸', '🌻', '🌵', '🍀', '🍁'],
  ['🍎', '🍇', '🍉', '🍓', '🍑', '🍍'],
];

export function useMatch3Engine() {
  const router = useRouter();
  const sounds = useGameSounds();
  const { loadStartLevel, saveProgress: saveGameProgress, recordPlay } = useGameProgress('match3');

  // ── 响应式状态 ──
  const currentLevel = ref(1);
  const showResult = ref(false);
  const gameWon = ref(false);
  const stars = ref(0);
  const showLevelSelect = ref(false);
  const paused = ref(false);

  const score = ref(0);
  const movesLeft = ref(20);
  const combo = ref(1);
  const targetScore = ref(200);
  const shuffleTip = ref(false);

  const grid = ref<Cell[][]>([]);
  const selected = ref<{ r: number; c: number } | null>(null);
  const busy = ref(false);

  const levelConfig = ref<Record<string, any>>({});
  let cellIdSeq = 1;
  let gameEnded = false;

  // ── Computed ──
  const theme = computed(() => THEMES[Math.floor((currentLevel.value - 1) / 5) % THEMES.length]);
  const kindsCount = computed(() =>
    Math.min(theme.value.length, Number(levelConfig.value.kinds) || 6)
  );
  const movesUsed = computed(() => (Number(levelConfig.value.moves) || 20) - movesLeft.value);
  const flatCells = computed(() => grid.value.flat());

  const headerItems = computed(() => [
    { label: '关卡', value: `${currentLevel.value}` },
    { label: '分数', value: `${score.value}` },
    { label: '步数', value: `${movesLeft.value}` },
  ]);

  const progressPct = computed(() =>
    Math.min(100, Math.floor((score.value / Math.max(1, targetScore.value)) * 100))
  );

  // ── 棋盘构建 ──
  const makeCell = (r: number, c: number, kind?: number): Cell => ({
    id: cellIdSeq++,
    r,
    c,
    kind: kind ?? Math.floor(Math.random() * kindsCount.value),
  });

  const buildBoard = () => {
    do {
      grid.value = Array.from({ length: ROWS }, (_, r) =>
        Array.from({ length: COLS }, (_, c) => makeCell(r, c))
      );
    } while (findMatches().size > 0 || !hasAnyMove());
  };

  // ── 匹配检测 ──
  const key = (r: number, c: number): string => `${r},${c}`;

  const findMatches = (): Set<string> => {
    const matched = new Set<string>();
    // 横向
    for (let r = 0; r < ROWS; r += 1) {
      let run = 1;
      for (let c = 1; c <= COLS; c += 1) {
        const same = c < COLS && grid.value[r][c].kind === grid.value[r][c - 1].kind;
        if (same) {
          run += 1;
        } else {
          if (run >= 3) {
            for (let k = c - run; k < c; k += 1) matched.add(key(r, k));
          }
          run = 1;
        }
      }
    }
    // 纵向
    for (let c = 0; c < COLS; c += 1) {
      let run = 1;
      for (let r = 1; r <= ROWS; r += 1) {
        const same = r < ROWS && grid.value[r][c].kind === grid.value[r - 1][c].kind;
        if (same) {
          run += 1;
        } else {
          if (run >= 3) {
            for (let k = r - run; k < r; k += 1) matched.add(key(k, c));
          }
          run = 1;
        }
      }
    }
    return matched;
  };

  /** 是否存在任意一步可行的交换（用于死局检测） */
  const hasAnyMove = (): boolean => {
    for (let r = 0; r < ROWS; r += 1) {
      for (let c = 0; c < COLS; c += 1) {
        // 与右边交换
        if (c + 1 < COLS) {
          swapKinds(r, c, r, c + 1);
          const ok = findMatches().size > 0;
          swapKinds(r, c, r, c + 1);
          if (ok) return true;
        }
        // 与下边交换
        if (r + 1 < ROWS) {
          swapKinds(r, c, r + 1, c);
          const ok = findMatches().size > 0;
          swapKinds(r, c, r + 1, c);
          if (ok) return true;
        }
      }
    }
    return false;
  };

  const swapKinds = (r1: number, c1: number, r2: number, c2: number): void => {
    const a = grid.value[r1][c1];
    const b = grid.value[r2][c2];
    const tmp = a.kind;
    a.kind = b.kind;
    b.kind = tmp;
  };

  // ── 消除主循环（含连锁） ──
  const sleep = (ms: number): Promise<void> => new Promise((res) => setTimeout(res, ms));

  const resolveBoard = async (): Promise<void> => {
    combo.value = 1;
    let chain = 0;
    for (;;) {
      const matched = findMatches();
      if (matched.size === 0) break;
      chain += 1;
      combo.value = chain;

      // 计分：3 连=30、4 连=40…乘连锁倍数
      score.value += matched.size * 10 * chain;
      sounds.play('match');

      // 消除动画
      for (const row of grid.value) {
        for (const cell of row) {
          if (matched.has(key(cell.r, cell.c))) cell.clearing = true;
        }
      }
      await sleep(320);

      // 掉落 + 补位
      for (let c = 0; c < COLS; c += 1) {
        const remain: Cell[] = [];
        for (let r = ROWS - 1; r >= 0; r -= 1) {
          if (!matched.has(key(r, c))) remain.push(grid.value[r][c]);
        }
        for (let r = ROWS - 1, i = 0; r >= 0; r -= 1, i += 1) {
          if (i < remain.length) {
            const cell = remain[i];
            cell.r = r;
            grid.value[r][c] = cell;
          } else {
            const fresh = makeCell(r, c);
            fresh.popin = true;
            grid.value[r][c] = fresh;
          }
        }
      }
      await sleep(260);

      if (score.value >= targetScore.value) {
        winGame();
        return;
      }
    }
    combo.value = 1;

    // 死局：自动洗牌
    let guard = 0;
    while (!hasAnyMove() && guard < 50) {
      shuffleBoard();
      guard += 1;
    }
    if (guard > 0) {
      shuffleTip.value = true;
      sounds.play('match');
      setTimeout(() => (shuffleTip.value = false), 1800);
      await sleep(400);
    }

    // 步数耗尽仍未达标 → 失败
    if (movesLeft.value <= 0 && score.value < targetScore.value) {
      loseGame();
    }
  };

  const shuffleBoard = (): void => {
    // 重排到「无现成匹配」（循环而非递归，避免低种类数时深递归）
    for (let attempt = 0; attempt < 500; attempt += 1) {
      const kinds: number[] = [];
      for (const row of grid.value) for (const cell of row) kinds.push(cell.kind);
      for (let i = kinds.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [kinds[i], kinds[j]] = [kinds[j], kinds[i]];
      }
      let idx = 0;
      for (let r = 0; r < ROWS; r += 1) {
        for (let c = 0; c < COLS; c += 1) {
          grid.value[r][c].kind = kinds[idx++];
        }
      }
      if (findMatches().size === 0) return;
    }
  };

  // ── 交互 ──
  const isSelected = (r: number, c: number): boolean =>
    selected.value?.r === r && selected.value?.c === c;
  const isNeighborOfSelected = (r: number, c: number): boolean => {
    if (!selected.value) return false;
    return Math.abs(selected.value.r - r) + Math.abs(selected.value.c - c) === 1;
  };

  const tapCell = async (r: number, c: number): Promise<void> => {
    if (busy.value || paused.value || gameEnded) return;
    sounds.play('pop');
    if (!selected.value) {
      selected.value = { r, c };
      return;
    }
    if (selected.value.r === r && selected.value.c === c) {
      selected.value = null;
      return;
    }
    const dist = Math.abs(selected.value.r - r) + Math.abs(selected.value.c - c);
    if (dist !== 1) {
      selected.value = { r, c };
      return;
    }

    const { r: r1, c: c1 } = selected.value;
    selected.value = null;
    swapKinds(r1, c1, r, c);
    if (findMatches().size === 0) {
      // 无效交换：换回来提示
      sounds.play('fail');
      swapKinds(r1, c1, r, c);
      return;
    }

    busy.value = true;
    movesLeft.value -= 1; // 有效交换才扣步
    if (movesLeft.value === 5) {
      sounds.play('fail');
      speak('只剩五步啦，抓紧时间！');
    }
    await resolveBoard();
    if (!gameEnded) {
      busy.value = false;
    }
  };

  // ── 胜负 ──
  const winGame = () => {
    gameEnded = true;
    busy.value = false;
    gameWon.value = true;
    const left = movesLeft.value;
    stars.value = left >= 8 ? 3 : left >= 4 ? 2 : 1;
    sounds.play('success');
    showResult.value = true;
    // 胜局计入场次与胜场（保存进度）；失败局由 loseGame 记一局游玩
    // 成绩 = 用掉的步数（越小越好，进排行榜/星级体系）
    saveGameProgress({ level: currentLevel.value, score: movesUsed.value, stars: stars.value });
  };

  const loseGame = () => {
    gameEnded = true;
    busy.value = false;
    gameWon.value = false;
    stars.value = 0;
    sounds.play('fail');
    showResult.value = true;
    recordPlay();
  };

  // ── 关卡装载 ──
  const setupLevel = (level: number) => {
    const defaults = defaultLevelConfig('match3', level);
    levelConfig.value = { ...defaults };
    gameEnded = false;
    showResult.value = false;
    selected.value = null;
    busy.value = false;
    score.value = 0;
    combo.value = 1;
    movesLeft.value = Number(defaults.moves) || 20;
    targetScore.value = Number(defaults.targetScore) || 200;
    buildBoard();
  };

  const applyLevelConfig = async (level: number) => {
    const defaults = defaultLevelConfig('match3', level);
    try {
      const remote = await getLevelOverride('match3', level);
      levelConfig.value = { ...defaults, ...(remote || {}) };
    } catch {
      levelConfig.value = { ...defaults };
    }
    gameEnded = false;
    showResult.value = false;
    selected.value = null;
    busy.value = false;
    score.value = 0;
    combo.value = 1;
    movesLeft.value = Number(levelConfig.value.moves) || 20;
    targetScore.value = Number(levelConfig.value.targetScore) || 200;
    buildBoard();
    // 有家长录音播固定 intro（自动打断 TTS），无录音回退 TTS 播带关卡信息的动态文案
    playVoice(
      'match3_intro',
      `第 ${level} 关，凑够 ${targetScore.value} 分就赢啦！交换相邻的两个小图，三个连成一排就能消除`
    );
  };

  const restartGame = () => setupLevel(currentLevel.value);
  const nextLevel = async () => {
    currentLevel.value += 1;
    await applyLevelConfig(currentLevel.value);
  };
  const chooseLevel = async (lv: number) => {
    currentLevel.value = lv;
    showLevelSelect.value = false;
    await applyLevelConfig(lv);
  };

  // ── 暂停/护眼 ──
  const pauseGame = () => (paused.value = true);
  const resumeGame = () => (paused.value = false);
  const quitGame = () => router.back();
  // 系统自动暂停（切后台 / 护眼休息）与用户主动暂停的区分
  let autoPausedByRest = false;

  const handlePause = () => {
    if (!paused.value) {
      autoPausedByRest = true;
      pauseGame();
    }
  };

  const handleResume = () => {
    if (autoPausedByRest) {
      autoPausedByRest = false;
      resumeGame();
    }
  };

  useGameLifecycle({ onPause: handlePause, onResume: handleResume });

  const onMountedSetup = async () => {
    const start = await loadStartLevel();
    currentLevel.value = start;
    await applyLevelConfig(start);
  };

  return {
    // 状态
    currentLevel,
    score,
    movesLeft,
    combo,
    targetScore,
    showResult,
    gameWon,
    stars,
    showLevelSelect,
    paused,
    shuffleTip,

    // 棋盘
    grid,
    selected,
    busy,

    // Computed
    theme,
    kindsCount,
    movesUsed,
    flatCells,
    headerItems,
    progressPct,

    // 方法
    isSelected,
    isNeighborOfSelected,
    tapCell,
    pauseGame,
    resumeGame,
    quitGame,
    chooseLevel,
    nextLevel,
    restartGame,

    // 生命周期
    onMountedSetup,

    // 依赖（模板访问）
    sounds,
  };
}
