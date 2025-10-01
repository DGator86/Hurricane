import { HurricaneLevel, LevelCandidate, LevelKind, PipelineContext } from '../pipeline/types.js';

function normalise(value: number, min: number, max: number): number {
  if (max === min) {
    return 0;
  }
  return Math.min(1, Math.max(0, (value - min) / (max - min)));
}

function classifyKind(candidate: LevelCandidate, spot: number): LevelKind {
  if (candidate.price === spot) {
    return candidate.gammaGradient >= 0 ? 'support' : 'resistance';
  }
  return candidate.price < spot ? 'support' : 'resistance';
}

export function computeGexLevels(context: PipelineContext): HurricaneLevel[] {
  const gammaDensityValues = context.candidates.map((c) => c.gammaDensity);
  const gammaGradientValues = context.candidates.map((c) => c.gammaGradient);
  const liquidityValues = context.candidates.map((c) => c.liquidityShelf);
  const pivotValues = context.candidates.map((c) => c.recentPivotAgreement);

  const densityMin = Math.min(...gammaDensityValues, 0);
  const densityMax = Math.max(...gammaDensityValues, 1);
  const gradientMin = Math.min(...gammaGradientValues, -1);
  const gradientMax = Math.max(...gammaGradientValues, 1);
  const liquidityMin = Math.min(...liquidityValues, 0);
  const liquidityMax = Math.max(...liquidityValues, 1);
  const pivotMin = Math.min(...pivotValues, 0);
  const pivotMax = Math.max(...pivotValues, 1);

  return context.candidates
    .map((candidate) => {
      const densityScore = normalise(candidate.gammaDensity, densityMin, densityMax);
      const gradientScore = normalise(Math.abs(candidate.gammaGradient), Math.abs(gradientMin), Math.abs(gradientMax));
      const liquidityScore = normalise(candidate.liquidityShelf, liquidityMin, liquidityMax);
      const pivotScore = normalise(candidate.recentPivotAgreement, pivotMin, pivotMax);

      const score = Number(((densityScore * 0.35)
        + (gradientScore * 0.25)
        + (liquidityScore * 0.25)
        + (pivotScore * 0.15)).toFixed(4));

      const sources = ['gex_density'];
      if (Math.abs(candidate.gammaGradient) > 0.1) {
        sources.push('gex_gradient');
      }
      if (candidate.liquidityShelf > liquidityMin) {
        sources.push('dark_pool');
      }
      if (candidate.recentPivotAgreement > 0.2) {
        sources.push('price_action');
      }

      return {
        price: Number(candidate.price.toFixed(2)),
        kind: classifyKind(candidate, context.spot),
        score,
        sources,
      } satisfies HurricaneLevel;
    })
    .sort((a, b) => a.price - b.price)
    .slice(0, 6);
}
