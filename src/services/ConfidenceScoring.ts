/**
 * Enhanced Confidence Scoring System for Hurricane SPY
 * Implements multi-factor confidence with Kelly criterion position sizing
 */

import { TFData } from './TimeframeDataLoader'
import { FusedSignal } from './SignalFusion'

export interface ConfidenceComponents {
  signalStrength: number      // Strength of technical signals (0-1)
  regimeAlignment: number      // How well signals align with regime (0-1)
  timeframeAgreement: number   // Agreement across timeframes (0-1)
  volumeConfirmation: number   // Volume supporting the move (0-1)
  marketConditions: number     // Overall market conditions (0-1)
  historicalAccuracy: number   // Historical accuracy in similar setups (0-1)
  volatilityFactor: number     // Volatility-adjusted confidence (0-1)
}

export interface EnhancedConfidence {
  raw: number                  // Raw confidence (0-1)
  calibrated: number           // Calibrated confidence for Kelly
  components: ConfidenceComponents
  kellyFraction: number        // Recommended position size
  maxPosition: number          // Maximum allowed position
  riskAdjusted: number        // Risk-adjusted confidence
  p80Coverage: boolean        // Whether this is in top 80% confidence
}

export interface HistoricalPattern {
  regime: string
  rsi: number
  macd: number
  bbPosition: number
  volumeRatio: number
  outcome: 'WIN' | 'LOSS'
  magnitude: number
}

export class ConfidenceScorer {
  private historicalPatterns: HistoricalPattern[] = []
  private recentAccuracy: number[] = []  // Rolling window of recent prediction accuracy
  private readonly HISTORY_WINDOW = 100
  private readonly MIN_PATTERNS = 20
  
  // Calibrated thresholds from backtesting
  private readonly CONFIDENCE_THRESHOLDS = {
    veryHigh: 0.75,
    high: 0.65,
    medium: 0.55,
    low: 0.45,
    veryLow: 0.35
  }
  
  // Kelly criterion parameters
  private readonly KELLY_PARAMS = {
    maxFraction: 0.25,      // Never risk more than 25%
    trendLambda: 0.5,       // Half-Kelly in trending markets
    rangeLambda: 0.4,       // Slightly less in ranging
    volExpLambda: 0.25,     // Quarter-Kelly in high volatility
    fluxLambda: 0.3,        // Conservative in transition
    minFraction: 0.01      // Minimum position size
  }

  /**
   * Calculate comprehensive confidence score
   */
  calculateConfidence(
    tfData: TFData,
    fusedSignal: FusedSignal,
    multiTFSignals?: FusedSignal[]
  ): EnhancedConfidence {
    const components = this.calculateComponents(tfData, fusedSignal, multiTFSignals)
    const raw = this.combineComponents(components)
    const calibrated = this.calibrateConfidence(raw, tfData.regime)
    const historical = this.getHistoricalAccuracy(tfData)
    
    // Adjust for historical performance
    const adjusted = calibrated * (0.7 + 0.3 * historical)
    
    // Calculate Kelly fraction
    const kellyFraction = this.calculateKellyFraction(
      adjusted,
      fusedSignal.rawSignal,
      tfData.regime
    )
    
    // Check if in top 80% confidence band
    const p80Coverage = adjusted >= this.getP80Threshold()
    
    return {
      raw,
      calibrated: adjusted,
      components,
      kellyFraction,
      maxPosition: this.KELLY_PARAMS.maxFraction,
      riskAdjusted: this.applyRiskAdjustment(adjusted, tfData),
      p80Coverage
    }
  }

  /**
   * Calculate individual confidence components
   */
  private calculateComponents(
    tfData: TFData,
    fusedSignal: FusedSignal,
    multiTFSignals?: FusedSignal[]
  ): ConfidenceComponents {
    return {
      signalStrength: this.calculateSignalStrength(fusedSignal),
      regimeAlignment: this.calculateRegimeAlignment(tfData, fusedSignal),
      timeframeAgreement: this.calculateTimeframeAgreement(multiTFSignals),
      volumeConfirmation: this.calculateVolumeConfirmation(tfData),
      marketConditions: this.calculateMarketConditions(tfData),
      historicalAccuracy: this.getHistoricalAccuracy(tfData),
      volatilityFactor: this.calculateVolatilityFactor(tfData)
    }
  }

  /**
   * Calculate signal strength component
   */
  private calculateSignalStrength(signal: FusedSignal): number {
    // Strong signals have high absolute raw signal and low disagreement
    const signalMagnitude = Math.min(1, Math.abs(signal.rawSignal) / 2)
    const agreementScore = 1 - signal.disagreement
    const hasReasons = signal.reasons.length >= 3 ? 1 : signal.reasons.length / 3
    
    return (signalMagnitude * 0.4 + agreementScore * 0.4 + hasReasons * 0.2)
  }

