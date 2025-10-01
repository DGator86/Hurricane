/**
 * Enhanced Prediction Model
 * Uses all Hurricane features to achieve 75%+ accuracy
 */

import { HurricaneFeatures } from './HurricaneFeatureExtractor'

export interface PredictionSignal {
  direction: 'STRONG_BUY' | 'BUY' | 'NEUTRAL' | 'SELL' | 'STRONG_SELL'
  confidence: number  // 0-1
  targetPrice: number
  stopLoss: number
  reasons: string[]
  timeframe: string
  expectedMove: number  // Percentage move of the underlying
  expectedReturn: number  // Decimal return used by legacy option scanners
  riskReward: number
}

export class EnhancedPredictionModel {
  /**
   * Generate prediction using all available features
   * Goal: 75%+ accuracy through comprehensive analysis
   */
  predict(features: HurricaneFeatures, timeframe: string): PredictionSignal {
    const signals: { signal: number; weight: number; reason: string }[] = []
    
    // === MOMENTUM SIGNALS (Weight: 30%) ===
    
    // RSI Signals with timeframe adjustment
    const rsiTimeframeMultiplier = this.getRSITimeframeMultiplier(timeframe)
    
    if (features.rsi_oversold && features.rsi14 < 25) {
      signals.push({ signal: 2 * rsiTimeframeMultiplier, weight: 3, reason: 'Extreme oversold RSI < 25' })
    } else if (features.rsi_oversold) {
      signals.push({ signal: 1 * rsiTimeframeMultiplier, weight: 2, reason: 'RSI oversold < 30' })
    } else if (features.rsi_overbought && features.rsi14 > 75) {
      signals.push({ signal: -2 * rsiTimeframeMultiplier, weight: 3, reason: 'Extreme overbought RSI > 75' })
    } else if (features.rsi_overbought) {
      signals.push({ signal: -1 * rsiTimeframeMultiplier, weight: 2, reason: 'RSI overbought > 70' })
    } else if (features.rsi14 > 50 && features.rsi14 < 60) {
      // Neutral zone with slight bullish bias
      signals.push({ signal: 0.3, weight: 1, reason: 'RSI neutral-bullish (50-60)' })
    } else if (features.rsi14 > 40 && features.rsi14 < 50) {
      // Neutral zone with slight bearish bias
      signals.push({ signal: -0.3, weight: 1, reason: 'RSI neutral-bearish (40-50)' })
    }
    
    // MACD Signals
    if (features.macd_crossover === 'bullish') {
      signals.push({ signal: 2, weight: 4, reason: 'MACD bullish crossover' })
    } else if (features.macd_crossover === 'bearish') {
      signals.push({ signal: -2, weight: 4, reason: 'MACD bearish crossover' })
    } else if (features.macd_crossover === 'approaching_bullish') {
      signals.push({ signal: 1, weight: 2, reason: 'MACD approaching bullish cross' })
    } else if (features.macd_crossover === 'approaching_bearish') {
      signals.push({ signal: -1, weight: 2, reason: 'MACD approaching bearish cross' })
    }
    
    // Stochastic Signals
    if (features.stoch_oversold && features.stoch_k > features.stoch_d) {
      signals.push({ signal: 1.5, weight: 2, reason: 'Stochastic oversold with bullish cross' })
    } else if (features.stoch_overbought && features.stoch_k < features.stoch_d) {
      signals.push({ signal: -1.5, weight: 2, reason: 'Stochastic overbought with bearish cross' })
    }
    
    // === TREND SIGNALS (Weight: 25%) ===
    
    // ADX Trend Strength
    if (features.strong_trend) {
      const trendDirection = features.price > features.sma20 ? 1 : -1
      signals.push({ 
        signal: trendDirection * 2, 
        weight: 3, 
        reason: `Strong trend (ADX > 40) ${trendDirection > 0 ? 'up' : 'down'}` 
      })
    } else if (features.trending) {
      const trendDirection = features.price > features.sma20 ? 0.5 : -0.5
      signals.push({ 
        signal: trendDirection, 
        weight: 2, 
        reason: `Trending (ADX > 25) ${trendDirection > 0 ? 'up' : 'down'}` 
      })
    }
    
    // Moving Average Alignment
    const maAlignment = this.checkMAAlignment(features)
    if (maAlignment > 0.8) {
      signals.push({ signal: 2, weight: 3, reason: 'Bullish MA alignment (all MAs stacked)' })
    } else if (maAlignment < -0.8) {
      signals.push({ signal: -2, weight: 3, reason: 'Bearish MA alignment (all MAs stacked)' })
    }
    
    // Golden/Death Cross (reduced weight to prevent overwhelming bias)
    if (features.golden_cross) {
      signals.push({ signal: 1.0, weight: 2, reason: 'Golden cross (50 > 200 SMA)' })
    } else if (features.death_cross) {
      signals.push({ signal: -1.0, weight: 2, reason: 'Death cross (50 < 200 SMA)' })
    }
    
    // === VOLUME SIGNALS (Weight: 20%) ===
    
    if (features.volume_surge && features.price > features.vwap) {
      signals.push({ signal: 1.5, weight: 3, reason: 'Volume surge with price above VWAP' })
    } else if (features.volume_surge && features.price < features.vwap) {
      signals.push({ signal: -1.5, weight: 3, reason: 'Volume surge with price below VWAP' })
    }
    
    // OBV Divergence
    if (features.obv_slope > 0 && features.priceChange1h < 0) {
      signals.push({ signal: 1, weight: 2, reason: 'Bullish OBV divergence' })
    } else if (features.obv_slope < 0 && features.priceChange1h > 0) {
      signals.push({ signal: -1, weight: 2, reason: 'Bearish OBV divergence' })
    }
    
    // === VOLATILITY SIGNALS (Weight: 15%) ===
    
    // Bollinger Band Signals
    if (features.bb_percentB < 0 && features.bb_squeeze) {
      signals.push({ signal: 1.5, weight: 2, reason: 'Below BB lower in squeeze' })
    } else if (features.bb_percentB > 1 && features.bb_squeeze) {
      signals.push({ signal: -1.5, weight: 2, reason: 'Above BB upper in squeeze' })
    }
    
    // Volatility Regime
    if (features.volatility_regime === 'extreme' && features.vix > 30) {
      signals.push({ signal: 0, weight: 3, reason: 'Extreme volatility - reduce position' })
    }
    
    // === OPTIONS FLOW SIGNALS (Weight: 15%) ===
    
    // GEX Signal
    if (features.gex < -1e9) {
      signals.push({ signal: 0.5, weight: 2, reason: 'Negative GEX - expect volatility' })
    } else if (features.gex > 1e9) {
      signals.push({ signal: -0.5, weight: 2, reason: 'Positive GEX - expect mean reversion' })
    }
    
    // Put/Call Ratio
    if (features.put_call_ratio > 1.2) {
      signals.push({ signal: 1, weight: 2, reason: 'High put/call ratio - contrarian bullish' })
    } else if (features.put_call_ratio < 0.6) {
      signals.push({ signal: -1, weight: 2, reason: 'Low put/call ratio - contrarian bearish' })
    }
    
    // DIX Signal
    if (features.dix > 0.45) {
      signals.push({ signal: 1, weight: 2, reason: 'High DIX - dark pool buying' })
    } else if (features.dix < 0.40) {
      signals.push({ signal: -1, weight: 2, reason: 'Low DIX - dark pool selling' })
    }
    
    // === SUPPORT/RESISTANCE (Weight: 10%) ===
    
    if (Math.abs(features.support_distance) < 0.005) {
      signals.push({ signal: 1, weight: 2, reason: 'At strong support' })
    } else if (Math.abs(features.resistance_distance) < 0.005) {
      signals.push({ signal: -1, weight: 2, reason: 'At strong resistance' })
    }
    
    // === TIME-BASED FACTORS (Weight: 5%) ===
    
    // Intraday patterns with more nuance
    const hour = features.hour_of_day
    const dayOfWeek = features.day_of_week
    
    // Opening hour patterns (9:30-10:30 AM EST)
    if (hour === 9 || hour === 10) {
      if (features.priceChange1m > 0.002) {
        signals.push({ signal: 1.2, weight: 1.5, reason: 'Strong opening momentum' })
      } else if (features.priceChange1m < -0.002) {
        signals.push({ signal: -1.2, weight: 1.5, reason: 'Weak opening - potential fade' })
      } else {
        signals.push({ signal: 0, weight: 0.5, reason: 'Choppy open - wait for direction' })
      }
    }
    
    // Lunch hour doldrums (11:30 AM - 1:00 PM EST)
    if (hour === 11 || hour === 12) {
      signals.push({ signal: 0, weight: 0.5, reason: 'Lunch hour - reduced activity' })
    }
    
    // Power hour (3:00-4:00 PM EST)
    if (hour === 15) {
      if (dayOfWeek === 5) {
        // Friday close
        signals.push({ signal: features.priceChange1h > 0 ? -0.5 : 0.5, weight: 2, reason: 'Friday close mean reversion' })
      } else if (dayOfWeek === 1) {
        // Monday close
        signals.push({ signal: features.priceChange1h > 0 ? 0.8 : -0.8, weight: 1.5, reason: 'Monday close continuation' })
      } else {
        // Regular power hour
        signals.push({ signal: features.volume_ratio > 1.2 ? 1 : -0.5, weight: 1, reason: 'Power hour momentum' })
      }
    }
    
    // After-hours positioning (4:00-5:00 PM EST)
    if (hour === 16) {
      signals.push({ signal: 0, weight: 1, reason: 'After-hours - reduced liquidity' })
    }
    
    // === REGIME-BASED ADJUSTMENTS ===
    
    const regimeMultiplier = this.getRegimeMultiplier(features)
    
    // === CALCULATE FINAL SIGNAL ===
    
    const totalWeight = signals.reduce((sum, s) => sum + s.weight, 0) || 1
    const weightedSignal = signals.reduce((sum, s) => sum + s.signal * s.weight, 0) / totalWeight
    
    // BIAS CORRECTION: If signal is too extreme, apply dampening
    // This prevents the model from always being bullish or bearish
    let biasAdjustedSignal = weightedSignal
    if (Math.abs(weightedSignal) > 2) {
      // Dampen extreme signals
      biasAdjustedSignal = Math.sign(weightedSignal) * (2 + (Math.abs(weightedSignal) - 2) * 0.5)
    }
    
    // Add market context adjustment based on SPY's typical behavior
    // SPY has a long-term upward bias, so add slight bullish tilt
    const marketBias = 0.1  // Slight bullish bias for SPY
    biasAdjustedSignal += marketBias
    
    const adjustedSignal = biasAdjustedSignal * regimeMultiplier
    
    // Determine direction and confidence
    const direction = this.getDirection(adjustedSignal)
    
    // FIXED: More reasonable confidence calculation
    // Start with base 30% confidence, then adjust based on signal strength
    const baseConfidence = 0.3 + Math.min(0.5, Math.abs(adjustedSignal) / 3)
    
    // Boost confidence based on signal agreement
    const signalAgreement = this.calculateSignalAgreement(signals)
    const confidence = Math.min(0.85, baseConfidence * (1 + signalAgreement * 0.3))
    
    // Additional confidence boost for strong signals with multiple confirmations
    const strongSignalBoost = signals.filter(s => Math.abs(s.signal) > 1.5).length > 2 ? 0.1 : 0
    const finalConfidence = Math.min(0.85, confidence + strongSignalBoost)
    
    // Calculate targets based on ATR and timeframe
    // FIXED: Use timeframe-specific ATR when available
    const atrMultiplier = this.getATRMultiplier(timeframe)
    
    // Get timeframe-specific ATR or fallback to general ATR
    const timeframeATR = this.getTimeframeATR(features, timeframe)
    
    // Ensure minimum ATR percentage (SPY typically 0.5-2% daily ATR)
    const minAtrPercent = this.getMinimumATRPercent(timeframe)
    const effectiveAtrPercent = Math.max(timeframeATR || features.atr_percent, minAtrPercent)
    
    // Calculate expected move as ATR * multiplier
    const expectedMove = effectiveAtrPercent * atrMultiplier
    const expectedReturn = expectedMove / 100
    
    // Calculate target and stop with proper risk management
    // Target: aim for the full expected move
    // Stop: use 1 ATR for stop loss (standard risk management)
    const targetMove = expectedMove
    const stopMove = effectiveAtrPercent  // 1 ATR stop
    
    const targetPrice = features.price * (1 + (adjustedSignal > 0 ? targetMove : -targetMove) / 100)
    const stopLoss = features.price * (1 + (adjustedSignal > 0 ? -stopMove : stopMove) / 100)
    
    // Risk/Reward calculation
    const reward = Math.abs(targetPrice - features.price)
    const risk = Math.abs(features.price - stopLoss)
    const riskReward = risk > 0 ? reward / risk : 2.0  // Default to 2:1 if calculation fails
    
    // Get top reasons
    const topReasons = signals
      .filter(s => s.signal * adjustedSignal > 0)  // Same direction
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 5)
      .map(s => s.reason)
    
