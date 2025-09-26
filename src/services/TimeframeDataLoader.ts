/**
 * Timeframe-specific data loader with proper separation
 * Fixes the root cause: identical predictions across timeframes
 */

export type TF = '1m' | '5m' | '15m' | '1h' | '4h' | '1d'

export interface TFSpec {
  lookback: number    // Number of bars to fetch
  resample?: string   // Resampling period if needed
  rsiPeriod: number   // TF-specific RSI period
  atrPeriod: number   // TF-specific ATR period
  macdFast: number    // TF-specific MACD parameters
  macdSlow: number
  macdSignal: number
}

// Timeframe-specific parameters (no more one-size-fits-all)
export const TF_SPEC: Record<TF, TFSpec> = {
  '1m':  { 
    lookback: 500,      // ~8 hours of 1m bars
    rsiPeriod: 9,       // Faster RSI for scalping
    atrPeriod: 10,      // Faster ATR
    macdFast: 8,
    macdSlow: 17,
    macdSignal: 9
  },
  '5m': { 
    lookback: 500,      // ~40 hours of 5m bars
    resample: '5m',
    rsiPeriod: 14,      // Standard RSI
    atrPeriod: 14,
    macdFast: 12,
    macdSlow: 26,
    macdSignal: 9
  },
  '15m': { 
    lookback: 500,      // ~5 days of 15m bars
    resample: '15m',
    rsiPeriod: 14,
    atrPeriod: 14,
    macdFast: 12,
    macdSlow: 26,
    macdSignal: 9
  },
  '1h': { 
    lookback: 500,      // ~20 days of hourly bars
    resample: '1h',
    rsiPeriod: 14,
    atrPeriod: 14,
    macdFast: 12,
    macdSlow: 26,
    macdSignal: 9
  },
  '4h': { 
    lookback: 500,      // ~80 days of 4h bars
    resample: '4h',
    rsiPeriod: 21,      // Slower for longer timeframe
    atrPeriod: 21,
    macdFast: 12,
    macdSlow: 26,
    macdSignal: 9
  },
  '1d': { 
    lookback: 200,      // ~200 trading days
    resample: '1d',
    rsiPeriod: 14,
    atrPeriod: 14,
    macdFast: 12,
    macdSlow: 26,
    macdSignal: 9
  }
}

export interface OHLCV {
  open: number
  high: number
  low: number
  close: number
  volume: number
  timestamp: number
}

export interface TFData {
  tf: TF
  candles: OHLCV[]
  indicators: {
    rsi: number
    macd: number
    macdSignal: number
    macdHistogram: number
    macdCrossover: 'bullish' | 'bearish' | 'approaching_bullish' | 'approaching_bearish' | 'none'
    atr: number
    atrPercent: number
    bb: {
      upper: number
      middle: number
      lower: number
      percentB: number
      width: number
    }
    sma20: number
    ema9: number
    vwap: number
    adx: number
    volume: number
    volumeMA: number
    volumeRatio: number
  }
  features: Record<string, number>
  regime: 'Trend' | 'Range' | 'VolExp' | 'Flux'
}

// Cache with TF-specific keys to prevent collision
const cache = new Map<string, { data: TFData; timestamp: number }>()
const CACHE_TTL = 60000  // 60 seconds

function cacheKey(symbol: string, tf: TF, dtISO: string): string {
  // Include TF + date to prevent collisions
  return `bars:${symbol}:${tf}:${dtISO.slice(0, 16)}`  // Include hour for uniqueness
}

/**
 * Resample OHLCV data to specified period
 */
function resampleOHLCV(bars: OHLCV[], period: string): OHLCV[] {
  if (!period || bars.length === 0) return bars
  
  // Parse period (e.g., '5m', '1h', '4h')
  const value = parseInt(period)
  const unit = period.replace(/[0-9]/g, '')
  
  let intervalMs: number
  switch (unit) {
    case 'm': intervalMs = value * 60 * 1000; break
    case 'h': intervalMs = value * 60 * 60 * 1000; break
    case 'd': intervalMs = value * 24 * 60 * 60 * 1000; break
    default: return bars
  }
  
  const resampled: OHLCV[] = []
  let currentBucket: OHLCV | null = null
  
  for (const bar of bars) {
    const bucketStart = Math.floor(bar.timestamp / intervalMs) * intervalMs
    
    if (!currentBucket || currentBucket.timestamp !== bucketStart) {
      if (currentBucket) {
        resampled.push(currentBucket)
      }
      currentBucket = {
        timestamp: bucketStart,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: bar.volume
      }
    } else {
      currentBucket.high = Math.max(currentBucket.high, bar.high)
      currentBucket.low = Math.min(currentBucket.low, bar.low)
      currentBucket.close = bar.close
      currentBucket.volume += bar.volume
    }
  }
  
  if (currentBucket) {
    resampled.push(currentBucket)
  }
  
  return resampled
}

