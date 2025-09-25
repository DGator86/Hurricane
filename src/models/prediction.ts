// Hurricane SPY Prediction Models - Implementation of paper's mathematical framework

export interface Candle {
  timestamp: Date
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface TechnicalIndicators {
  rsi: number
  macd: { macd: number; signal: number; histogram: number }
  ma5: number
  ma20: number
  ma50: number
  ma200: number
  bollingerBands: { upper: number; middle: number; lower: number }
  atr: number
}

export interface Prediction {
  timeframe: string
  direction: 'bullish' | 'bearish' | 'neutral'
  expectedReturn: number
  confidence: number
  hurricaneIntensity: number
  positionSize: number
  entryPrice: number
  targetPrice: number
  stopLoss: number
  riskRewardRatio: number
  technicalSignals: {
    rsi: string
    macd: string
    movingAverages: string
    bollingerBands: string
  }
}

export interface OptionsRecommendation {
  timeframe: string
  type: 'call' | 'put'
  strike: number
  expiration: string
  delta: number
  gamma: number
  theta: number
  vega: number
  impliedVolatility: number
  entry: number
  target: number
  stopLoss: number
  riskRewardRatio: number
  confidence: number
}

// Technical Indicators Calculation
export class TechnicalAnalysis {
  // Calculate RSI
  static calculateRSI(prices: number[], period: number = 14): number {
    if (prices.length < period + 1) return 50

    const changes = []
    for (let i = 1; i < prices.length; i++) {
      changes.push(prices[i] - prices[i - 1])
    }

    const gains = changes.map(c => c > 0 ? c : 0)
    const losses = changes.map(c => c < 0 ? Math.abs(c) : 0)

    const avgGain = gains.slice(-period).reduce((a, b) => a + b, 0) / period
    const avgLoss = losses.slice(-period).reduce((a, b) => a + b, 0) / period

    if (avgLoss === 0) return 100

    const rs = avgGain / avgLoss
    return 100 - (100 / (1 + rs))
  }

  // Calculate EMA
  static calculateEMA(prices: number[], period: number): number[] {
    const k = 2 / (period + 1)
    const ema = [prices[0]]
    
    for (let i = 1; i < prices.length; i++) {
      ema.push(prices[i] * k + ema[i - 1] * (1 - k))
    }
    
    return ema
  }

  // Calculate MACD
  static calculateMACD(prices: number[], fast = 12, slow = 26, signal = 9) {
    const emaFast = this.calculateEMA(prices, fast)
    const emaSlow = this.calculateEMA(prices, slow)
    const macdLine = emaFast.map((v, i) => v - emaSlow[i])
    const signalLine = this.calculateEMA(macdLine, signal)
    const histogram = macdLine.map((v, i) => v - signalLine[i])

    return {
      macd: macdLine[macdLine.length - 1],
      signal: signalLine[signalLine.length - 1],
      histogram: histogram[histogram.length - 1]
    }
  }

  // Calculate Bollinger Bands
  static calculateBollingerBands(prices: number[], period = 20, stdDev = 2) {
    const sma = prices.slice(-period).reduce((a, b) => a + b, 0) / period
    const variance = prices.slice(-period).reduce((a, b) => a + Math.pow(b - sma, 2), 0) / period
    const std = Math.sqrt(variance)

    return {
      upper: sma + (std * stdDev),
      middle: sma,
      lower: sma - (std * stdDev)
    }
  }

  // Calculate ATR
  static calculateATR(candles: Candle[], period = 14): number {
    const trs = []
    for (let i = 1; i < candles.length; i++) {
      const highLow = candles[i].high - candles[i].low
      const highClose = Math.abs(candles[i].high - candles[i - 1].close)
      const lowClose = Math.abs(candles[i].low - candles[i - 1].close)
      trs.push(Math.max(highLow, highClose, lowClose))
    }

    return trs.slice(-period).reduce((a, b) => a + b, 0) / period
  }

  // Detect MACD Crossover
  static detectMACDCrossover(macd: { macd: number; signal: number }, 
                             prevMacd: { macd: number; signal: number }): string {
    if (prevMacd.macd <= prevMacd.signal && macd.macd > macd.signal) {
      return 'bullish_cross'
    } else if (prevMacd.macd >= prevMacd.signal && macd.macd < macd.signal) {
      return 'bearish_cross'
    } else if (macd.macd < macd.signal && macd.macd > prevMacd.macd) {
      return 'approaching_bullish'
    } else if (macd.macd > macd.signal && macd.macd < prevMacd.macd) {
      return 'approaching_bearish'
    }
    return 'neutral'
  }
}

// Hurricane Intensity Calculator
export class HurricaneModel {
  // Calculate hurricane intensity (0-5 scale)
  static calculateIntensity(
    currentVolatility: number,
    baselineVolatility: number,
    expectedReturn: number,
    gammaExposure: number = 0,
    alpha: number = 0.5,
    beta: number = 0.3
  ): number {
    const volatilityRatio = currentVolatility / baselineVolatility
    const logComponent = Math.log(volatilityRatio) / Math.log(2)
    const returnComponent = alpha * Math.abs(expectedReturn)
    const gammaComponent = beta * gammaExposure
    
    const rawIntensity = logComponent + returnComponent + gammaComponent
    return Math.floor(Math.min(5, Math.max(0, rawIntensity)))
  }

