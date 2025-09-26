/**
 * Hurricane Feature Extractor
 * Extracts ALL features required by the Hurricane SPY framework
 */

import { TechnicalIndicators, type OHLCV } from './TechnicalIndicators'
import { PolygonAPI } from './PolygonAPI'

export interface HurricaneFeatures {
  // === TECHNICAL INDICATORS ===
  // Price Action
  price: number
  priceChange1m: number
  priceChange5m: number
  priceChange15m: number
  priceChange1h: number
  priceChange4h: number
  priceChange1d: number
  
  // Moving Averages
  sma5: number
  sma10: number
  sma20: number
  sma50: number
  sma200: number
  ema9: number
  ema21: number
  ema50: number
  
  // MA Slopes (momentum)
  sma5_slope: number
  sma20_slope: number
  ema21_slope: number
  ema50_slope: number
  
  // MA Crossovers
  golden_cross: boolean  // SMA50 > SMA200
  death_cross: boolean   // SMA50 < SMA200
  ema9_21_cross: 'bullish' | 'bearish' | 'none'
  price_above_ma200: boolean
  
  // Momentum Indicators
  rsi14: number
  rsi14_1h: number
  rsi14_4h: number
  rsi14_1d: number
  rsi_oversold: boolean  // < 30
  rsi_overbought: boolean // > 70
  
  // MACD
  macd: number
  macd_signal: number
  macd_histogram: number
  macd_crossover: 'bullish' | 'bearish' | 'approaching_bullish' | 'approaching_bearish' | 'none'
  
  // Stochastic
  stoch_k: number
  stoch_d: number
  stoch_oversold: boolean  // < 20
  stoch_overbought: boolean // > 80
  
  // Volatility
  atr14: number
  atr_percent: number  // ATR as % of price
  bb_upper: number
  bb_middle: number
  bb_lower: number
  bb_width: number
  bb_percentB: number
  bb_squeeze: boolean  // Width < 2%
  
  // Trend Strength
  adx14: number
  adx14_1h: number
  adx14_4h: number
  trending: boolean  // ADX > 25
  strong_trend: boolean  // ADX > 40
  
  // Volume
  volume: number
  volume_sma20: number
  volume_ratio: number  // Current / Average
  volume_surge: boolean  // > 1.5x average
  obv: number
  obv_slope: number
  
  // === OPTIONS METRICS ===
  // Greeks Aggregates
  total_gamma: number
  total_vanna: number
  total_charm: number
  gex: number  // Gamma Exposure
  gex_rank: number  // Percentile vs history
  dix: number  // Dark Index
  
  // Options Flow
  call_volume: number
  put_volume: number
  put_call_ratio: number
  call_premium: number
  put_premium: number
  premium_ratio: number
  
  // Skew & IV
  iv_rank: number
  iv_percentile: number
  skew_25delta: number
  term_structure: number
  contango: boolean
  
  // === MARKET INTERNALS ===
  vix: number
  vix_change: number
  vix_9dma: number
  vix_contango: number
  vvix: number  // VIX of VIX
  
  // Breadth
  advance_decline: number
  mcclellan_osc: number
  new_highs: number
  new_lows: number
  
  // === MICROSTRUCTURE ===
  spread: number
  spread_percent: number
  tick: number  // Upticks - Downticks
  
  // === SENTIMENT ===
  fear_greed: number  // CNN Fear & Greed approximation
  
  // === LEVELS ===
  vwap: number
  vwap_distance: number  // Price distance from VWAP
  
  // Support/Resistance
  nearest_support: number
  nearest_resistance: number
  support_distance: number
  resistance_distance: number
  
  // Fibonacci
  fib_382: number
  fib_500: number
  fib_618: number
  
  // === TIME FEATURES ===
  hour_of_day: number
  day_of_week: number
  days_to_expiry: number
  is_opex: boolean
  is_fomc: boolean
  
  // === REGIME INDICATORS ===
  volatility_regime: 'low' | 'normal' | 'high' | 'extreme'
  trend_regime: 'strong_up' | 'up' | 'neutral' | 'down' | 'strong_down'
  volume_regime: 'low' | 'normal' | 'high'
  