/**
 * Compute indicators with TF-specific parameters
 */
export function computeIndicatorsPerTF(candles: OHLCV[], tf: TF): TFData['indicators'] {
  const spec = TF_SPEC[tf]
  const prices = candles.map(c => c.close)
  const volumes = candles.map(c => c.volume)
  
  if (candles.length < 50) {
    // Not enough data for indicators
    return {
      rsi: 50,
      macd: 0,
      macdSignal: 0,
      macdHistogram: 0,
      macdCrossover: 'none',
      atr: 0,
      atrPercent: 0,
      bb: { upper: 0, middle: 0, lower: 0, percentB: 0.5, width: 0 },
      sma20: prices[prices.length - 1] || 0,
      ema9: prices[prices.length - 1] || 0,
      vwap: prices[prices.length - 1] || 0,
      adx: 0,
      volume: volumes[volumes.length - 1] || 0,
      volumeMA: volumes.reduce((a, b) => a + b, 0) / volumes.length,
      volumeRatio: 1
    }
  }
  
  const currentPrice = prices[prices.length - 1]
  
  // RSI with TF-specific period
  const rsi = calculateRSI(prices, spec.rsiPeriod)
  
  // MACD with TF-specific parameters
  const macd = calculateMACD(prices, spec.macdFast, spec.macdSlow, spec.macdSignal)
  
  // ATR with TF-specific period
  const atr = calculateATR(candles, spec.atrPeriod)
  const atrPercent = (atr / currentPrice) * 100
  
  // Bollinger Bands (standard 20,2)
  const bb = calculateBollingerBands(prices, 20, 2)
  
  // Moving averages
  const sma20 = calculateSMA(prices, 20)
  const ema9 = calculateEMA(prices, 9)
  
  // VWAP
  const vwap = calculateVWAP(candles)
  
  // ADX
  const adx = calculateADX(candles, 14)
  
  // Volume analysis
  const currentVolume = volumes[volumes.length - 1]
  const volumeMA = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20
  const volumeRatio = currentVolume / volumeMA
  
  return {
    rsi,
    macd: macd.macd,
    macdSignal: macd.signal,
    macdHistogram: macd.histogram,
    macdCrossover: macd.crossover,
    atr,
    atrPercent,
    bb,
    sma20,
    ema9,
    vwap,
    adx,
    volume: currentVolume,
    volumeMA,
    volumeRatio
  }
}

/**
 * Determine market regime based on indicators
 */
export function determineRegime(indicators: TFData['indicators']): TFData['regime'] {
  const { bb, adx, atrPercent } = indicators
  const bbWidth = bb.width
  
  // Quick deterministic regime detection
  if (atrPercent > 1.5) return 'VolExp'  // High volatility expansion
  if (adx >= 25 && bbWidth < 0.05) return 'Trend'  // Trending with normal vol
  if (bbWidth <= 0.03 && adx < 20) return 'Range'  // Tight range, low trend
  return 'Flux'  // Everything else is flux/transition
}

/**
 * Load timeframe-specific data with proper separation
 */
export async function loadTF(
  symbol: string,
  tf: TF,
  asof: Date,
  dataFetcher: (symbol: string, tf: TF, lookback: number) => Promise<OHLCV[]>
): Promise<TFData> {
  const key = cacheKey(symbol, tf, asof.toISOString())
  
  // Check cache first
  const cached = cache.get(key)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data
  }
  
  // Fetch raw bars
  const spec = TF_SPEC[tf]
  const rawBars = await dataFetcher(symbol, tf, spec.lookback)
  
  // Resample if needed
  const bars = spec.resample ? resampleOHLCV(rawBars, spec.resample) : rawBars
  
  // Compute TF-specific indicators
  const indicators = computeIndicatorsPerTF(bars, tf)
  
  // Determine regime
  const regime = determineRegime(indicators)
  
  // Build TF data
  const tfData: TFData = {
    tf,
    candles: bars,
    indicators,
    features: extractFeatures(indicators, regime),
    regime
  }
  
  // Cache it
  cache.set(key, { data: tfData, timestamp: Date.now() })
  
  return tfData
}

/**
 * Extract normalized features from indicators
 */
function extractFeatures(indicators: TFData['indicators'], regime: TFData['regime']): Record<string, number> {
  return {
    rsi_norm: (indicators.rsi - 50) / 50,  // Normalize to [-1, 1]
    macd_norm: Math.tanh(indicators.macd),  // Bounded signal
    macd_hist_norm: Math.tanh(indicators.macdHistogram),
    bb_percentB: indicators.bb.percentB,
    volume_ratio: Math.log(indicators.volumeRatio + 1),  // Log scale for volume
    adx_norm: indicators.adx / 100,
    atr_percent: indicators.atrPercent,
    regime_trend: regime === 'Trend' ? 1 : 0,
    regime_range: regime === 'Range' ? 1 : 0,
    regime_volexp: regime === 'VolExp' ? 1 : 0,
    regime_flux: regime === 'Flux' ? 1 : 0
  }
}

