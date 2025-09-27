/**
 * Cross-Timeframe Consensus - Identifies when multiple timeframes agree
 */

export interface TimeframePrediction {
  tf: string;
  side: 'CALL' | 'PUT';
  confidence: number;
  health: number;
  regime: string;
}

export interface ConsensusResult {
  consensusStrength: number; // 0-1 score
  alignedTimeframes: string[];
  dominantSide: 'CALL' | 'PUT' | 'NEUTRAL';
  confidenceBoost: number; // Multiplier for final confidence
  signals: {
    bullishCount: number;
    bearishCount: number;
    strongBullish: number; // >75% confidence
    strongBearish: number;
  };
}

export class CrossTimeframeConsensus {
  private readonly TIMEFRAME_HIERARCHY = ['5m', '15m', '30m', '1h', '4h', '1d'];
  private readonly MIN_HEALTH_THRESHOLD = 0.6;
  private readonly HIGH_CONFIDENCE_THRESHOLD = 0.75;
  
  /**
   * Calculate consensus across multiple timeframes
   */
  calculateConsensus(predictions: TimeframePrediction[]): ConsensusResult {
    // Filter for healthy predictions
    const healthyPredictions = predictions.filter(p => p.health >= this.MIN_HEALTH_THRESHOLD);
    
    if (healthyPredictions.length < 3) {
      return this.neutralConsensus();
    }
    
    // Count signals
    const signals = this.countSignals(healthyPredictions);
    
    // Check for consecutive agreement
    const consecutiveAgreement = this.findConsecutiveAgreement(healthyPredictions);
    
    // Calculate consensus strength
    const consensusStrength = this.calculateConsensusStrength(
      signals,
      consecutiveAgreement,
      healthyPredictions
    );
    
    // Determine dominant side
    const dominantSide = this.determineDominantSide(signals);
    
    // Calculate confidence boost
    const confidenceBoost = this.calculateConfidenceBoost(
      consensusStrength,
      consecutiveAgreement.length,
      signals
    );
    
    return {
      consensusStrength,
      alignedTimeframes: consecutiveAgreement.map(p => p.tf),
      dominantSide,
      confidenceBoost,
      signals
    };
  }
  
  /**
   * Find consecutive timeframes that agree on direction
   */
  private findConsecutiveAgreement(predictions: TimeframePrediction[]): TimeframePrediction[] {
    const sorted = this.sortByTimeframeHierarchy(predictions);
    const sequences: TimeframePrediction[][] = [];
    let currentSequence: TimeframePrediction[] = [];
    let currentSide: 'CALL' | 'PUT' | null = null;
    
    for (const pred of sorted) {
      if (currentSide === null || pred.side === currentSide) {
        currentSide = pred.side;
        currentSequence.push(pred);
      } else {
        if (currentSequence.length >= 2) {
          sequences.push([...currentSequence]);
        }
        currentSequence = [pred];
        currentSide = pred.side;
      }
    }
    
    // Don't forget the last sequence
    if (currentSequence.length >= 2) {
      sequences.push(currentSequence);
    }
    
    // Return the longest sequence, or the one with highest average confidence
    if (sequences.length === 0) {
      return [];
    }
    
    return sequences.reduce((best, current) => {
      const bestAvgConf = best.reduce((sum, p) => sum + p.confidence, 0) / best.length;
      const currentAvgConf = current.reduce((sum, p) => sum + p.confidence, 0) / current.length;
      
      if (current.length > best.length) {
        return current;
      } else if (current.length === best.length && currentAvgConf > bestAvgConf) {
        return current;
      }
      return best;
    });
  }
  
  /**
   * Sort predictions by timeframe hierarchy
   */
  private sortByTimeframeHierarchy(predictions: TimeframePrediction[]): TimeframePrediction[] {
    return predictions.sort((a, b) => {
      const aIndex = this.TIMEFRAME_HIERARCHY.indexOf(a.tf);
      const bIndex = this.TIMEFRAME_HIERARCHY.indexOf(b.tf);
      return aIndex - bIndex;
    });
  }
  
