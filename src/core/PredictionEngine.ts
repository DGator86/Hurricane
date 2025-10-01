// Core orchestrator for Hurricane SPY
import { loadTF } from "../data/TimeframeDataLoader";
import { fuseSignals } from "../logic/SignalFusion";
import { healthSuite } from "../monitoring/HealthChecks";
import { buildCone, atrTargetsAndStops } from "../logic/TargetsATR";
import { fractionalKelly } from "../risk/Kelly";
import { detectRegime } from "../logic/Regime";
import type { TF, Cone, PredictionResult } from "./types";

const TFS: TF[] = ["1m","15m","1h","4h","1d"];

export async function predictAll(symbol: string, asof: Date) {
  const perTF = await Promise.all(
    TFS.map(async tf => {
      const series = await loadTF(symbol, tf, asof);               // unique bars + indicators per TF
      const regime = detectRegime(series);                          // deterministic fallback regime
      const features = series.tailFeatures;                         // last row of normalized features
      const baseSignals = series.modelSignals;                      // per-model signed outputs (+1/0/-1)
      const fused = fuseSignals(baseSignals, regime);               // democracy + weights + caps
      const entryPx = series.nextSessionOpen;                       // for backtests, else real-time best bid/ask
      const cone: Cone = buildCone(series, fused);                  // median + p50/p80/p95
      const atrPack = atrTargetsAndStops(series, fused.side, entryPx, tf);
      const rewardRisk = atrPack?.rewardRisk ?? 0;
      const kelly = fractionalKelly(fused.confidence, rewardRisk, regime);
      const size = atrPack ? Math.min(kelly.fraction, kelly.maxCap) : 0;

      const optionSide = fused.side === +1 ? "CALL" : (fused.side === -1 ? "PUT" : "NONE");
      const option: PredictionResult["option"] = {
        side: optionSide,
        strike: atrPack?.suggestedStrike ?? null,
        dte: tf === "1m" ? 0 : (tf === "1h" ? 0 : 5),
      };

      const out: PredictionResult = {
        tf,
        regime,
        confidence: fused.confidence,
        side: option.side,
        cone,
        entryPx,
        targets: atrPack?.targets ?? null,
        stop: atrPack?.stop ?? null,
        rMultiple: atrPack?.rMultiple ?? { reward: 0, risk: 0, rr: 0 },
        size,
        option,
      };
      return out;
    })
  );

  // health metrics (fast; no network)
  const health = healthSuite.check(perTF);

  // top-level fusion (multi-TF coherence -> final signal)
  const final = fuseSignals(perTF.map(x => ({side: x.side==="CALL"?+1:x.side==="PUT"?-1:0, conf: x.confidence})), 
                            /*regime not needed for aggregate*/ "Aggregate");

  return { perTF, final, health };
}