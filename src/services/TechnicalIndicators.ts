/**
 * Technical Indicators Calculator
 * Implements all technical indicators needed for Hurricane SPY system
 */

export interface OHLCV {
  open: number
  high: number
  low: number
  close: number
  volume: number
  timestamp: number
}

export class TechnicalIndicators {
  /**
   * Calculate RSI (Relative Strength Index)
   */
  static calculateRSI(prices: number[], period: number = 14): number {
    if (prices.length < period + 1) return 50
    
    let gains = 0
    let losses = 0
    
    // Calculate initial average gain/loss
    for (let i = 1; i <= period; i++) {
      const diff = prices[i] - prices[i - 1]
      if (diff > 0) gains += diff
      else losses -= diff
    }
    
    let avgGain = gains / period
    let avgLoss = losses / period
    
    // Calculate subsequent values using smoothing
    for (let i = period + 1; i < prices.length; i++) {
      const diff = prices[i] - prices[i - 1]
      if (diff > 0) {
        avgGain = (avgGain * (period - 1) + diff) / period
        avgLoss = (avgLoss * (period - 1)) / period
      } else {
        avgGain = (avgGain * (period - 1)) / period
        avgLoss = (avgLoss * (period - 1) - diff) / period
      }
    }
    
    if (avgLoss === 0) return 100
    const rs = avgGain / avgLoss
    return 100 - (100 / (1 + rs))
  }
  
  /**
   * Calculate MACD (Moving Average Convergence Divergence)
   */
  static calculateMACD(prices: number[]): {
    macd: number
    signal: number
    histogram: number
    crossover: 'bullish' | 'bearish' | 'none'
  } {
    if (prices.length < 26) {
      return { macd: 0, signal: 0, histogram: 0, crossover: 'none' }
    }
    
    const ema12 = this.calculateEMA(prices, 12)
    const ema26 = this.calculateEMA(prices, 26)
    const macd = ema12[ema12.length - 1] - ema26[ema26.length - 1]
    
    // Calculate signal line (9-period EMA of MACD)
    const macdHistory = []
    for (let i = 26; i < prices.length; i++) {
      macdHistory.push(ema12[i - 12] - ema26[i - 26])
    }
    
    const signalLine = this.calculateEMA(macdHistory, 9)
    const signal = signalLine[signalLine.length - 1] || 0
    const histogram = macd - signal
    
    // Detect crossover
    let crossover: 'bullish' | 'bearish' | 'none' = 'none'
    if (macdHistory.length >= 2 && signalLine.length >= 2) {
      const prevMACD = macdHistory[macdHistory.length - 2]
      const prevSignal = signalLine[signalLine.length - 2]
      
      if (prevMACD <= prevSignal && macd > signal) {
        crossover = 'bullish'
      } else if (prevMACD >= prevSignal && macd < signal) {
        crossover = 'bearish'
      }
    }
    
    return { macd, signal, histogram, crossover }
  }
  
  /**
   * Calculate Bollinger Bands
   */
  static calculateBollingerBands(prices: number[], period: number = 20, stdDev: number = 2): {
    upper: number
    middle: number
    lower: number
    width: number
    percentB: number
  } {
    if (prices.length < period) {
      const currentPrice = prices[prices.length - 1]
      return {
        upper: currentPrice * 1.02,
        middle: currentPrice,
        lower: currentPrice * 0.98,
        width: 0.04,
        percentB: 0.5
      }
    }
    
    const recentPrices = prices.slice(-period)
    const middle = recentPrices.reduce((a, b) => a + b, 0) / period
    
    const variance = recentPrices.reduce((sum, price) => 
      sum + Math.pow(price - middle, 2), 0) / period
    const std = Math.sqrt(variance)
    
    const upper = middle + (stdDev * std)
    const lower = middle - (stdDev * std)
    const width = (upper - lower) / middle
    
    const currentPrice = prices[prices.length - 1]
    const percentB = (currentPrice - lower) / (upper - lower)
    
    return { upper, middle, lower, width, percentB }
  }
  
  /**
   * Calculate ADX (Average Directional Index)
   */
  static calculateADX(candles: OHLCV[], period: number = 14): number {
    if (candles.length < period + 1) return 25
    
    const dx: number[] = []
    
    for (let i = 1; i < candles.length; i++) {
      const high = candles[i].high
      const low = candles[i].low
      const prevHigh = candles[i - 1].high
      const prevLow = candles[i - 1].low
      const prevClose = candles[i - 1].close
      
      // Calculate True Range
      const tr = Math.max(
        high - low,
        Math.abs(high - prevClose),
        Math.abs(low - prevClose)
      )
      
      // Calculate +DM and -DM
      const plusDM = high - prevHigh > prevLow - low ? Math.max(high - prevHigh, 0) : 0
      const minusDM = prevLow - low > high - prevHigh ? Math.max(prevLow - low, 0) : 0
      
      // Smooth the values
      if (i >= period) {
        const smoothedTR = tr
        const smoothedPlusDM = plusDM
        const smoothedMinusDM = minusDM
        
        const plusDI = (smoothedPlusDM / smoothedTR) * 100
        const minusDI = (smoothedMinusDM / smoothedTR) * 100
        
        const di = Math.abs(plusDI - minusDI) / (plusDI + minusDI) * 100
        dx.push(di)
      }
    }
    
    // Calculate ADX as average of DX
    if (dx.length === 0) return 25
    return dx.reduce((a, b) => a + b, 0) / dx.length
  }
  