  // Map VIX to hurricane category
  static vixToHurricane(vix: number): number {
    if (vix < 12) return 0  // Calm Seas
    if (vix < 15) return 1  // Light Breeze
    if (vix < 20) return 2  // Tropical Depression
    if (vix < 25) return 3  // Tropical Storm
    if (vix < 30) return 4  // Category 1 Hurricane
    if (vix < 40) return 5  // Category 2 Hurricane
    return 5  // Category 5 Hurricane
  }
}

// Confidence Scoring System
export class ConfidenceScoring {
  // Calculate prediction confidence
  static calculatePredictionConfidence(r2Score: number): number {
    return Math.max(0, Math.min(1, r2Score))
  }

  // Calculate technical alignment score
  static calculateTechnicalAlignment(
    predictedDirection: 'bullish' | 'bearish',
    indicators: TechnicalIndicators
  ): number {
    let alignedSignals = 0
    let totalSignals = 0

    // RSI signal
    totalSignals++
    if ((predictedDirection === 'bullish' && indicators.rsi < 30) ||
        (predictedDirection === 'bearish' && indicators.rsi > 70)) {
      alignedSignals++
    }

    // MACD signal
    totalSignals++
    if ((predictedDirection === 'bullish' && indicators.macd.histogram > 0) ||
        (predictedDirection === 'bearish' && indicators.macd.histogram < 0)) {
      alignedSignals++
    }

    // Moving average signal
    totalSignals++
    if ((predictedDirection === 'bullish' && indicators.ma5 > indicators.ma20) ||
        (predictedDirection === 'bearish' && indicators.ma5 < indicators.ma20)) {
      alignedSignals++
    }

    // Bollinger Bands signal
    totalSignals++
    const currentPrice = indicators.ma5 // Proxy for current price
    if ((predictedDirection === 'bullish' && currentPrice < indicators.bollingerBands.lower) ||
        (predictedDirection === 'bearish' && currentPrice > indicators.bollingerBands.upper)) {
      alignedSignals++
    }

    return alignedSignals / totalSignals
  }

  // Calculate environmental favorability
  static calculateEnvironmentalScore(vix: number, volume: number, avgVolume: number): number {
    const vixScore = vix < 20 ? 1 : vix < 30 ? 0.7 : 0.4
    const volumeScore = volume > avgVolume * 1.2 ? 1 : volume > avgVolume * 0.8 ? 0.7 : 0.4
    return (vixScore + volumeScore) / 2
  }

  // Calculate timeframe reliability
  static getTimeframeReliability(timeframe: string): number {
    const reliabilities: { [key: string]: number } = {
      '15m': 0.5,
      '1h': 0.65,
      '4h': 0.75,
      '1d': 0.85,
      '1w': 0.9
    }
    return reliabilities[timeframe] || 0.5
  }

  // Calculate overall confidence
  static calculateOverallConfidence(
    predictionConfidence: number,
    technicalAlignment: number,
    environmentalScore: number,
    timeframeReliability: number,
    weights = [0.3, 0.3, 0.2, 0.2]
  ): number {
    const confidence = 
      weights[0] * predictionConfidence +
      weights[1] * technicalAlignment +
      weights[2] * environmentalScore +
      weights[3] * timeframeReliability

    return Math.max(0, Math.min(1, confidence))
  }
}

// Kelly Criterion Position Sizing
export class KellyCriterion {
  // Calculate optimal position size
  static calculateOptimalSize(
    confidence: number,
    expectedReturn: number,
    volatility: number,
    maxPosition: number = 0.25
  ): number {
    if (volatility === 0) return 0
    
    const sharpeRatio = expectedReturn / volatility
    const kellyFraction = (confidence * sharpeRatio - (1 - confidence)) / sharpeRatio
    
    // Apply square root scaling for safety
    const scaledFraction = kellyFraction * Math.sqrt(confidence)
    
    // Apply constraints
    return Math.min(maxPosition, Math.max(0, scaledFraction))
  }

