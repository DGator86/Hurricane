import { TF } from "../core/types";
import { 
  loadTF as originalLoadTF, 
  computeIndicatorsPerTF,
  TFData,
  OHLCV
} from "../services/TimeframeDataLoader";

// Re-export key types
export type { OHLCV, TFData } from "../services/TimeframeDataLoader";

/**
 * Wrapper to adapt your detailed loader to the simplified interface
 */
export async function loadTF(symbol: string, tf: TF, asof: Date) {
  // Use your Yahoo Finance or Polygon fetcher
  const dataFetcher = async (sym: string, timeframe: TF, lookback: number): Promise<OHLCV[]> => {
    // This would connect to your actual data source
    // For now, return synthetic data for testing
    const bars: OHLCV[] = [];
    const now = asof.getTime();
    const intervalMs = getIntervalMs(timeframe);
    
    for (let i = lookback; i > 0; i--) {
      const timestamp = now - (i * intervalMs);
      const basePrice = 650 + Math.sin(i / 10) * 5; // Synthetic SPY around 650
      bars.push({
        timestamp,
        open: basePrice + Math.random() * 2 - 1,
        high: basePrice + Math.random() * 3,
        low: basePrice - Math.random() * 3,
        close: basePrice + Math.random() * 2 - 1,
        volume: 1000000 + Math.random() * 500000
      });
    }
    return bars;
  };
  
  // Load TF data with all indicators
  const tfData = await originalLoadTF(symbol, tf, asof, dataFetcher);
  
  // Extract model signals (simplified - in reality these come from your sub-models)
  const modelSignals = generateModelSignals(tfData);
  
  // Format for PredictionEngine
  return {
    series: tfData.candles,
    tailFeatures: tfData.features,
    modelSignals,
    nextSessionOpen: tfData.candles[tfData.candles.length - 1]?.close || 650,
    
    // Additional fields needed by other modules
    tailATR: tfData.indicators.atr,
    tailClose: tfData.candles[tfData.candles.length - 1]?.close || 650,
    tailADX: tfData.indicators.adx,
    tailBBWidth: tfData.indicators.bb.width,
    
    // Cone data (simplified)
    modelMedianNextClose: tfData.candles[tfData.candles.length - 1]?.close || 650,
    modelBands: {
      p50Low: (tfData.candles[tfData.candles.length - 1]?.close || 650) * 0.998,
      p50High: (tfData.candles[tfData.candles.length - 1]?.close || 650) * 1.002,
      p80Low: (tfData.candles[tfData.candles.length - 1]?.close || 650) * 0.995,
      p80High: (tfData.candles[tfData.candles.length - 1]?.close || 650) * 1.005,
      p95Low: (tfData.candles[tfData.candles.length - 1]?.close || 650) * 0.99,
      p95High: (tfData.candles[tfData.candles.length - 1]?.close || 650) * 1.01,
    }
  };
}

function getIntervalMs(tf: TF): number {
  const map: Record<TF, number> = {
    "1m": 60 * 1000,
    "15m": 15 * 60 * 1000,
    "1h": 60 * 60 * 1000,
    "4h": 4 * 60 * 60 * 1000,
    "1d": 24 * 60 * 60 * 1000
  };
  return map[tf];
}

function generateModelSignals(tfData: TFData): number[] {
  // Generate diverse signals based on indicators
  const signals: number[] = [];
  const { indicators } = tfData;
  
  // RSI signal
  if (indicators.rsi < 30) signals.push(1);
  else if (indicators.rsi > 70) signals.push(-1);
  else signals.push(0);
  
  // MACD signal
  if (indicators.macdCrossover === 'bullish') signals.push(1);
  else if (indicators.macdCrossover === 'bearish') signals.push(-1);
  else signals.push(0);
  
  // BB signal
  if (indicators.bb.percentB < 0) signals.push(1);
  else if (indicators.bb.percentB > 1) signals.push(-1);
  else signals.push(0);
  
  // Volume signal
  if (indicators.volumeRatio > 1.5) signals.push(1);
  else if (indicators.volumeRatio < 0.5) signals.push(-1);
  else signals.push(0);
  
  // ADX trend signal
  if (indicators.adx > 25) {
    signals.push(indicators.ema9 > indicators.sma20 ? 1 : -1);
  } else {
    signals.push(0);
  }
  
  return signals;
}