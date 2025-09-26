/**
 * Signal fusion with caps, voting, and regime-specific weights
 * Prevents any single indicator from hijacking the decision
 */

import { TFData } from './TimeframeDataLoader'

export interface Signal {
  source: string
  value: number      // Raw signal strength
  weight: number     // Importance weight
  confidence: number // Confidence in this signal
}

export interface FusedSignal {
  direction: 'STRONG_BUY' | 'BUY' | 'NEUTRAL' | 'SELL' | 'STRONG_SELL'
  rawSignal: number
  confidence: number
  regime: string
  reasons: string[]
  disagreement: number
  shouldTrade: boolean
}

// Configuration
const MAX_WEIGHT = 0.20      // Cap any single signal at 20% influence
const MIN_CONFIRMATIONS = 3  // Need 3+ agreeing signals for directional call
const ABSTAIN_THRESHOLD = 0.6 // Abstain if disagreement > 60%

/**
 * Bounded weight to prevent single-indicator dominance
 */
function boundedWeight(weight: number): number {
  return Math.sign(weight) * Math.min(Math.abs(weight), MAX_WEIGHT)
}

/**
 * Vote on direction based on multiple signals
 */
function vote(signals: number[]): number {
  const bullish = signals.filter(s => s > 0).length
  const bearish = signals.filter(s => s < 0).length
  
  if (bullish >= MIN_CONFIRMATIONS && bullish > bearish) return +1
  if (bearish >= MIN_CONFIRMATIONS && bearish > bullish) return -1
  return 0  // Neutral if no clear majority
}

/**
 * Calculate disagreement among sub-signals
 */
function calculateDisagreement(signals: Signal[]): number {
  if (signals.length === 0) return 1
  
  const signs = signals.map(s => Math.sign(s.value))
  const avgSign = signs.reduce((a, b) => a + b, 0) / signs.length
  
  // Disagreement is high when signs are mixed
  return 1 - Math.abs(avgSign)
}

/**
 * Generate signals from TF data with regime awareness
 */
export function generateSignals(tfData: TFData): Signal[] {
  const signals: Signal[] = []
  const { indicators, regime } = tfData
  
  // RSI signals (regime-aware)
  if (regime === 'Trend') {
    // In trend, oversold is stronger buy signal
    if (indicators.rsi < 30) {
      signals.push({ source: 'RSI_oversold_trend', value: 2, weight: 0.15, confidence: 0.8 })
    } else if (indicators.rsi < 40) {
      signals.push({ source: 'RSI_pullback_trend', value: 1, weight: 0.1, confidence: 0.6 })
    } else if (indicators.rsi > 70) {
      signals.push({ source: 'RSI_overbought_trend', value: -0.5, weight: 0.05, confidence: 0.4 })
    }
  } else if (regime === 'Range') {
    // In range, fade extremes
    if (indicators.rsi < 30) {
      signals.push({ source: 'RSI_oversold_range', value: 1.5, weight: 0.15, confidence: 0.7 })
    } else if (indicators.rsi > 70) {
      signals.push({ source: 'RSI_overbought_range', value: -1.5, weight: 0.15, confidence: 0.7 })
    }
  } else {
    // Standard RSI signals for VolExp/Flux
    if (indicators.rsi < 30) {
      signals.push({ source: 'RSI_oversold', value: 1, weight: 0.1, confidence: 0.5 })
    } else if (indicators.rsi > 70) {
      signals.push({ source: 'RSI_overbought', value: -1, weight: 0.1, confidence: 0.5 })
    }
  }
  
  // MACD signals
  if (indicators.macdCrossover === 'bullish') {
    signals.push({ source: 'MACD_bullish_cross', value: 1.5, weight: 0.15, confidence: 0.7 })
  } else if (indicators.macdCrossover === 'bearish') {
    signals.push({ source: 'MACD_bearish_cross', value: -1.5, weight: 0.15, confidence: 0.7 })
  } else if (indicators.macdCrossover === 'approaching_bullish') {
    signals.push({ source: 'MACD_approaching_bull', value: 0.5, weight: 0.08, confidence: 0.4 })
  } else if (indicators.macdCrossover === 'approaching_bearish') {
    signals.push({ source: 'MACD_approaching_bear', value: -0.5, weight: 0.08, confidence: 0.4 })
  }
  
  // Bollinger Band signals (regime-aware)
  if (regime === 'Range' || regime === 'Flux') {
    // Fade BB extremes in ranging markets
    if (indicators.bb.percentB < 0) {
      signals.push({ source: 'BB_below_lower', value: 1.5, weight: 0.12, confidence: 0.6 })
    } else if (indicators.bb.percentB > 1) {
      signals.push({ source: 'BB_above_upper', value: -1.5, weight: 0.12, confidence: 0.6 })
    }
  } else if (regime === 'Trend') {
    // In trends, use BB as continuation
    if (indicators.bb.percentB > 0.8 && indicators.adx > 25) {
      signals.push({ source: 'BB_trend_continuation', value: 1, weight: 0.1, confidence: 0.5 })
    } else if (indicators.bb.percentB < 0.2 && indicators.adx > 25) {
      signals.push({ source: 'BB_trend_continuation', value: -1, weight: 0.1, confidence: 0.5 })
    }
  }
  
  // Volume signals
  if (indicators.volumeRatio > 1.5) {
    // High volume confirms direction
    const priceVsVWAP = (indicators.sma20 - indicators.vwap) / indicators.vwap
    if (priceVsVWAP > 0.002) {
      signals.push({ source: 'Volume_surge_bullish', value: 1, weight: 0.1, confidence: 0.6 })
    } else if (priceVsVWAP < -0.002) {
      signals.push({ source: 'Volume_surge_bearish', value: -1, weight: 0.1, confidence: 0.6 })
    }
  }
  
  // ADX trend strength
  if (indicators.adx > 40) {
    // Very strong trend
    const trendDir = indicators.ema9 > indicators.sma20 ? 1 : -1
    signals.push({ source: 'ADX_strong_trend', value: trendDir * 1.5, weight: 0.15, confidence: 0.7 })
  } else if (indicators.adx > 25) {
    // Moderate trend
    const trendDir = indicators.ema9 > indicators.sma20 ? 1 : -1
    signals.push({ source: 'ADX_moderate_trend', value: trendDir * 0.8, weight: 0.1, confidence: 0.5 })
  } else if (indicators.adx < 20) {
    // No trend - reduce all directional signals
    signals.push({ source: 'ADX_no_trend', value: 0, weight: 0.05, confidence: 0.3 })
  }
  
  // Moving average alignment
  if (indicators.ema9 > indicators.sma20 && indicators.sma20 > indicators.vwap) {
    signals.push({ source: 'MA_bullish_alignment', value: 1, weight: 0.1, confidence: 0.6 })
  } else if (indicators.ema9 < indicators.sma20 && indicators.sma20 < indicators.vwap) {
    signals.push({ source: 'MA_bearish_alignment', value: -1, weight: 0.1, confidence: 0.6 })
  }
  
  return signals
}

