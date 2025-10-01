import { DirectionBias, HurricaneLevel, PipelineContext } from '../pipeline/types.js';

function computeGammaSlope(series: number[]): number {
  if (series.length < 2) {
    return 0;
  }
  const window = series.slice(-5);
  const first = window[0];
  const last = window[window.length - 1];
  return last - first;
}

function computeDixTrend(series: number[]): number {
  if (series.length < 2) {
    return 0;
  }
  const window = series.slice(-5);
  let slope = 0;
  for (let i = 1; i < window.length; i += 1) {
    slope += window[i] - window[i - 1];
  }
  return slope / Math.max(window.length - 1, 1);
}

export function computeDirectionBias(context: PipelineContext, levels: HurricaneLevel[]): DirectionBias {
  const gammaSlope = computeGammaSlope(context.gammaSeries);
  const dixTrend = computeDixTrend(context.dixSeries);
  const proximityAdjustment = (() => {
    if (!levels.length) {
      return 0;
    }
    const nearest = levels.reduce((prev, level) => {
      const prevDist = Math.abs(prev.price - context.spot);
      const dist = Math.abs(level.price - context.spot);
      return dist < prevDist ? level : prev;
    });
    return nearest.kind === 'support' ? 0.1 : -0.1;
  })();

  const rawBias = gammaSlope + (dixTrend * 2) + proximityAdjustment;
  const value: -1 | 0 | 1 = rawBias > 0.2 ? 1 : rawBias < -0.2 ? -1 : 0;
  const confidence = Math.min(1, Math.max(0, 0.5 + (Math.abs(rawBias) * 2)));

  const evidence: string[] = [];
  evidence.push(`gamma_slope:${gammaSlope.toFixed(2)}`);
  evidence.push(`dix_trend:${dixTrend.toFixed(2)}`);
  evidence.push(`level_context:${proximityAdjustment >= 0 ? 'support' : 'resistance'}`);

  return {
    value,
    confidence: Number(confidence.toFixed(2)),
    evidence,
  };
}