  // Adjust for volatility regime
  static adjustForVolatility(
    baseSize: number,
    currentVolatility: number,
    targetVolatility: number
  ): number {
    if (currentVolatility <= targetVolatility) return baseSize
    
    const adjustmentFactor = Math.sqrt(targetVolatility / currentVolatility)
    return baseSize * adjustmentFactor
  }
}

// Options Greeks Calculator (Black-Scholes)
export class OptionsGreeks {
  // Cumulative normal distribution
  static normCDF(x: number): number {
    const a1 = 0.254829592
    const a2 = -0.284496736
    const a3 = 1.421413741
    const a4 = -1.453152027
    const a5 = 1.061405429
    const p = 0.3275911

    const sign = x < 0 ? -1 : 1
    x = Math.abs(x) / Math.sqrt(2.0)

    const t = 1.0 / (1.0 + p * x)
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x)

    return 0.5 * (1.0 + sign * y)
  }

  // Normal probability density
  static normPDF(x: number): number {
    return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI)
  }

  // Calculate d1 and d2
  static calculateD1D2(S: number, K: number, r: number, sigma: number, T: number) {
    const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T))
    const d2 = d1 - sigma * Math.sqrt(T)
    return { d1, d2 }
  }

  // Calculate Delta
  static calculateDelta(S: number, K: number, r: number, sigma: number, T: number, isCall: boolean): number {
    const { d1 } = this.calculateD1D2(S, K, r, sigma, T)
    return isCall ? this.normCDF(d1) : this.normCDF(d1) - 1
  }

  // Calculate Gamma
  static calculateGamma(S: number, K: number, r: number, sigma: number, T: number): number {
    const { d1 } = this.calculateD1D2(S, K, r, sigma, T)
    return this.normPDF(d1) / (S * sigma * Math.sqrt(T))
  }

  // Calculate Theta
  static calculateTheta(S: number, K: number, r: number, sigma: number, T: number, isCall: boolean): number {
    const { d1, d2 } = this.calculateD1D2(S, K, r, sigma, T)
    const term1 = -(S * this.normPDF(d1) * sigma) / (2 * Math.sqrt(T))
    
    if (isCall) {
      const term2 = -r * K * Math.exp(-r * T) * this.normCDF(d2)
      return (term1 + term2) / 365 // Convert to daily theta
    } else {
      const term2 = r * K * Math.exp(-r * T) * this.normCDF(-d2)
      return (term1 + term2) / 365
    }
  }

  // Calculate Vega
  static calculateVega(S: number, K: number, r: number, sigma: number, T: number): number {
    const { d1 } = this.calculateD1D2(S, K, r, sigma, T)
    return S * this.normPDF(d1) * Math.sqrt(T) / 100 // Divide by 100 for 1% volatility change
  }
}

// 0DTE Options Scanner
export class OptionsScanner {
  // Score option contract
  static scoreOption(
    delta: number,
    gamma: number,
    theta: number,
    liquidity: number,
    weights = [0.3, 0.3, -0.2, 0.2]
  ): number {
    return weights[0] * Math.abs(delta) + 
           weights[1] * gamma + 
           weights[2] * theta + 
           weights[3] * liquidity
  }

  // Calculate entry, target, and stop loss
  static calculateOptionLevels(
    optionPrice: number,
    delta: number,
    expectedMove: number,
    slippage: number = 0.02
  ) {
    const entry = optionPrice * (1 + slippage)
    const target = entry * (1 + expectedMove * Math.abs(delta))
    const stopLoss = entry * 0.7 // 30% stop loss
    const riskRewardRatio = (target - entry) / (entry - stopLoss)

    return { entry, target, stopLoss, riskRewardRatio }
  }
}

