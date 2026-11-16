/**
 * useRoomEvents - 坦克对决事件处理
 */
import type { RoomEventContext, WsLike } from './types';
import type {
  TankStartPayload,
  TankTickPayload,
  TankHitPayload,
  TankBoomPayload,
  TankPickupPayload,
  TankFinalPayload,
} from '../wsTypes';

export function registerTank(ws: WsLike, ctx: RoomEventContext) {
  const { gameEvents, phase } = ctx;

  ws.on('tank_start', (m: TankStartPayload) => {
    gameEvents.tankStart = m;
    gameEvents.tankTick = null;
    gameEvents.tankBoom = null;
  });

  ws.on('tank_tick', (m: TankTickPayload) => {
    gameEvents.tankTick = m;
  });

  ws.on('tank_hit', (m: TankHitPayload) => {
    gameEvents.tankHit = m;
  });

  ws.on('tank_boom', (m: TankBoomPayload) => {
    gameEvents.tankBoom = m;
  });

  ws.on('tank_pickup', (m: TankPickupPayload) => {
    gameEvents.tankPickup = m;
  });

  ws.on('tank_final', (m: TankFinalPayload) => {
    gameEvents.final = m as never;
    gameEvents.tankTick = null;
  });
}
