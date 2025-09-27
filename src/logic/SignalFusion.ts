import { 
  generateSignals,
  fuseSignals as originalFuseSignals,
  FusedSignal
} from "../services/SignalFusion";

const MAX_WEIGHT = 0.20;  // Cap any signal influence

/**
 * Wrapper calling your fusion with simplified interface
 */
export function fuseSignals(
  subs: {side:number, conf?:number}[] | number[], 
  regime: string
): { side: number; confidence: number } {
  
  // Convert to array format
  const arr = Array.isArray(subs) && typeof subs[0] === "number"
    ? (subs as number[]).map(s => ({side: s}))
    : (subs as {side:number, conf?:number}[]);

  // Apply regime weights
  const weights = regimeWeights(regime);
  
  // Cap weights and calculate
  const capped = arr.map((s, i) => 
    boundedWeight(weights[i] ?? 0.1) * Math.sign(s.side || 0)
  );
  
  // Democratic vote
  const majority = vote(arr.map(s => Math.sign(s.side || 0)));

  // Blend democracy with weighted average
  const avg = capped.reduce((a, b) => a + b, 0) / (capped.length || 1);
  const side = Math.sign(avg + 0.5 * majority);  // Tie-break toward vote
  
  // Calculate confidence based on agreement
  const agreement = Math.abs(avg) / (capped.length * MAX_WEIGHT);  // 0..1
  const confidence = Math.min(0.95, 0.55 + 0.35 * agreement);  // 0.55..0.90 range

  return { side, confidence };
}

/**
 * Bounded weight to prevent single-indicator dominance
 */
function boundedWeight(weight: number): number {
  return Math.sign(weight) * Math.min(Math.abs(weight), MAX_WEIGHT);
}

/**
 * Vote on direction
 */
function vote(signals: number[]): number {
  const bullish = signals.filter(s => s > 0).length;
  const bearish = signals.filter(s => s < 0).length;
  const MIN_CONFIRMATIONS = 3;
  
  if (bullish >= MIN_CONFIRMATIONS && bullish > bearish) return +1;
  if (bearish >= MIN_CONFIRMATIONS && bearish > bullish) return -1;
  return 0;
}

/**
 * Get regime-specific weights
 */
function regimeWeights(regime: string): number[] {
  // Base weights for 5 sub-models
  let weights = [0.2, 0.2, 0.2, 0.2, 0.2];
  
  switch (regime) {
    case "Trend":
      // Boost momentum signals
      weights = [0.15, 0.25, 0.25, 0.2, 0.15];  // More weight to MACD/ADX
      break;
    case "Range":
      // Boost mean reversion
      weights = [0.25, 0.15, 0.15, 0.25, 0.2];  // More weight to RSI/BB
      break;
    case "VolExp":
      // Reduce all weights
      weights = weights.map(w => w * 0.7);
      break;
    case "Flux":
      // Conservative
      weights = weights.map(w => w * 0.8);
      break;
  }
  
  return weights;
}