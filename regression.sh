#!/usr/bin/env bash
# 协议回归一键脚本：启动加速后端 → 12 套主批 → 切 rigged 模式重启跑 2 轮 → 清理 → 汇总
# 用法：
#   ./regression.sh              # 全量（12 套主批 + rigged×2）
#   ./regression.sh ws-tank      # 只跑指定套件（可多个；含 rigged 套件名则自动切模式）
# 说明：
#   - rigged 与主批互斥（BLACKJACK_RIGGED=banker 会让普通 ws-blackjack 假失败），
#     全量运行时脚本自动重启后端切换模式；结束后端会被停掉。
#   - 加速 env 集中在下方 ACCEL_ENV —— 新增对时游戏必须同步补这里（漏带 = 假失败）。
set -uo pipefail

cd "$(dirname "$0")"
BE_DIR=children-games-backend
PORT=3002
BASE="http://localhost:$PORT"
LOG=/tmp/regression-be.log

ACCEL_ENV=(
  DB_PORT=3306 ADMIN_PASSWORD=SongYuan1121
  LOGIN_RATE_MAX=1000 ADMIN_LOGIN_RATE_MAX=1000 GLOBAL_RATE_MAX=2000 REFRESH_RATE_MAX=1000
  BLACKJACK_BET_SECONDS=3 BLACKJACK_ACT_SECONDS=3 ZJH_BET_SECONDS=5
  DRAW_SECONDS=10 SPY_TALK_SECONDS=5 SPY_VOTE_SECONDS=5 REMATCH_AUTO_SECONDS=3
  TANK_MATCH_SECONDS=8 TANK_POWERUP_MS=500 TANK_FIRST_POWERUP=shield
)

MAIN_SUITES=(ws-protocol ws-quiz ws-draw ws-draw-offline ws-spy ws-uno ws-blackjack ws-zjh ws-betlog ws-quit-continue ws-tank admin-console)
RIGGED_SUITES=(ws-blackjack-rigged)

# 全局导出：套件进程与后端进程须共享同一组变量
# （ws-tank 会读 TANK_FIRST_POWERUP 断言首个道具种类，只传后端不传套件=断言错位）
export "${ACCEL_ENV[@]}"

# ---------- 基础工具 ----------
port_busy() { netstat -ano | grep ":$PORT" | grep -q LISTEN; }

kill_backend() {
  local pid
  pid=$(netstat -ano | grep ":$PORT" | grep LISTEN | head -1 | awk '{print $NF}')
  if [ -n "$pid" ]; then taskkill //F //PID "$pid" >/dev/null 2>&1 || true; fi
  for _ in 1 2 3 4 5; do port_busy || return 0; sleep 1; done
}

start_backend() { # $@ = 追加 env（如 BLACKJACK_RIGGED=banker）
  # 注意：勿用 `env VAR=x npx ...` —— 本机 Git Bash 下 env(1) exec npx 链路坏（0 字节日志静默死），用 export
  (
    cd "$BE_DIR" || exit 1
    [ $# -gt 0 ] && export "$@"
    npx ts-node src/app.ts >"$LOG" 2>&1
  ) &
  for _ in $(seq 1 40); do
    curl -sf -o /dev/null "$BASE/api/user/profiles" && return 0
    sleep 1
  done
  echo "❌ 后端 40s 未就绪，日志尾部："
  tail -30 "$LOG"
  return 1
}

run_suite() { # $1 = 套件名；输出末行汇总，失败时列出失败项
  local s=$1 out rc
  echo "── [$s] ──"
  out=$(cd "$BE_DIR" && node "tests/$s.mjs" 2>&1)
  rc=$?
  echo "$out" | tail -1
  if [ $rc -ne 0 ]; then echo "$out" | grep -E "❌|✗" | head -5; fi
  return $rc
}

trap kill_backend EXIT

# ---------- 选择套件 ----------
SELECTED=("$@")
[ ${#SELECTED[@]} -eq 0 ] && SELECTED=("${MAIN_SUITES[@]}" "${RIGGED_SUITES[@]}")
for s in "${SELECTED[@]}"; do
  [ -f "$BE_DIR/tests/$s.mjs" ] || { echo "未知套件: $s（见 $BE_DIR/tests/ws-*.mjs 与 admin-console）"; exit 2; }
done

NEED_RIGGED=0
HAS_MAIN=0
for s in "${SELECTED[@]}"; do
  case " ${RIGGED_SUITES[*]} " in *" $s "*) NEED_RIGGED=1 ;; esac
  case " ${MAIN_SUITES[*]} " in *" $s "*) HAS_MAIN=1 ;; esac
done

NAMES=()
RESULTS=()
FAIL=0

# ---------- 主批（普通模式） ----------
if [ $HAS_MAIN -eq 1 ]; then
  if port_busy; then echo "⚠️ 端口 $PORT 被占用，先释放旧进程"; kill_backend; fi
  start_backend || exit 1
  echo "🚀 后端就绪（普通模式）"
  for s in "${SELECTED[@]}"; do
    case " ${RIGGED_SUITES[*]} " in *" $s "*) continue ;; esac
    NAMES+=("$s")
    if run_suite "$s"; then RESULTS+=("✅"); else RESULTS+=("❌"); FAIL=1; fi
  done
  kill_backend
fi

# ---------- rigged 批（重启为 rigged 模式，跑 2 轮） ----------
if [ $NEED_RIGGED -eq 1 ]; then
  kill_backend
  start_backend BLACKJACK_RIGGED=banker || exit 1
  echo "🚀 后端就绪（rigged 模式）"
  for s in "${SELECTED[@]}"; do
    case " ${RIGGED_SUITES[*]} " in *" $s "*) ;; *) continue ;; esac
    for round in 1 2; do
      NAMES+=("$s#$round")
      if run_suite "$s"; then RESULTS+=("✅"); else RESULTS+=("❌"); FAIL=1; fi
    done
  done
fi

# ---------- 汇总 ----------
echo
echo "════════ 协议回归汇总 ════════"
for i in "${!NAMES[@]}"; do echo "  ${RESULTS[$i]} ${NAMES[$i]}"; done
PASS=$(printf '%s\n' "${RESULTS[@]}" | grep -c "✅" || true)
echo "────────────────────────────"
echo "合计：$PASS/${#NAMES[@]} 套通过"
exit $FAIL