  /**
   * Calculate regime alignment
   */
  private calculateRegimeAlignment(tfData: TFData, signal: FusedSignal): number {
    const { regime, indicators } = tfData
    
    switch (regime) {
      case 'Trend':
        // In trends, momentum signals should align with direction
        if (indicators.adx > 25) {
          const trendDirection = indicators.ema9 > indicators.sma20 ? 1 : -1
          const signalDirection = Math.sign(signal.rawSignal)
          return signalDirection === trendDirection ? 0.9 : 0.3
        }
        return 0.6
        
      case 'Range':
        // In ranges, mean reversion signals are preferred
        if (indicators.bb.percentB < 0.2 || indicators.bb.percentB > 0.8) {
          return 0.8
        }
        return 0.5
        
      case 'VolExp':
        // High volatility reduces confidence
        return 0.4
        
      case 'Flux':
        // Transitional regime, moderate confidence
        return 0.5
        
      default:
        return 0.5
    }
  }

  /**
   * Calculate timeframe agreement
   */
  private calculateTimeframeAgreement(multiTFSignals?: FusedSignal[]): number {
    if (!multiTFSignals || multiTFSignals.length === 0) return 0.5
    
    // Count directional agreement
    const directions = multiTFSignals.map(s => {
      if (s.direction === 'BUY' || s.direction === 'STRONG_BUY') return 1
      if (s.direction === 'SELL' || s.direction === 'STRONG_SELL') return -1
      return 0
    })
    
    const avgDirection = directions.reduce((a, b) => a + b, 0) / directions.length
    const agreement = Math.abs(avgDirection)  // 0 = no agreement, 1 = full agreement
    
    // Also consider confidence alignment
    const avgConfidence = multiTFSignals.reduce((sum, s) => sum + s.confidence, 0) / multiTFSignals.length
    
    return agreement * 0.7 + avgConfidence * 0.3
  }

  /**
   * Calculate volume confirmation
   */
  private calculateVolumeConfirmation(tfData: TFData): number {
    const { indicators } = tfData
    const volumeRatio = indicators.volumeRatio
    
    if (volumeRatio > 2.0) return 0.9   // Very high volume
    if (volumeRatio > 1.5) return 0.7   // High volume
    if (volumeRatio > 1.0) return 0.5   // Above average
    if (volumeRatio > 0.7) return 0.3   // Below average
    return 0.2  // Low volume
  }

  /**
   * Calculate market conditions
   */
  private calculateMarketConditions(tfData: TFData): number {
    const { indicators } = tfData
    
    // Consider multiple market factors
    const factors: number[] = []
    
    // Trend strength
    if (indicators.adx > 40) factors.push(0.9)
    else if (indicators.adx > 25) factors.push(0.7)
    else if (indicators.adx > 20) factors.push(0.5)
    else factors.push(0.3)
    
    // Volatility
    const volNormalized = Math.min(1, indicators.atrPercent / 3)
    factors.push(1 - volNormalized * 0.5)  // High vol reduces confidence
    
    // Moving average alignment
    if (indicators.ema9 > indicators.sma20 && indicators.sma20 > indicators.vwap) {
      factors.push(0.8)  // Bullish alignment
    } else if (indicators.ema9 < indicators.sma20 && indicators.sma20 < indicators.vwap) {
      factors.push(0.8)  // Bearish alignment
    } else {
      factors.push(0.4)  // Mixed
    }
    
    // Bollinger Band position
    if (indicators.bb.percentB > 0.2 && indicators.bb.percentB < 0.8) {
      factors.push(0.6)  // Within bands
    } else {
      factors.push(0.8)  // At extremes (good for reversal/breakout)
    }
    
    return factors.reduce((a, b) => a + b, 0) / factors.length
  }

  /**
   * Calculate volatility factor
   */
  private calculateVolatilityFactor(tfData: TFData): number {
    const { indicators } = tfData
    const atrPct = indicators.atrPercent
    
    // Lower confidence in extremely high or low volatility
    if (atrPct < 0.5) return 0.6   // Too quiet
    if (atrPct < 1.0) return 0.8   // Normal
    if (atrPct < 2.0) return 0.9   // Ideal volatility
    if (atrPct < 3.0) return 0.7   // Getting high
    if (atrPct < 5.0) return 0.5   // Very high
    return 0.3  // Extreme volatility
  }