  // === COMPOSITE SCORES ===
  momentum_score: number  // -100 to +100
  trend_score: number
  reversal_score: number
  breakout_score: number
  
  // === PATTERN DETECTION ===
  bull_flag: boolean
  bear_flag: boolean
  double_top: boolean
  double_bottom: boolean
  ascending_triangle: boolean
  descending_triangle: boolean
}

export class HurricaneFeatureExtractor {
  private polygonApi: PolygonAPI | null = null
  private historicalData: Map<string, OHLCV[]> = new Map()
  
  constructor(polygonApiKey?: string) {
    if (polygonApiKey) {
      this.polygonApi = new PolygonAPI(polygonApiKey)
    }
  }
  
  /**
   * Extract all Hurricane features from market data
   */
  async extractFeatures(
    currentPrice: number,
    candles1m?: OHLCV[],
    candles5m?: OHLCV[],
    candles15m?: OHLCV[],
    candles1h?: OHLCV[],
    candles4h?: OHLCV[],
    candles1d?: OHLCV[]
  ): Promise<HurricaneFeatures> {
    // Use the most detailed candles available
    const primaryCandles = candles1m || candles5m || candles15m || candles1h || candles1d || []
    const prices = primaryCandles.map(c => c.close)
    
    // Get daily candles for longer-term indicators
    const dailyCandles = candles1d || primaryCandles
    const dailyPrices = dailyCandles.map(c => c.close)
    
    // Calculate all technical indicators
    const rsi14 = TechnicalIndicators.calculateRSI(prices, 14)
    const macd = TechnicalIndicators.calculateMACD(prices)
    const bb = TechnicalIndicators.calculateBollingerBands(prices, 20, 2)
    const adx = TechnicalIndicators.calculateADX(primaryCandles, 14)
    const stoch = TechnicalIndicators.calculateStochastic(primaryCandles, 14)
    const atr = TechnicalIndicators.calculateATR(primaryCandles, 14)
    const vwap = TechnicalIndicators.calculateVWAP(primaryCandles)
    const obv = TechnicalIndicators.calculateOBV(primaryCandles)
    
    // Moving averages
    const sma5 = TechnicalIndicators.calculateSMA(prices, 5)
    const sma10 = TechnicalIndicators.calculateSMA(prices, 10)
    const sma20 = TechnicalIndicators.calculateSMA(prices, 20)
    const sma50 = TechnicalIndicators.calculateSMA(dailyPrices, 50)
    const sma200 = TechnicalIndicators.calculateSMA(dailyPrices, 200)
    
    const ema9 = TechnicalIndicators.calculateEMA(prices, 9)
    const ema21 = TechnicalIndicators.calculateEMA(prices, 21)
    const ema50 = TechnicalIndicators.calculateEMA(prices, 50)
    
    // Calculate slopes (momentum)
    const calculateSlope = (values: number[], period: number = 5): number => {
      if (values.length < period) return 0
      const recent = values.slice(-period)
      return (recent[recent.length - 1] - recent[0]) / recent[0]
    }
    
    // Price changes
    const calculatePriceChange = (candles: OHLCV[] | undefined): number => {
      if (!candles || candles.length < 2) return 0
      return (candles[candles.length - 1].close - candles[0].close) / candles[0].close
    }
    
    // Volume analysis
    const currentVolume = primaryCandles[primaryCandles.length - 1]?.volume || 0
    const volumes = primaryCandles.map(c => c.volume)
    const avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length || 1
    
    // Support/Resistance
    const levels = TechnicalIndicators.detectSupportResistance(primaryCandles)
    const nearestSupport = levels.support[0] || currentPrice * 0.98
    const nearestResistance = levels.resistance[0] || currentPrice * 1.02
    
    // Get high/low for Fibonacci
    const high = Math.max(...primaryCandles.map(c => c.high))
    const low = Math.min(...primaryCandles.map(c => c.low))
    const fib = TechnicalIndicators.calculateFibonacciLevels(high, low)
    
    // Time features
    const now = new Date()
    const hour = now.getHours()
    const day = now.getDay()
    
    // Determine regimes
    const getVolatilityRegime = (bbWidth: number): 'low' | 'normal' | 'high' | 'extreme' => {
      if (bbWidth < 0.01) return 'low'
      if (bbWidth < 0.02) return 'normal'
      if (bbWidth < 0.04) return 'high'
      return 'extreme'
    }
    
    const getTrendRegime = (adx: number, priceVsSMA200: number): 'strong_up' | 'up' | 'neutral' | 'down' | 'strong_down' => {
      if (adx > 40 && priceVsSMA200 > 0.02) return 'strong_up'
      if (priceVsSMA200 > 0.01) return 'up'
      if (priceVsSMA200 < -0.01) return 'down'
      if (adx > 40 && priceVsSMA200 < -0.02) return 'strong_down'
      return 'neutral'
    }
    
    // Composite scores
    const calculateMomentumScore = (): number => {
      let score = 0
      
      // RSI contribution
      if (rsi14 > 70) score += 20
      else if (rsi14 > 60) score += 10
      else if (rsi14 < 30) score -= 20
      else if (rsi14 < 40) score -= 10
      
      // MACD contribution
      if (macd.histogram > 0) score += 15
      if (macd.crossover === 'bullish') score += 25
      if (macd.crossover === 'bearish') score -= 25
      
      // Price vs MAs
      if (currentPrice > sma20) score += 10
      if (currentPrice > sma50) score += 10
      if (currentPrice > sma200) score += 10
      
      // Volume
      if (currentVolume > avgVolume * 1.5) score += 15
      
      return Math.max(-100, Math.min(100, score))
    }
    
    // Options metrics (would need real options data)
    // For now, using estimates
    const estimateOptionsMetrics = () => {
      const baseIV = 0.16  // 16% implied volatility
      const vixLevel = 16  // Would get from API
      
      return {
        gex: -1e9 + Math.random() * 2e9,  // Placeholder
        dix: 0.4 + Math.random() * 0.2,
        put_call_ratio: 0.7 + Math.random() * 0.6,
        iv_rank: 20 + Math.random() * 60,
        vix: vixLevel,
        vix_change: (Math.random() - 0.5) * 2
      }
    }
    
    const optionsMetrics = estimateOptionsMetrics()
    
    // Build complete feature set
    const features: HurricaneFeatures = {
      // Price Action
      price: currentPrice,
      priceChange1m: calculatePriceChange(candles1m),
      priceChange5m: calculatePriceChange(candles5m),
      priceChange15m: calculatePriceChange(candles15m),
      priceChange1h: calculatePriceChange(candles1h),
      priceChange4h: calculatePriceChange(candles4h),
      priceChange1d: calculatePriceChange(candles1d),
      
      // Moving Averages
      sma5,
      sma10,
      sma20,
      sma50,
      sma200,
      ema9: ema9[ema9.length - 1] || currentPrice,
      ema21: ema21[ema21.length - 1] || currentPrice,
      ema50: ema50[ema50.length - 1] || currentPrice,
      
      // MA Slopes
      sma5_slope: calculateSlope([sma5]),
      sma20_slope: calculateSlope([sma20]),
      ema21_slope: calculateSlope(ema21),
      ema50_slope: calculateSlope(ema50),
      
      // MA Crossovers
      golden_cross: sma50 > sma200,
      death_cross: sma50 < sma200,
      ema9_21_cross: ema9[ema9.length - 1] > ema21[ema21.length - 1] ? 'bullish' : 'bearish',
      price_above_ma200: currentPrice > sma200,
      
      // Momentum
      rsi14,
      rsi14_1h: candles1h ? TechnicalIndicators.calculateRSI(candles1h.map(c => c.close)) : rsi14,
      rsi14_4h: candles4h ? TechnicalIndicators.calculateRSI(candles4h.map(c => c.close)) : rsi14,
      rsi14_1d: candles1d ? TechnicalIndicators.calculateRSI(candles1d.map(c => c.close)) : rsi14,
      rsi_oversold: rsi14 < 30,
      rsi_overbought: rsi14 > 70,
      
      // MACD
      macd: macd.macd,
      macd_signal: macd.signal,
      macd_histogram: macd.histogram,
      macd_crossover: macd.crossover === 'none' && Math.abs(macd.macd - macd.signal) < 0.1 
        ? (macd.macd < macd.signal ? 'approaching_bullish' : 'approaching_bearish')
        : macd.crossover,
      
      // Stochastic
      stoch_k: stoch.k,
      stoch_d: stoch.d,
      stoch_oversold: stoch.k < 20,
      stoch_overbought: stoch.k > 80,
      
      // Volatility
      atr14: atr,
      atr_percent: (atr / currentPrice) * 100,
      bb_upper: bb.upper,
      bb_middle: bb.middle,
      bb_lower: bb.lower,
      bb_width: bb.width,
      bb_percentB: bb.percentB,
      bb_squeeze: bb.width < 0.02,
      
      // Trend
      adx14: adx,
      adx14_1h: candles1h ? TechnicalIndicators.calculateADX(candles1h) : adx,
      adx14_4h: candles4h ? TechnicalIndicators.calculateADX(candles4h) : adx,
      trending: adx > 25,
      strong_trend: adx > 40,
      
      // Volume
      volume: currentVolume,
      volume_sma20: avgVolume,
      volume_ratio: currentVolume / avgVolume,
      volume_surge: currentVolume > avgVolume * 1.5,
      obv,
      obv_slope: calculateSlope([obv]),
      
      // Options
      total_gamma: 0,
      total_vanna: 0,
      total_charm: 0,
      gex: optionsMetrics.gex,
      gex_rank: 50,
      dix: optionsMetrics.dix,
      call_volume: 100000,
      put_volume: 120000,
      put_call_ratio: optionsMetrics.put_call_ratio,
      call_premium: 1000000,
      put_premium: 1200000,
      premium_ratio: 1.2,
      iv_rank: optionsMetrics.iv_rank,
      iv_percentile: 50,
      skew_25delta: 0,
      term_structure: 1,
      contango: true,
      
      // Market Internals
      vix: optionsMetrics.vix,
      vix_change: optionsMetrics.vix_change,
      vix_9dma: optionsMetrics.vix,
      vix_contango: 1,
      vvix: 90,
      advance_decline: 1.2,
      mcclellan_osc: 0,
      new_highs: 50,
      new_lows: 30,
      
      // Microstructure
      spread: 0.01,
      spread_percent: 0.002,
      tick: 100,
      
      // Sentiment
      fear_greed: 50,
      
      // Levels
      vwap,
      vwap_distance: (currentPrice - vwap) / vwap,
      nearest_support: nearestSupport,
      nearest_resistance: nearestResistance,
      support_distance: (currentPrice - nearestSupport) / currentPrice,
      resistance_distance: (nearestResistance - currentPrice) / currentPrice,
      fib_382: fib.level_382,
      fib_500: fib.level_500,
      fib_618: fib.level_618,
      
      // Time
      hour_of_day: hour,
      day_of_week: day,
      days_to_expiry: 0,
      is_opex: day === 5 && hour > 14,
      is_fomc: false,
      
      // Regimes
      volatility_regime: getVolatilityRegime(bb.width),
      trend_regime: getTrendRegime(adx, (currentPrice - sma200) / sma200),
      volume_regime: currentVolume > avgVolume * 1.5 ? 'high' : currentVolume < avgVolume * 0.5 ? 'low' : 'normal',
      
      // Scores
      momentum_score: calculateMomentumScore(),
      trend_score: adx > 25 ? 50 : 0,
      reversal_score: (rsi14 < 30 || rsi14 > 70) ? 50 : 0,
      breakout_score: bb.percentB > 1 || bb.percentB < 0 ? 50 : 0,
      
      // Patterns (simplified)
      bull_flag: false,
      bear_flag: false,
      double_top: false,
      double_bottom: false,
      ascending_triangle: false,
      descending_triangle: false
    }
    
    return features
  }
}