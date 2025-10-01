import { computeDirectionBias } from '../bias/directionBias.js';
import { computeGexLevels } from '../gex/gexLevels.js';
import { computeSpeedSignal } from '../speed/speedModel.js';
import {
  Diagnostics,
  HurricaneSignal,
  PipelineContext,
  PipelineOptions,
} from './types.js';

function defaultContext(): PipelineContext {
  const spot = 438.52;
  return {
    spot,
    candidates: [
      { price: 432, gammaDensity: 1.8, gammaGradient: 0.3, liquidityShelf: 1.1, recentPivotAgreement: 0.6 },
      { price: 435, gammaDensity: 2.1, gammaGradient: 0.1, liquidityShelf: 0.9, recentPivotAgreement: 0.7 },
      { price: 440, gammaDensity: 1.6, gammaGradient: -0.4, liquidityShelf: 1.4, recentPivotAgreement: 0.4 },
      { price: 444, gammaDensity: 1.2, gammaGradient: -0.6, liquidityShelf: 0.8, recentPivotAgreement: 0.2 },
    ],
    dixSeries: [44.5, 45.2, 45.9, 46.3, 46.8],
    gammaSeries: [-1.2, -1.05, -0.92, -0.85, -0.74],
    realizedVolSeries: [12.1, 11.8, 12.4, 13.6, 14.2, 13.9, 13.1],
    impliedVol: 17.8,
    darkPoolVolume: 9_200_000_000,
  };
}

function deriveDiagnostics(context: PipelineContext, biasValue: -1 | 0 | 1): Diagnostics {
  const gammaSign = context.gammaSeries[context.gammaSeries.length - 1];
  const diagnostics: Diagnostics = {
    gamma_sign: gammaSign < -0.2 ? 'short' : gammaSign > 0.2 ? 'long' : 'mixed',
    dix_trend: (() => {
      const diffs = context.dixSeries.slice(1).map((value, index) => value - context.dixSeries[index]);
      const avg = diffs.reduce((acc, value) => acc + value, 0) / Math.max(diffs.length, 1);
      if (avg > 0.05) return 'up';
      if (avg < -0.05) return 'down';
      return 'flat';
    })(),
    vol_regime: (() => {
      if (context.impliedVol < 15) return 'low';
      if (context.impliedVol > 25) return 'high';
      return 'mid';
    })(),
  };

  if (biasValue === 1 && diagnostics.gamma_sign === 'short') {
    diagnostics.gamma_sign = 'short';
  }

  return diagnostics;
}

export async function runPaper(options: PipelineOptions = {}): Promise<HurricaneSignal> {
  const base = defaultContext();
  const context = {
    ...base,
    ...options.overrides,
    candidates: options.overrides?.candidates ?? base.candidates,
  } satisfies PipelineContext;

  const generatedAt = options.asOf ?? new Date().toISOString();
  const levels = computeGexLevels(context);
  const bias = computeDirectionBias(context, levels);
  const speed = computeSpeedSignal(context);
  const diagnostics = deriveDiagnostics(context, bias.value);

  return {
    generatedAt,
    levels,
    bias,
    speed,
    diagnostics,
  };
}