  /**
   * Get historical accuracy for similar setups
   */
  private getHistoricalAccuracy(tfData: TFData): number {
    if (this.historicalPatterns.length < this.MIN_PATTERNS) {
      return 0.5  // Default to neutral if not enough history
    }
    
    // Find similar patterns
    const similar = this.findSimilarPatterns(tfData)
    
    if (similar.length === 0) return 0.5
    
    // Calculate win rate for similar setups
    const wins = similar.filter(p => p.outcome === 'WIN').length
    const accuracy = wins / similar.length
    
    // Weight by recency and magnitude
    const weightedAccuracy = similar.reduce((sum, pattern, i) => {
      const recencyWeight = 1 - (i / similar.length) * 0.3  // More recent = higher weight
      const outcomeValue = pattern.outcome === 'WIN' ? pattern.magnitude : -pattern.magnitude
      return sum + outcomeValue * recencyWeight
    }, 0) / similar.length
    
    return Math.max(0, Math.min(1, 0.5 + weightedAccuracy))
  }

  /**
   * Find similar historical patterns
   */
  private findSimilarPatterns(tfData: TFData, maxPatterns: number = 10): HistoricalPattern[] {
    const { indicators, regime } = tfData
    
    // Define similarity thresholds
    const RSI_THRESHOLD = 10
    const MACD_THRESHOLD = 0.5
    const BB_THRESHOLD = 0.2
    const VOLUME_THRESHOLD = 0.5
    
    // Filter and score similar patterns
    const scored = this.historicalPatterns
      .filter(p => p.regime === regime)  // Same regime
      .map(pattern => {
        const rsiDiff = Math.abs(pattern.rsi - indicators.rsi) / RSI_THRESHOLD
        const macdDiff = Math.abs(pattern.macd - indicators.macd) / MACD_THRESHOLD
        const bbDiff = Math.abs(pattern.bbPosition - indicators.bb.percentB) / BB_THRESHOLD
        const volumeDiff = Math.abs(pattern.volumeRatio - indicators.volumeRatio) / VOLUME_THRESHOLD
        
        const similarity = 1 / (1 + rsiDiff + macdDiff + bbDiff + volumeDiff)
        
        return { pattern, similarity }
      })
      .filter(item => item.similarity > 0.3)  // Minimum similarity threshold
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, maxPatterns)
    
