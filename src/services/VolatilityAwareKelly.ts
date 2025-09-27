/**
 * Volatility-Aware Kelly Criterion - Adjusts position sizing based on VIX percentiles
 */

export interface KellyParameters {
  winRate: number;           // Probability of winning
  winAmount: number;          // Average win size
  lossAmount: number;         // Average loss size
  confidence: number;         // Model confidence
  vix: number;               // Current VIX level
  vixPercentile: number;     // VIX percentile (0-100)
}

export interface KellySizeResult {
  baseKelly: number;         // Standard Kelly percentage
  fractionalKelly: number;   // Conservative Kelly (λ=0.25)
  volAdjustedKelly: number;  // VIX-adjusted Kelly
  finalSize: number;         // Final recommended position size %
  maxSize: number;           // Maximum allowed position size
  adjustmentFactors: {
    lambda: number;          // Kelly fraction
    vixMultiplier: number;   // VIX adjustment
    confidenceMultiplier: number; // Confidence adjustment
    regimeMultiplier: number; // Market regime adjustment
  };
}

export class VolatilityAwareKelly {
  private readonly BASE_LAMBDA = 0.25; // Base fractional Kelly
  private readonly MAX_POSITION_SIZE = 0.25; // 25% max
  private readonly MIN_POSITION_SIZE = 0.01; // 1% min
  
  // VIX percentile thresholds
  private readonly VIX_PERCENTILES = {
    90: 30,  // 90th percentile ~ VIX 30
    75: 22,  // 75th percentile ~ VIX 22
    50: 16,  // 50th percentile ~ VIX 16
    25: 13,  // 25th percentile ~ VIX 13
    10: 11   // 10th percentile ~ VIX 11
  };
  
  /**
   * Calculate volatility-aware Kelly position size
   */
  calculatePositionSize(params: KellyParameters): KellySizeResult {
    // Calculate base Kelly criterion
    const baseKelly = this.calculateBaseKelly(
      params.winRate,
      params.winAmount,
      params.lossAmount
    );
    
    // Apply fractional Kelly (λ)
    const lambda = this.calculateDynamicLambda(params.vixPercentile);
    const fractionalKelly = baseKelly * lambda;
    
    // Apply VIX adjustment
    const vixMultiplier = this.calculateVixMultiplier(params.vix, params.vixPercentile);
    
    // Apply confidence adjustment
    const confidenceMultiplier = this.calculateConfidenceMultiplier(params.confidence);
    
    // Apply regime adjustment based on VIX level
    const regimeMultiplier = this.calculateRegimeMultiplier(params.vix);
    
    // Calculate final volatility-adjusted Kelly
    const volAdjustedKelly = fractionalKelly * vixMultiplier * confidenceMultiplier * regimeMultiplier;
    
    // Apply position limits
    const finalSize = Math.max(
      this.MIN_POSITION_SIZE,
      Math.min(this.MAX_POSITION_SIZE, volAdjustedKelly)
    );
    
    return {
      baseKelly,
      fractionalKelly,
      volAdjustedKelly,
      finalSize,
      maxSize: this.MAX_POSITION_SIZE,
      adjustmentFactors: {
        lambda,
        vixMultiplier,
        confidenceMultiplier,
        regimeMultiplier
      }
    };
  }
  
  /**
   * Calculate base Kelly criterion
   * f* = (p*b - q) / b
   * where p = win probability, q = loss probability, b = win/loss ratio
   */
  private calculateBaseKelly(winRate: number, winAmount: number, lossAmount: number): number {
    const p = winRate;
    const q = 1 - winRate;
    const b = winAmount / lossAmount;
    
    const kelly = (p * b - q) / b;
    
    // Kelly can be negative if edge is negative
    return Math.max(0, kelly);
  }
  