// Individual indicator calculations
function calculateRSI(prices: number[], period: number): number {
  if (prices.length < period + 1) return 50
  
  let gains = 0
  let losses = 0
  
  for (let i = prices.length - period; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1]
    if (change > 0) gains += change
    else losses -= change
  }
  
  const avgGain = gains / period
  const avgLoss = losses / period
  
  if (avgLoss === 0) return 100
  const rs = avgGain / avgLoss
  return 100 - (100 / (1 + rs))
}

function calculateMACD(prices: number[], fast: number, slow: number, signal: number): {
  macd: number
  signal: number
  histogram: number
  crossover: 'bullish' | 'bearish' | 'approaching_bullish' | 'approaching_bearish' | 'none'
} {
  const emaFast = calculateEMA(prices, fast)
  const emaSlow = calculateEMA(prices, slow)
  const macdLine = emaFast - emaSlow
  
  // Calculate signal line (EMA of MACD)
  const macdHistory: number[] = []
  for (let i = slow; i < prices.length; i++) {
    const f = calculateEMA(prices.slice(0, i + 1), fast)
    const s = calculateEMA(prices.slice(0, i + 1), slow)
    macdHistory.push(f - s)
  }
  
  const signalLine = calculateEMA(macdHistory, signal)
  const histogram = macdLine - signalLine
  
  // Detect crossover
  let crossover: 'bullish' | 'bearish' | 'approaching_bullish' | 'approaching_bearish' | 'none' = 'none'
  if (macdHistory.length > 2) {
    const prevHist = macdHistory[macdHistory.length - 2] - signalLine
    if (prevHist < 0 && histogram > 0) crossover = 'bullish'
    else if (prevHist > 0 && histogram < 0) crossover = 'bearish'
    else if (histogram < 0 && histogram > prevHist) crossover = 'approaching_bullish'
    else if (histogram > 0 && histogram < prevHist) crossover = 'approaching_bearish'
  }
  
  return { macd: macdLine, signal: signalLine, histogram, crossover }
}

function calculateEMA(prices: number[], period: number): number {
  if (prices.length === 0) return 0
  if (prices.length < period) return prices[prices.length - 1]
  
  const multiplier = 2 / (period + 1)
  let ema = prices[0]
  
  for (let i = 1; i < prices.length; i++) {
    ema = (prices[i] - ema) * multiplier + ema
  }
  
  return ema
}

function calculateSMA(prices: number[], period: number): number {
  if (prices.length < period) return prices[prices.length - 1] || 0
  const slice = prices.slice(-period)
  return slice.reduce((a, b) => a + b, 0) / period
}

function calculateATR(candles: OHLCV[], period: number): number {
  if (candles.length < period + 1) return 0
  
  const trueRanges: number[] = []
  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high
    const low = candles[i].low
    const prevClose = candles[i - 1].close
    
    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    )
    trueRanges.push(tr)
  }
  
  if (trueRanges.length < period) return 0
  const recentTR = trueRanges.slice(-period)
  return recentTR.reduce((a, b) => a + b, 0) / period
}

function calculateBollingerBands(prices: number[], period: number, stdDev: number): TFData['indicators']['bb'] {
  const sma = calculateSMA(prices, period)
  const slice = prices.slice(-period)
  
  const variance = slice.reduce((sum, price) => sum + Math.pow(price - sma, 2), 0) / period
  const std = Math.sqrt(variance)
  
  const upper = sma + (std * stdDev)
  const lower = sma - (std * stdDev)
  const currentPrice = prices[prices.length - 1]
  const percentB = (currentPrice - lower) / (upper - lower)
  const width = (upper - lower) / sma
  
  return { upper, middle: sma, lower, percentB, width }
}

function calculateVWAP(candles: OHLCV[]): number {
  if (candles.length === 0) return 0
  
  let totalVolume = 0
  let totalPriceVolume = 0
  
  candles.forEach(candle => {
    const typicalPrice = (candle.high + candle.low + candle.close) / 3
    totalPriceVolume += typicalPrice * candle.volume
    totalVolume += candle.volume
  })
  
  return totalVolume > 0 ? totalPriceVolume / totalVolume : candles[candles.length - 1].close
}

function calculateADX(candles: OHLCV[], period: number): number {
  if (candles.length < period + 1) return 0
  
  // Simplified ADX calculation
  const changes: number[] = []
  for (let i = 1; i < candles.length; i++) {
    const change = Math.abs(candles[i].close - candles[i - 1].close)
    changes.push(change)
  }
  
  const avgChange = changes.slice(-period).reduce((a, b) => a + b, 0) / period
  const avgRange = calculateATR(candles, period)
  
  return avgRange > 0 ? (avgChange / avgRange) * 100 : 0
}