/**
 * Apply regime-specific weight adjustments
 */
function applyRegimeWeights(signals: Signal[], regime: TFData['regime']): Signal[] {
  return signals.map(signal => {
    const adjusted = { ...signal }
    
    switch (regime) {
      case 'Trend':
        // In trends, boost momentum signals
        if (signal.source.includes('MACD') || signal.source.includes('ADX')) {
          adjusted.weight *= 1.3
        }
        // Reduce mean reversion signals
        if (signal.source.includes('RSI') && signal.source.includes('range')) {
          adjusted.weight *= 0.7
        }
        break
        
      case 'Range':
        // In ranges, boost mean reversion
        if (signal.source.includes('RSI') || signal.source.includes('BB')) {
          adjusted.weight *= 1.2
        }
        // Reduce trend following
        if (signal.source.includes('trend')) {
          adjusted.weight *= 0.8
        }
        break
        
      case 'VolExp':
        // In high volatility, reduce all weights and widen stops
        adjusted.weight *= 0.7
        adjusted.confidence *= 0.8
        break
        
      case 'Flux':
        // In flux, be more conservative
        adjusted.weight *= 0.8
        adjusted.confidence *= 0.9
        break
    }
    
    // Apply bounded weight
    adjusted.weight = boundedWeight(adjusted.weight)
    
    return adjusted
  })
}

/**
 * Fuse signals into final prediction
 */