    return scored.map(item => item.pattern)
  }

  /**
   * Combine components into raw confidence
   */
  private combineComponents(components: ConfidenceComponents): number {
    // Weighted average with emphasis on signal strength and historical accuracy
    const weights = {
      signalStrength: 0.25,
      regimeAlignment: 0.15,
      timeframeAgreement: 0.20,
      volumeConfirmation: 0.10,
      marketConditions: 0.10,
      historicalAccuracy: 0.15,
      volatilityFactor: 0.05
    }
    
    let weightedSum = 0
    let totalWeight = 0
    
    for (const [key, weight] of Object.entries(weights)) {
      weightedSum += (components as any)[key] * weight
      totalWeight += weight
    }
    
    return weightedSum / totalWeight
  }

  /**
   * Calibrate confidence based on regime
   */
  private calibrateConfidence(raw: number, regime: string): number {
    // Apply regime-specific adjustments
    let calibrated = raw
    
    switch (regime) {
      case 'Trend':
        // Boost confidence in clear trends
        calibrated = Math.pow(raw, 0.9)  // Slightly boost high confidence
        break
        
      case 'Range':
        // Normal calibration for ranges
        calibrated = raw
        break
        
      case 'VolExp':
        // Reduce confidence in high volatility
        calibrated = Math.pow(raw, 1.2)  // Penalize unless very high
        break
        
      case 'Flux':
        // Moderate reduction in transitional periods
        calibrated = Math.pow(raw, 1.1)
        break
    }
    
    // Apply bounds
    return Math.max(0.1, Math.min(0.9, calibrated))
  }

  /**
   * Apply risk adjustments to confidence
   */
  private applyRiskAdjustment(confidence: number, tfData: TFData): number {
    const { indicators } = tfData
    
    // Reduce confidence if:
    let adjustment = 1.0
    
    // Very low volume
    if (indicators.volumeRatio < 0.5) adjustment *= 0.8
    
    // Extreme ATR
    if (indicators.atrPercent > 5) adjustment *= 0.7
    else if (indicators.atrPercent < 0.3) adjustment *= 0.8
    
    // No clear trend
    if (indicators.adx < 20) adjustment *= 0.9
    
    // Mixed signals (MACD vs MA alignment)
    const macdBullish = indicators.macd > indicators.macdSignal
    const maBullish = indicators.ema9 > indicators.sma20
    if (macdBullish !== maBullish) adjustment *= 0.85
    
    return confidence * adjustment
  }

  /**
   * Calculate Kelly fraction for position sizing
   */
  private calculateKellyFraction(
    confidence: number,
    expectedReturn: number,
    regime: string
  ): number {
    // Get regime-specific lambda
    const lambda = this.KELLY_PARAMS[`${regime.toLowerCase()}Lambda` as keyof typeof this.KELLY_PARAMS] as number || 0.3
    
    // Calculate win probability from calibrated confidence
    const p = Math.max(0.01, Math.min(0.99, confidence))
    
    // Estimate reward:risk from expected return
    const b = Math.max(0.1, Math.abs(expectedReturn) * 100)  // Convert to percentage
    
    // Classic Kelly formula: f* = (p(1+b) - 1) / b
    const kellyFull = ((p * (1 + b)) - 1) / b
    
    // Apply fractional Kelly with confidence weighting
    const fraction = Math.max(0, lambda * kellyFull * confidence)
    
    // Apply bounds
    return Math.max(
      this.KELLY_PARAMS.minFraction,
      Math.min(this.KELLY_PARAMS.maxFraction, fraction)
    )
  }

  /**
   * Get P80 threshold (80th percentile confidence)
   */
  private getP80Threshold(): number {
    if (this.recentAccuracy.length < 20) return 0.65
    
    const sorted = [...this.recentAccuracy].sort((a, b) => b - a)
    const index = Math.floor(sorted.length * 0.2)
    return sorted[index] || 0.65
  }

  /**
   * Update historical patterns with new outcome
   */
  updateHistory(
    tfData: TFData,
    outcome: 'WIN' | 'LOSS',
    magnitude: number
  ): void {
    const pattern: HistoricalPattern = {
      regime: tfData.regime,
      rsi: tfData.indicators.rsi,
      macd: tfData.indicators.macd,
      bbPosition: tfData.indicators.bb.percentB,
      volumeRatio: tfData.indicators.volumeRatio,
      outcome,
      magnitude
    }
    
    this.historicalPatterns.push(pattern)
    
    // Maintain window size
    if (this.historicalPatterns.length > this.HISTORY_WINDOW * 2) {
      this.historicalPatterns = this.historicalPatterns.slice(-this.HISTORY_WINDOW)
    }
    
    // Update recent accuracy
    this.recentAccuracy.push(outcome === 'WIN' ? 1 : 0)
    if (this.recentAccuracy.length > this.HISTORY_WINDOW) {
      this.recentAccuracy.shift()
    }
  }

  /**
   * Get current accuracy statistics
   */
  getAccuracyStats(): {
    overall: number
    recent: number
    byRegime: Record<string, number>
    confidence: number
  } {
    if (this.historicalPatterns.length < this.MIN_PATTERNS) {
      return {
        overall: 0.5,
        recent: 0.5,
        byRegime: {},
        confidence: 0.3
      }
    }
    
    // Overall accuracy
    const wins = this.historicalPatterns.filter(p => p.outcome === 'WIN').length
    const overall = wins / this.historicalPatterns.length
    
    // Recent accuracy
    const recent = this.recentAccuracy.length > 0
      ? this.recentAccuracy.reduce((a, b) => a + b, 0) / this.recentAccuracy.length
      : 0.5
    
    // By regime
    const byRegime: Record<string, number> = {}
    const regimes = ['Trend', 'Range', 'VolExp', 'Flux']
    
    for (const regime of regimes) {
      const regimePatterns = this.historicalPatterns.filter(p => p.regime === regime)
      if (regimePatterns.length > 0) {
        const regimeWins = regimePatterns.filter(p => p.outcome === 'WIN').length
        byRegime[regime] = regimeWins / regimePatterns.length
      }
    }
    
    // Confidence in statistics (based on sample size)
    const confidence = Math.min(1, this.historicalPatterns.length / (this.MIN_PATTERNS * 5))
    
    return { overall, recent, byRegime, confidence }
  }

  /**
   * Export confidence scorer state for persistence
   */
  exportState(): {
    historicalPatterns: HistoricalPattern[]
    recentAccuracy: number[]
  } {
    return {
      historicalPatterns: this.historicalPatterns,
      recentAccuracy: this.recentAccuracy
    }
  }

  /**
   * Import confidence scorer state
   */
  importState(state: {
    historicalPatterns: HistoricalPattern[]
    recentAccuracy: number[]
  }): void {
    this.historicalPatterns = state.historicalPatterns || []
    this.recentAccuracy = state.recentAccuracy || []
  }
}

// Singleton instance
export const confidenceScorer = new ConfidenceScorer()