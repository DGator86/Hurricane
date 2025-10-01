import { PipelineContext, SpeedSignal } from '../pipeline/types.js';

function realisedVolatility(realised: number[]): number {
  if (!realised.length) {
    return 0;
  }
  return realised.slice(-10).reduce((acc, value) => acc + value, 0) / Math.min(realised.length, 10);
}

export function computeSpeedSignal(context: PipelineContext): SpeedSignal {
  const realised = realisedVolatility(context.realizedVolSeries);
  const ratio = context.impliedVol === 0 ? 0 : realised / context.impliedVol;
  const drivers: string[] = [];
  drivers.push(`rv:${realised.toFixed(2)}`);
  drivers.push(`iv:${context.impliedVol.toFixed(2)}`);
  drivers.push(`ratio:${ratio.toFixed(2)}`);
  drivers.push(`dvol:${(context.darkPoolVolume / 1_000_000_000).toFixed(2)}B`);

  let label: SpeedSignal['label'] = 'normal';
  if (ratio < 0.8 && context.darkPoolVolume < 5_000_000_000) {
    label = 'calm';
  } else if (ratio >= 1.2 && context.impliedVol > 20) {
    label = 'storm';
  } else if (ratio >= 1 && context.darkPoolVolume >= 8_000_000_000) {
    label = 'breezy';
  }

  return {
    label,
    drivers,
  };
}