  /**
   * Calculate dynamic lambda based on VIX percentile
   * Higher VIX percentile = lower lambda (more conservative)
   */
  private calculateDynamicLambda(vixPercentile: number): number {
    if (vixPercentile >= 90) {
      return 0.15; // Very conservative in extreme volatility
    } else if (vixPercentile >= 75) {
      return 0.20; // Conservative in high volatility
    } else if (vixPercentile >= 50) {
      return 0.25; // Base fractional Kelly
    } else if (vixPercentile >= 25) {
      return 0.30; // Slightly aggressive in normal conditions
    } else {
      return 0.35; // More aggressive in low volatility
    }
  }
  
  /**
   * Calculate VIX-based position size multiplier
   */
  private calculateVixMultiplier(vix: number, vixPercentile: number): number {
    // Extreme VIX (>90th percentile): Significant reduction
    if (vixPercentile >= 90) {
      return 0.5; // Cut position size in half
    }
    
    // High VIX (75-90th percentile): Moderate reduction
    if (vixPercentile >= 75) {
      return 0.7;
    }
    
    // Normal VIX (25-75th percentile): No adjustment
    if (vixPercentile >= 25) {
      return 1.0;
    }
    
    // Low VIX (<25th percentile): Slight increase
    return 1.2; // Can be slightly more aggressive
  }
  
  /**
   * Adjust based on model confidence
   */
  private calculateConfidenceMultiplier(confidence: number): number {
    // Linear scaling from 0.5x at 50% confidence to 1.2x at 90% confidence
    if (confidence < 0.5) {
      return 0.5;
    } else if (confidence > 0.9) {
      return 1.2;
    }
    
    return 0.5 + (confidence - 0.5) * 1.75;
  }
  
  /**
   * Apply market regime adjustments
   */
  private calculateRegimeMultiplier(vix: number): number {
    if (vix < 12) {
      // Low volatility regime - can increase size slightly
      return 1.1;
    } else if (vix < 20) {
      // Normal regime
      return 1.0;
    } else if (vix < 30) {
      // Elevated volatility
      return 0.9;
    } else {
      // High volatility/crisis regime
      return 0.7;
    }
  }
  
  /**
   * Get VIX percentile from current level
   */
  getVixPercentile(vix: number): number {
    // Historical VIX distribution approximation
    if (vix >= 30) return 90;
    if (vix >= 22) return 75;
    if (vix >= 16) return 50;
    if (vix >= 13) return 25;
    if (vix >= 11) return 10;
    return 5;
  }
  
  /**
   * Generate position sizing recommendation text
   */
  generateRecommendation(result: KellySizeResult, vix: number): string {
    const sizePercent = (result.finalSize * 100).toFixed(1);
    const regime = vix < 12 ? 'Low Vol' : 
                   vix < 20 ? 'Normal' : 
                   vix < 30 ? 'High Vol' : 'Extreme Vol';
    
    let recommendation = `Position Size: ${sizePercent}% | `;
    recommendation += `Regime: ${regime} | `;
    recommendation += `VIX Adj: ${(result.adjustmentFactors.vixMultiplier * 100).toFixed(0)}%`;
    
    if (result.finalSize < result.volAdjustedKelly) {
      recommendation += ' | ⚠️ Capped at max';
    }
    
    return recommendation;
  }
  
  /**
   * Calculate portfolio heat based on all positions
   */
  calculatePortfolioHeat(positions: Array<{ size: number; correlation: number }>): number {
    // Sum of position sizes weighted by correlation
    return positions.reduce((heat, pos) => {
      return heat + (pos.size * Math.abs(pos.correlation));
    }, 0);
  }
  
  /**
   * Determine if new position would exceed heat limits
   */
  checkHeatLimit(
    newPositionSize: number,
    currentHeat: number,
    maxHeat: number = 1.0
  ): { allowed: boolean; availableSize: number } {
    const newHeat = currentHeat + newPositionSize;
    
    if (newHeat <= maxHeat) {
      return { allowed: true, availableSize: newPositionSize };
    }
    
    const availableSize = Math.max(0, maxHeat - currentHeat);
    return { 
      allowed: availableSize > 0, 
      availableSize 
    };
  }
}