export function fuseSignals(tfData: TFData): FusedSignal {
  // Generate base signals
  let signals = generateSignals(tfData)
  
  // Apply regime-specific adjustments
  signals = applyRegimeWeights(signals, tfData.regime)
  
  // Calculate weighted signal
  const totalWeight = signals.reduce((sum, s) => sum + Math.abs(s.weight), 0) || 1
  const weightedSignal = signals.reduce((sum, s) => sum + s.value * s.weight, 0) / totalWeight
  
  // Calculate confidence based on agreement
  const disagreement = calculateDisagreement(signals)
  const baseConfidence = 0.3 + (1 - disagreement) * 0.4  // 30-70% based on agreement
  
  // Boost confidence if multiple strong signals agree
  const strongSignals = signals.filter(s => Math.abs(s.value) > 1)
  const strongAgreement = strongSignals.length > 0 
    ? strongSignals.filter(s => Math.sign(s.value) === Math.sign(weightedSignal)).length / strongSignals.length
    : 0
  const confidence = Math.min(0.85, baseConfidence + strongAgreement * 0.15)
  
  // Voting system for direction
  const votes = signals.map(s => s.value)
  const voteResult = vote(votes)
  
  // Determine if we should trade
  const shouldTrade = disagreement < ABSTAIN_THRESHOLD && Math.abs(voteResult) > 0
  
  // Final direction (combine weighted and voted)
  let direction: FusedSignal['direction']
  if (!shouldTrade || Math.abs(weightedSignal) < 0.2) {
    direction = 'NEUTRAL'
  } else if (weightedSignal > 1.0 && voteResult > 0) {
    direction = 'STRONG_BUY'
  } else if (weightedSignal > 0.2 && voteResult > 0) {
    direction = 'BUY'
  } else if (weightedSignal < -1.0 && voteResult < 0) {
    direction = 'STRONG_SELL'
  } else if (weightedSignal < -0.2 && voteResult < 0) {
    direction = 'SELL'
  } else {
    direction = 'NEUTRAL'
  }
  
  // Get top reasons
  const reasons = signals
    .filter(s => Math.sign(s.value) === Math.sign(weightedSignal))
    .sort((a, b) => Math.abs(b.value * b.weight) - Math.abs(a.value * a.weight))
    .slice(0, 3)
    .map(s => s.source.replace(/_/g, ' '))
  
  return {
    direction,
    rawSignal: weightedSignal,
    confidence: shouldTrade ? confidence : confidence * 0.5,  // Halve confidence if not trading
    regime: tfData.regime,
    reasons,
    disagreement,
    shouldTrade
  }
}

/**
 * Multi-timeframe fusion with z-score normalization
 */
export function fuseMulitpleTimeframes(tfDataArray: TFData[]): FusedSignal {
  // Get signals for each timeframe
  const tfSignals = tfDataArray.map(tfData => {
    const signal = fuseSignals(tfData)
    return {
      tf: tfData.tf,
      signal,
      weight: getTimeframeWeight(tfData.tf)
    }
  })
  
  // Z-score normalize across timeframes
  const rawSignals = tfSignals.map(t => t.signal.rawSignal)
  const mean = rawSignals.reduce((a, b) => a + b, 0) / rawSignals.length
  const variance = rawSignals.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / rawSignals.length
  const std = Math.sqrt(variance) + 1e-9
  
  // Normalized weighted average
  const totalWeight = tfSignals.reduce((sum, t) => sum + t.weight, 0)
  const normalizedSignal = tfSignals.reduce((sum, t) => {
    const zScore = (t.signal.rawSignal - mean) / std
    return sum + zScore * t.weight
  }, 0) / totalWeight
  
  // Combine confidences
  const avgConfidence = tfSignals.reduce((sum, t) => sum + t.signal.confidence * t.weight, 0) / totalWeight
  
  // Check for timeframe agreement
  const directions = tfSignals.map(t => t.signal.direction)
  const uniqueDirections = new Set(directions).size
  const agreementPenalty = 1 - (uniqueDirections - 1) * 0.1  // Penalty for disagreement
  
  // Final fused signal
  let finalDirection: FusedSignal['direction']
  if (Math.abs(normalizedSignal) < 0.3) {
    finalDirection = 'NEUTRAL'
  } else if (normalizedSignal > 1.5) {
    finalDirection = 'STRONG_BUY'
  } else if (normalizedSignal > 0.3) {
    finalDirection = 'BUY'
  } else if (normalizedSignal < -1.5) {
    finalDirection = 'STRONG_SELL'
  } else {
    finalDirection = 'SELL'
  }
  
  // Aggregate reasons
  const allReasons = tfSignals.flatMap(t => t.signal.reasons)
  const reasonCounts = new Map<string, number>()
  allReasons.forEach(r => reasonCounts.set(r, (reasonCounts.get(r) || 0) + 1))
  const topReasons = Array.from(reasonCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([reason]) => reason)
  
  // Should trade if majority agree
  const shouldTrade = tfSignals.filter(t => t.signal.shouldTrade).length > tfSignals.length / 2
  
  return {
    direction: finalDirection,
    rawSignal: normalizedSignal,
    confidence: avgConfidence * agreementPenalty,
    regime: tfSignals[0].signal.regime,  // Use shortest timeframe regime
    reasons: topReasons,
    disagreement: 1 - agreementPenalty,
    shouldTrade
  }
}

/**
 * Timeframe weights for multi-TF fusion
 */
function getTimeframeWeight(tf: string): number {
  const weights: Record<string, number> = {
    '1m': 0.1,   // Noise
    '5m': 0.15,  // Short-term
    '15m': 0.2,  // Intraday
    '1h': 0.25,  // Core
    '4h': 0.2,   // Swing
    '1d': 0.1    // Daily trend
  }
  return weights[tf] || 0.1
}