// Main Prediction Engine
export class PredictionEngine {
  // Generate prediction for a timeframe
  static generatePrediction(
    candles: Candle[],
    timeframe: string,
    vix: number = 15
  ): Prediction {
    const prices = candles.map(c => c.close)
    const currentPrice = prices[prices.length - 1]

    // Calculate technical indicators
    const indicators: TechnicalIndicators = {
      rsi: TechnicalAnalysis.calculateRSI(prices),
      macd: TechnicalAnalysis.calculateMACD(prices),
      ma5: prices.slice(-5).reduce((a, b) => a + b, 0) / 5,
      ma20: prices.slice(-20).reduce((a, b) => a + b, 0) / 20,
      ma50: prices.slice(-50).reduce((a, b) => a + b, 0) / Math.min(50, prices.length),
      ma200: prices.slice(-200).reduce((a, b) => a + b, 0) / Math.min(200, prices.length),
      bollingerBands: TechnicalAnalysis.calculateBollingerBands(prices),
      atr: TechnicalAnalysis.calculateATR(candles)
    }

    // Determine direction based on technical signals
    let bullishSignals = 0
    let bearishSignals = 0

    if (indicators.rsi < 30) bullishSignals++
    if (indicators.rsi > 70) bearishSignals++
    if (indicators.macd.histogram > 0) bullishSignals++
    if (indicators.macd.histogram < 0) bearishSignals++
    if (indicators.ma5 > indicators.ma20) bullishSignals++
    if (indicators.ma5 < indicators.ma20) bearishSignals++

    const direction = bullishSignals > bearishSignals ? 'bullish' : 
                     bearishSignals > bullishSignals ? 'bearish' : 'neutral'

    // Calculate expected return based on ATR
    const expectedReturn = direction === 'bullish' ? indicators.atr / currentPrice :
                          direction === 'bearish' ? -indicators.atr / currentPrice : 0

    // Calculate confidence
    const predictionConfidence = 0.6 + Math.random() * 0.3 // Simulated R² score
    const technicalAlignment = ConfidenceScoring.calculateTechnicalAlignment(
      direction as 'bullish' | 'bearish', 
      indicators
    )
    const environmentalScore = ConfidenceScoring.calculateEnvironmentalScore(
      vix, 
      candles[candles.length - 1].volume, 
      candles.slice(-20).reduce((a, c) => a + c.volume, 0) / 20
    )
    const timeframeReliability = ConfidenceScoring.getTimeframeReliability(timeframe)

    const confidence = ConfidenceScoring.calculateOverallConfidence(
      predictionConfidence,
      technicalAlignment,
      environmentalScore,
      timeframeReliability
    )

    // Calculate hurricane intensity
    const hurricaneIntensity = HurricaneModel.vixToHurricane(vix)

    // Calculate position size using Kelly criterion
    const positionSize = KellyCriterion.calculateOptimalSize(
      confidence,
      Math.abs(expectedReturn),
      indicators.atr / currentPrice
    )

    // Calculate entry, target, and stop loss
    const entryPrice = currentPrice
    const targetPrice = entryPrice * (1 + expectedReturn * 2)
    const stopLoss = entryPrice * (1 - indicators.atr / currentPrice)
    const riskRewardRatio = Math.abs((targetPrice - entryPrice) / (entryPrice - stopLoss))

    // Format technical signals
    const technicalSignals = {
      rsi: indicators.rsi > 70 ? 'Overbought' : indicators.rsi < 30 ? 'Oversold' : 'Neutral',
      macd: indicators.macd.histogram > 0 ? 'Bullish' : indicators.macd.histogram < 0 ? 'Bearish' : 'Neutral',
      movingAverages: indicators.ma5 > indicators.ma20 ? 'Bullish' : indicators.ma5 < indicators.ma20 ? 'Bearish' : 'Neutral',
      bollingerBands: currentPrice > indicators.bollingerBands.upper ? 'Overbought' : 
                      currentPrice < indicators.bollingerBands.lower ? 'Oversold' : 'Neutral'
    }

    return {
      timeframe,
      direction,
      expectedReturn,
      confidence,
      hurricaneIntensity,
      positionSize,
      entryPrice,
      targetPrice,
      stopLoss,
      riskRewardRatio,
      technicalSignals
    }
  }

  // Generate options recommendation
  static generateOptionsRecommendation(
    prediction: Prediction,
    currentPrice: number,
    impliedVolatility: number = 0.2,
    riskFreeRate: number = 0.05
  ): OptionsRecommendation {
    const isCall = prediction.direction === 'bullish'
    const strike = isCall ? 
      Math.ceil(currentPrice * 1.005) : // Slightly OTM call
      Math.floor(currentPrice * 0.995)   // Slightly OTM put

    const timeToExpiration = 1/365 // 0DTE
    
    // Calculate Greeks
    const delta = OptionsGreeks.calculateDelta(currentPrice, strike, riskFreeRate, impliedVolatility, timeToExpiration, isCall)
    const gamma = OptionsGreeks.calculateGamma(currentPrice, strike, riskFreeRate, impliedVolatility, timeToExpiration)
    const theta = OptionsGreeks.calculateTheta(currentPrice, strike, riskFreeRate, impliedVolatility, timeToExpiration, isCall)
    const vega = OptionsGreeks.calculateVega(currentPrice, strike, riskFreeRate, impliedVolatility, timeToExpiration)

    // Calculate option price (simplified)
    const optionPrice = Math.abs(currentPrice - strike) * Math.abs(delta) + 0.5

    // Calculate levels
    const levels = OptionsScanner.calculateOptionLevels(
      optionPrice,
      delta,
      prediction.expectedReturn
    )

    return {
      timeframe: prediction.timeframe,
      type: isCall ? 'call' : 'put',
      strike,
      expiration: '0DTE',
      delta,
      gamma,
      theta,
      vega,
      impliedVolatility,
      entry: levels.entry,
      target: levels.target,
      stopLoss: levels.stopLoss,
      riskRewardRatio: levels.riskRewardRatio,
      confidence: prediction.confidence
    }
  }
}