  /**
   * Count bullish and bearish signals
   */
  private countSignals(predictions: TimeframePrediction[]): ConsensusResult['signals'] {
    const bullishCount = predictions.filter(p => p.side === 'CALL').length;
    const bearishCount = predictions.filter(p => p.side === 'PUT').length;
    const strongBullish = predictions.filter(
      p => p.side === 'CALL' && p.confidence >= this.HIGH_CONFIDENCE_THRESHOLD
    ).length;
    const strongBearish = predictions.filter(
      p => p.side === 'PUT' && p.confidence >= this.HIGH_CONFIDENCE_THRESHOLD
    ).length;
    
    return {
      bullishCount,
      bearishCount,
      strongBullish,
      strongBearish
    };
  }
  
  /**
   * Calculate overall consensus strength
   */
  private calculateConsensusStrength(
    signals: ConsensusResult['signals'],
    consecutiveAgreement: TimeframePrediction[],
    allPredictions: TimeframePrediction[]
  ): number {
    let strength = 0;
    
    // Factor 1: Directional agreement (40% weight)
    const total = signals.bullishCount + signals.bearishCount;
    const majority = Math.max(signals.bullishCount, signals.bearishCount);
    const agreementRatio = total > 0 ? majority / total : 0;
    strength += agreementRatio * 0.4;
    
    // Factor 2: Consecutive timeframe agreement (30% weight)
    const consecutiveRatio = consecutiveAgreement.length / this.TIMEFRAME_HIERARCHY.length;
    strength += consecutiveRatio * 0.3;
    
    // Factor 3: High confidence signal ratio (20% weight)
    const highConfRatio = (signals.strongBullish + signals.strongBearish) / Math.max(1, total);
    strength += highConfRatio * 0.2;
    
    // Factor 4: Average health of agreeing timeframes (10% weight)
    const avgHealth = allPredictions.reduce((sum, p) => sum + p.health, 0) / Math.max(1, allPredictions.length);
    strength += (avgHealth - 0.5) * 0.2; // Normalized around 0.5
    
    return Math.max(0, Math.min(1, strength));
  }
  
  /**
   * Determine the dominant market direction
   */
  private determineDominantSide(signals: ConsensusResult['signals']): 'CALL' | 'PUT' | 'NEUTRAL' {
    // Strong signals have more weight
    const bullishScore = signals.bullishCount + signals.strongBullish * 0.5;
    const bearishScore = signals.bearishCount + signals.strongBearish * 0.5;
    
    if (bullishScore > bearishScore * 1.2) {
      return 'CALL';
    } else if (bearishScore > bullishScore * 1.2) {
      return 'PUT';
    }
    return 'NEUTRAL';
  }
  
  /**
   * Calculate confidence boost multiplier
   */
  private calculateConfidenceBoost(
    consensusStrength: number,
    consecutiveCount: number,
    signals: ConsensusResult['signals']
  ): number {
    let boost = 1.0;
    
    // Strong consensus adds up to 20% boost
    if (consensusStrength > 0.8) {
      boost += 0.2;
    } else if (consensusStrength > 0.6) {
      boost += 0.1;
    }
    
    // 3+ consecutive timeframes add 15% boost
    if (consecutiveCount >= 4) {
      boost += 0.15;
    } else if (consecutiveCount >= 3) {
      boost += 0.1;
    }
    
    // Multiple strong signals add 10% boost
    if (signals.strongBullish >= 3 || signals.strongBearish >= 3) {
      boost += 0.1;
    }
    
    // Cap at 1.4x multiplier
    return Math.min(1.4, boost);
  }
  
  /**
   * Return neutral consensus when insufficient data
   */
  private neutralConsensus(): ConsensusResult {
    return {
      consensusStrength: 0,
      alignedTimeframes: [],
      dominantSide: 'NEUTRAL',
      confidenceBoost: 1.0,
      signals: {
        bullishCount: 0,
        bearishCount: 0,
        strongBullish: 0,
        strongBearish: 0
      }
    };
  }
  
  /**
   * Generate consensus report for dashboard
   */
  generateReport(consensus: ConsensusResult): string {
    const strength = (consensus.consensusStrength * 100).toFixed(0);
    const aligned = consensus.alignedTimeframes.join(', ');
    const boost = ((consensus.confidenceBoost - 1) * 100).toFixed(0);
    
    return `Consensus: ${strength}% | ${consensus.dominantSide} | Aligned: ${aligned} | Boost: +${boost}%`;
  }
}