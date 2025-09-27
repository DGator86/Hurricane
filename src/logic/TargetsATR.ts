import type { TF } from "../core/types";

const MULT = { "1m":1.5, "15m":2.0, "1h":3.0, "4h":4.0, "1d":5.0 } as const;
const FLOOR = { "1m":0.0005, "15m":0.0015, "1h":0.0025, "4h":0.0040, "1d":0.0075 } as const;

export function atrTargetsAndStops(series:any, fusedSide:number, entry:number, tf:TF){
  const atrRaw = series.tailATR;
  const px = entry ?? series.tailClose;
  const atr = Math.max(atrRaw, FLOOR[tf]*px);
  const m = MULT[tf];
  const dir = fusedSide >= 0 ? +1 : -1;

  const target = px + dir * m * atr;
  const stop   = px - dir * 1.0 * atr;
  const reward = Math.abs(target - px);
  const risk   = Math.abs(px - stop);
  const rr = reward / Math.max(risk, 1e-6);
  const suggestedStrike = Math.round(target); // simple; replace with chain-aware rounding

  return { targets: { target }, stop, rMultiple: { reward, risk, rr }, suggestedStrike, rewardRisk: rr };
}

export function buildCone(series:any, fused:any){
  const med = series.modelMedianNextClose; // from ensemble
  const bands = series.modelBands;         // {p50Low, p50High, ...}
  return {
    median: med,
    p50_low: bands.p50Low, p50_high: bands.p50High,
    p80_low: bands.p80Low, p80_high: bands.p80High,
    p95_low: bands.p95Low, p95_high: bands.p95High,
  };
}