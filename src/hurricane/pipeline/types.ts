export type LevelKind = 'support' | 'resistance';

export interface HurricaneLevel {
  price: number;
  kind: LevelKind;
  score: number;
  sources: string[];
}

export interface DirectionBias {
  value: -1 | 0 | 1;
  confidence: number;
  evidence: string[];
}

export type SpeedLabel = 'calm' | 'normal' | 'breezy' | 'storm';

export interface SpeedSignal {
  label: SpeedLabel;
  drivers: string[];
}

export interface Diagnostics {
  gamma_sign: 'short' | 'long' | 'mixed';
  dix_trend: 'up' | 'down' | 'flat';
  vol_regime: 'low' | 'mid' | 'high';
}

export interface HurricaneSignal {
  generatedAt: string;
  levels: HurricaneLevel[];
  bias: DirectionBias;
  speed: SpeedSignal;
  diagnostics: Diagnostics;
}

export interface LevelCandidate {
  price: number;
  gammaDensity: number;
  gammaGradient: number;
  liquidityShelf: number;
  recentPivotAgreement: number;
}

export interface PipelineContext {
  spot: number;
  candidates: LevelCandidate[];
  dixSeries: number[];
  gammaSeries: number[];
  realizedVolSeries: number[];
  impliedVol: number;
  darkPoolVolume: number;
}

export interface PipelineOptions {
  asOf?: string;
  overrides?: Partial<PipelineContext>;
}