  /**
   * Calculate Moving Averages
   */
  static calculateSMA(prices: number[], period: number): number {
    if (prices.length < period) return prices[prices.length - 1]
    const recentPrices = prices.slice(-period)
    return recentPrices.reduce((a, b) => a + b, 0) / period
  }
  
  static calculateEMA(prices: number[], period: number): number[] {
    if (prices.length === 0) return []
    
    const ema: number[] = [prices[0]]
    const multiplier = 2 / (period + 1)
    
    for (let i = 1; i < prices.length; i++) {
      ema.push((prices[i] - ema[i - 1]) * multiplier + ema[i - 1])
    }
    
    return ema
  }
  
  /**
   * Calculate VWAP (Volume Weighted Average Price)
   */
  static calculateVWAP(candles: OHLCV[]): number {
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
  
  /**
   * Calculate ATR (Average True Range)
   */
  static calculateATR(candles: OHLCV[], period: number = 14): number {
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
    
    // Calculate ATR as SMA of True Range
    if (trueRanges.length < period) return 0
    const recentTR = trueRanges.slice(-period)
    return recentTR.reduce((a, b) => a + b, 0) / period
  }
  
  /**
   * Calculate Stochastic Oscillator
   */
  static calculateStochastic(candles: OHLCV[], period: number = 14): {
    k: number
    d: number
  } {
    if (candles.length < period) return { k: 50, d: 50 }
    
    const recentCandles = candles.slice(-period)
    const highs = recentCandles.map(c => c.high)
    const lows = recentCandles.map(c => c.low)
    
    const highest = Math.max(...highs)
    const lowest = Math.min(...lows)
    const current = candles[candles.length - 1].close
    
    const k = ((current - lowest) / (highest - lowest)) * 100
    
    // D is 3-period SMA of K
    // For simplicity, using current K as D
    const d = k
    
    return { k, d }
  }
  
  /**
   * Calculate OBV (On Balance Volume)
   */
  static calculateOBV(candles: OHLCV[]): number {
    if (candles.length === 0) return 0
    
    let obv = 0
    
    for (let i = 1; i < candles.length; i++) {
      if (candles[i].close > candles[i - 1].close) {
        obv += candles[i].volume
      } else if (candles[i].close < candles[i - 1].close) {
        obv -= candles[i].volume
      }
    }
    
    return obv
  }
  
  /**
   * Calculate Fibonacci Retracement Levels
   */
  static calculateFibonacciLevels(high: number, low: number): {
    level_0: number
    level_236: number
    level_382: number
    level_500: number
    level_618: number
    level_786: number
    level_1000: number
  } {
    const diff = high - low
    
    return {
      level_0: low,
      level_236: low + diff * 0.236,
      level_382: low + diff * 0.382,
      level_500: low + diff * 0.500,
      level_618: low + diff * 0.618,
      level_786: low + diff * 0.786,
      level_1000: high
    }
  }
  
  /**
   * Detect Support and Resistance Levels
   */
  static detectSupportResistance(candles: OHLCV[], lookback: number = 20): {
    support: number[]
    resistance: number[]
  } {
    if (candles.length < lookback) {
      return { support: [], resistance: [] }
    }
    
    const recentCandles = candles.slice(-lookback)
    const highs = recentCandles.map(c => c.high)
    const lows = recentCandles.map(c => c.low)
    
    // Find local extremes
    const resistance: number[] = []
    const support: number[] = []
    
    for (let i = 2; i < highs.length - 2; i++) {
      // Resistance (local high)
      if (highs[i] > highs[i-1] && highs[i] > highs[i-2] &&
          highs[i] > highs[i+1] && highs[i] > highs[i+2]) {
        resistance.push(highs[i])
      }
      
      // Support (local low)
      if (lows[i] < lows[i-1] && lows[i] < lows[i-2] &&
          lows[i] < lows[i+1] && lows[i] < lows[i+2]) {
        support.push(lows[i])
      }
    }
    
    // Sort and deduplicate
    return {
      support: [...new Set(support)].sort((a, b) => b - a).slice(0, 3),
      resistance: [...new Set(resistance)].sort((a, b) => a - b).slice(0, 3)
    }
  }
  
  /**
   * Calculate Market Breadth Indicators
   */
  static calculateMarketBreadth(advances: number, declines: number, volume: number): {
    advanceDeclineRatio: number
    mcClellanOscillator: number
    armsIndex: number
  } {
    const advanceDeclineRatio = declines > 0 ? advances / declines : 1
    
    // Simplified McClellan Oscillator
    const mcClellanOscillator = (advances - declines) / (advances + declines) * 100
    
    // Arms Index (TRIN)
    const armsIndex = advanceDeclineRatio > 0 ? 1 / advanceDeclineRatio : 1
    
    return {
      advanceDeclineRatio,
      mcClellanOscillator,
      armsIndex
    }
  }
}