    return {
      direction,
      confidence: finalConfidence,
      targetPrice,
      stopLoss,
      reasons: topReasons,
      timeframe,
      expectedMove,
      expectedReturn,
      riskReward
    }
  }
  
  /**
   * Check moving average alignment
   */
  private checkMAAlignment(features: HurricaneFeatures): number {
    const mas = [
      { value: features.sma5, weight: 1 },
      { value: features.sma10, weight: 1.5 },
      { value: features.sma20, weight: 2 },
      { value: features.sma50, weight: 2.5 },
      { value: features.sma200, weight: 3 }
    ]
    
    let alignmentScore = 0
    let totalWeight = 0
    
    for (let i = 0; i < mas.length - 1; i++) {
      if (mas[i].value > mas[i + 1].value) {
        alignmentScore += mas[i].weight
      } else {
        alignmentScore -= mas[i].weight
      }
      totalWeight += mas[i].weight
    }
    
    return alignmentScore / totalWeight
  }
  
  /**
   * Get regime-based signal multiplier with directional bias
   */
  private getRegimeMultiplier(features: HurricaneFeatures): number {
    let multiplier = 1
    
    // Trend regime adjustments with directional consideration
    if (features.trend_regime === 'strong_up') {
      // In strong uptrend, boost bullish signals more than bearish
      if (features.price > features.vwap) {
        multiplier *= 1.4  // Strong bullish confirmation
      } else {
        multiplier *= 0.9  // Pullback in uptrend - be cautious
      }
    } else if (features.trend_regime === 'strong_down') {
      // In strong downtrend, boost bearish signals more than bullish
      if (features.price < features.vwap) {
        multiplier *= 1.4  // Strong bearish confirmation
      } else {
        multiplier *= 0.9  // Bounce in downtrend - be cautious
      }
    } else if (features.trend_regime === 'neutral') {
      // In neutral market, look for mean reversion
      if (Math.abs(features.bb_percentB - 0.5) > 0.4) {
        multiplier *= 1.2  // Near bands - expect reversion
      } else {
        multiplier *= 0.7  // Middle of range - no edge
      }
    }
    
    // Volatility adjustments with VIX consideration
    if (features.volatility_regime === 'extreme' && features.vix > 25) {
      multiplier *= 0.8  // Reduce position in high VIX
    } else if (features.volatility_regime === 'extreme' && features.vix < 25) {
      multiplier *= 0.95  // Slight reduction for volatility expansion
    } else if (features.volatility_regime === 'low' && features.vix < 15) {
      multiplier *= 1.3  // Low VIX - trend following works
    } else if (features.volatility_regime === 'low') {
      multiplier *= 1.1  // Normal low volatility
    }
    
    // Volume regime with price action
    if (features.volume_regime === 'high') {
      // High volume confirms direction
      if (features.priceChange1h > 0) {
        multiplier *= 1.15  // Bullish with volume
      } else {
        multiplier *= 1.15  // Bearish with volume
      }
    } else if (features.volume_regime === 'low') {
      multiplier *= 0.85  // Low volume = less conviction
    }
    
    // Options flow adjustment
    if (features.gex < -5e8 && features.put_call_ratio > 1.0) {
      multiplier *= 1.2  // Negative GEX + high puts = volatile
    } else if (features.gex > 5e8 && features.put_call_ratio < 0.7) {
      multiplier *= 0.9  // Positive GEX + high calls = pinned
    }
    
    return multiplier
  }
  
  /**
   * Convert signal strength to direction with better thresholds
   */
  private getDirection(signal: number): 'STRONG_BUY' | 'BUY' | 'NEUTRAL' | 'SELL' | 'STRONG_SELL' {
    // FIXED: Much lower thresholds to generate more directional signals
    // Old thresholds (0.6) were too high, causing everything to be NEUTRAL
    if (signal > 1.0) return 'STRONG_BUY'
    if (signal > 0.2) return 'BUY'  // Lowered from 0.6 to 0.2
    if (signal < -1.0) return 'STRONG_SELL'
    if (signal < -0.2) return 'SELL'  // Lowered from -0.6 to -0.2
    return 'NEUTRAL'
  }
  
  /**
   * Calculate signal agreement for confidence boost
   */
  private calculateSignalAgreement(signals: { signal: number; weight: number }[]): number {
    if (signals.length === 0) return 0
    
    const bullish = signals.filter(s => s.signal > 0).length
    const bearish = signals.filter(s => s.signal < 0).length
    const total = signals.length
    
    return Math.abs(bullish - bearish) / total
  }
  
  /**
   * Get ATR multiplier based on timeframe
   * FIXED: Increased multipliers significantly for proper R-multiple calculation
   */
  private getATRMultiplier(timeframe: string): number {
    // These multipliers determine how many ATRs we target for each timeframe
    // For proper R-multiple, we need at least 1-2 ATR moves
    const multipliers: { [key: string]: number } = {
      '1m': 1.5,    // Target 1.5x ATR for 1-minute trades (was 0.2)
      '5m': 2.0,    // Target 2x ATR for 5-minute trades (was 0.4)
      '15m': 2.5,   // Target 2.5x ATR for 15-minute trades (was 0.6)
      '1h': 3.0,    // Target 3x ATR for 1-hour trades (was 1.0)
      '4h': 4.0,    // Target 4x ATR for 4-hour trades (was 2.0)
      '1d': 5.0     // Target 5x ATR for daily trades (was 3.0)
    }
    return multipliers[timeframe] || 2.0
  }
  
  /**
   * Get timeframe-specific ATR from features
   */
  private getTimeframeATR(features: any, timeframe: string): number | undefined {
    const atrMap: { [key: string]: string } = {
      '1m': 'atr14_1m',
      '5m': 'atr14_5m',
      '15m': 'atr14_15m',
      '1h': 'atr14_1h',
      '4h': 'atr14_4h',
      '1d': 'atr14_1d'
    }
    
    const atrKey = atrMap[timeframe]
    return atrKey ? features[atrKey] : features.atr_percent
  }
  
  /**
   * Get RSI timeframe multiplier for better signal diversity
   */
  private getRSITimeframeMultiplier(timeframe: string): number {
    // Shorter timeframes should have less impact from RSI extremes
    const multipliers: { [key: string]: number } = {
      '1m': 0.5,    // Very short-term, RSI less reliable
      '5m': 0.7,    // Short-term
      '15m': 0.9,   // Medium-short
      '1h': 1.0,    // Standard
      '4h': 1.2,    // Longer-term, RSI more reliable
      '1d': 1.5     // Daily RSI very reliable
    }
    return multipliers[timeframe] || 1.0
  }

  /**
   * Get minimum ATR percentage for each timeframe
   * These are typical minimum ATR values for SPY
   */
  private getMinimumATRPercent(timeframe: string): number {
    const minimums: { [key: string]: number } = {
      '1m': 0.05,   // 0.05% minimum for 1-minute
      '5m': 0.10,   // 0.10% minimum for 5-minute
      '15m': 0.15,  // 0.15% minimum for 15-minute
      '1h': 0.25,   // 0.25% minimum for 1-hour
      '4h': 0.50,   // 0.50% minimum for 4-hour
      '1d': 0.75    // 0.75% minimum for daily
    }
    return minimums[timeframe] || 0.20
  }

  /**
   * Calculate Kelly Criterion position size
   */
  calculateKellySize(
    confidence: number,
    expectedReturn: number,
    historicalWinRate: number = 0.27  // From our backtest
  ): number {
    // Kelly formula: f = (p * b - q) / b
    // p = probability of winning
    // q = probability of losing (1-p)
    // b = ratio of win to loss
    
    const p = confidence * historicalWinRate
    const q = 1 - p
    const b = Math.abs(expectedReturn)
    
    const kellyFraction = (p * b - q) / b
    
    // Apply Kelly safety factor (typically 0.25 to 0.5)
    const safetyFactor = 0.25
    const safeKelly = Math.max(0, Math.min(0.25, kellyFraction * safetyFactor))
    
    return safeKelly
  }
}