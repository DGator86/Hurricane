export type TF = "1m"|"15m"|"1h"|"4h"|"1d";

export type Cone = {
  median: number,
  p50_low: number, p50_high: number,
  p80_low: number, p80_high: number,
  p95_low: number, p95_high: number,
};

export type PredictionResult = {
  tf: TF,
  regime: string,
  confidence: number,
  side: "CALL"|"PUT"|"NONE",
  cone: Cone,
  entryPx: number,
  targets: { target: number } | null,  // or { long:number, short:number } if you prefer
  stop: number | null,
  rMultiple: { reward:number, risk:number, rr:number },
  size: number,
  option: { side:"CALL"|"PUT"|"NONE", strike:number|null, dte:number }
};
