/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { minimalReplayRequest, savePendingCashOrder, readPendingCashOrder, PENDING_CASH_ORDER_BASE_KEY } from "@/features/payments/services/pendingCashOrder";
import { configureAuthUidSource, scopedStorageKey } from "@/features/auth/utils/scopedPersistence";
import type { CashOrderRequest } from "@/features/payments/services/cashOrderService";

let uid="u1"; const listeners=new Set<(s:any)=>void>();
function setUid(v:string){uid=v;for(const l of listeners)l({user:{id:v}})}
beforeEach(()=>{localStorage.clear();configureAuthUidSource({getUid:()=>uid,subscribe:(l:any)=>{listeners.add(l);return()=>listeners.delete(l)}});setUid("u1")});

const base: CashOrderRequest={
  orderId:"o1",orderType:"delivery",items:[{productId:"p1",quantity:1,modifiers:[{id:"opt1",name:"Cheese",priceDelta:999}]}],
  expectedTotalPaise:11900,addressId:"addr_1",address:{line1:"Secret street",contactPhone:"9999999999"},
} as never;

it('keeps addressId but not the full address for a pre-write delivery retry',()=>{
  const replay=minimalReplayRequest(base);
  expect(replay.addressId).toBe('addr_1');
  expect(JSON.stringify(replay)).not.toContain('Secret street');
});

it('never persists an arbitrary object nested inside a selection id',()=>{
  expect(()=>minimalReplayRequest({...base,items:[{productId:'p1',quantity:1,modifiers:[{id:{privateNote:'private fixture'}}]}]})).toThrow();
  expect(localStorage.length).toBe(0);
});

describe("r3 privacy and account isolation",()=>{
 it("stores only typed selection ids and fulfilment references",()=>{
  const raw=JSON.stringify(minimalReplayRequest(base));
  expect(raw).toContain("opt1"); expect(raw).toContain("addr_1");
  for(const s of ["Cheese","Secret street","9999999999","priceDelta"])expect(raw).not.toContain(s);
 });
 it("pins the uid and replays the same attempt across tabs",()=>{
  const r=savePendingCashOrder("a1",base.orderId,base);
  expect(r.uid).toBe("u1"); expect(readPendingCashOrder()?.attemptId).toBe("a1");
  const other=savePendingCashOrder("a1",base.orderId,base);
  expect(other.attemptId).toBe("a1");
 });
 it("isolates on account switch",()=>{
  savePendingCashOrder("a1",base.orderId,base);
  const key=scopedStorageKey(PENDING_CASH_ORDER_BASE_KEY,"u1");
  expect(localStorage.getItem(key)).not.toBeNull();
  setUid("u2");
  expect(localStorage.getItem(key)).toBeNull();
 });
 it("keeps dine-in table id for a pre-write retry",()=>{
  const dine={...base,orderType:"dinein",tableNumber:"T4"} as CashOrderRequest;
  const replay=minimalReplayRequest(dine);
  expect(replay.tableNumber).toBe("T4");
 });
});
