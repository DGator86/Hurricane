/**
 * Deterministic regime detection
 */
export function detectRegime(series: any): "Trend"|"Range"|"VolExp"|"Flux" {
  const atrPct = series.tailATR / series.tailClose;
  const adx = series.tailADX;
  const bbw = series.tailBBWidth; // (upper-lower)/mid
  
  if (atrPct > 0.015) return "VolExp";
  if (adx >= 25 && bbw < 0.05) return "Trend";
  if (bbw <= 0.03 && adx < 20) return "Range";
  return "Flux";
}