/**
 * Health Feedback Loop - Automatically adjusts signal weights based on performance
 */

import { TFHealth } from '../health/PredictionHealth';

export interface SignalPerformance {
  signal: string;
  tf: string;
  accuracy: number;
  sampleSize: number;
  lastUpdated: Date;
}

export interface FeedbackAdjustment {
  tf: string;
  signal: string;
  originalWeight: number;
  adjustedWeight: number;
  reason: string;
}

export class HealthFeedbackLoop {
  private performanceHistory: Map<string, SignalPerformance[]> = new Map();
  private adjustments: FeedbackAdjustment[] = [];
  private readonly MIN_SAMPLE_SIZE = 20;
  private readonly ADJUSTMENT_FACTOR = 0.1; // 10% max adjustment per cycle
  
  /**
   * Feed health metrics back into signal fusion weights
   */
  async adjustSignalWeights(
    tfHealth: Map<string, TFHealth>,
    currentWeights: Map<string, Map<string, number>>
  ): Promise<Map<string, Map<string, number>>> {
    const adjustedWeights = new Map<string, Map<string, number>>();
    
    for (const [tf, health] of tfHealth.entries()) {
      const tfWeights = currentWeights.get(tf) || new Map();
      const adjustedTfWeights = new Map<string, number>();
      
      // Get health score and performance metrics
      const healthScore = health.healthScore();
      const accuracy = health.directionalAccuracy;
      
      for (const [signal, weight] of tfWeights.entries()) {
        let adjustedWeight = weight;
        
        // Adjust based on health score
        if (healthScore < 0.5) {
          // Reduce weight for unhealthy timeframes
          adjustedWeight *= (0.5 + healthScore);
          this.recordAdjustment(tf, signal, weight, adjustedWeight, 'Low health score');
        } else if (healthScore > 0.8 && accuracy > 0.7) {
          // Boost weight for high-performing timeframes
          adjustedWeight *= (1 + (healthScore - 0.8) * this.ADJUSTMENT_FACTOR);
          this.recordAdjustment(tf, signal, weight, adjustedWeight, 'High performance');
        }
        
        // Check signal-specific performance
        const signalPerf = this.getSignalPerformance(tf, signal);
        if (signalPerf && signalPerf.sampleSize >= this.MIN_SAMPLE_SIZE) {
          if (signalPerf.accuracy < 0.4) {
            // Significantly reduce weight for poor performers
            adjustedWeight *= 0.5;
            this.recordAdjustment(tf, signal, weight, adjustedWeight, 'Poor signal accuracy');
          } else if (signalPerf.accuracy > 0.7) {
            // Boost high performers
            adjustedWeight *= 1.2;
            this.recordAdjustment(tf, signal, weight, adjustedWeight, 'High signal accuracy');
          }
        }
        
        // Ensure weight stays within bounds [0.05, 0.35]
        adjustedWeight = Math.max(0.05, Math.min(0.35, adjustedWeight));
        adjustedTfWeights.set(signal, adjustedWeight);
      }
      
      // Normalize weights to sum to 1
      const totalWeight = Array.from(adjustedTfWeights.values()).reduce((a, b) => a + b, 0);
      for (const [signal, weight] of adjustedTfWeights.entries()) {
        adjustedTfWeights.set(signal, weight / totalWeight);
      }
      
      adjustedWeights.set(tf, adjustedTfWeights);
    }
    
    return adjustedWeights;
  }
  
  /**
   * Update performance history for a signal
   */
  updateSignalPerformance(tf: string, signal: string, correct: boolean): void {
    const key = `${tf}-${signal}`;
    const history = this.performanceHistory.get(key) || [];
    
    // Keep last 100 predictions
    if (history.length >= 100) {
      history.shift();
    }
    
    const currentPerf = this.calculatePerformance(history, correct);
    history.push({
      signal,
      tf,
      accuracy: currentPerf.accuracy,
      sampleSize: currentPerf.sampleSize,
      lastUpdated: new Date()
    });
    
    this.performanceHistory.set(key, history);
  }
  
  /**
   * Get performance metrics for a specific signal
   */
  private getSignalPerformance(tf: string, signal: string): SignalPerformance | null {
    const key = `${tf}-${signal}`;
    const history = this.performanceHistory.get(key);
    
    if (!history || history.length === 0) {
      return null;
    }
    
    return history[history.length - 1];
  }
  
  /**
   * Calculate accuracy from performance history
   */
  private calculatePerformance(history: SignalPerformance[], newCorrect: boolean): {
    accuracy: number;
    sampleSize: number;
  } {
    const sampleSize = history.length + 1;
    const correctCount = history.filter(h => h.accuracy * h.sampleSize > 0.5).length + (newCorrect ? 1 : 0);
    
    return {
      accuracy: correctCount / sampleSize,
      sampleSize
    };
  }
  
  /**
   * Record an adjustment for auditing
   */
  private recordAdjustment(
    tf: string,
    signal: string,
    originalWeight: number,
    adjustedWeight: number,
    reason: string
  ): void {
    this.adjustments.push({
      tf,
      signal,
      originalWeight,
      adjustedWeight,
      reason
    });
    
    // Keep only last 100 adjustments
    if (this.adjustments.length > 100) {
      this.adjustments.shift();
    }
  }
  
  /**
   * Get recent adjustments for debugging
   */
  getRecentAdjustments(): FeedbackAdjustment[] {
    return this.adjustments.slice(-20);
  }
  
  /**
   * Export calibration data for persistence
   */
  exportCalibration(): {
    weights: Record<string, Record<string, number>>;
    performance: Record<string, SignalPerformance>;
    timestamp: string;
  } {
    const weights: Record<string, Record<string, number>> = {};
    const performance: Record<string, SignalPerformance> = {};
    
    // Export current adjusted weights
    for (const adj of this.adjustments) {
      if (!weights[adj.tf]) {
        weights[adj.tf] = {};
      }
      weights[adj.tf][adj.signal] = adj.adjustedWeight;
    }
    
    // Export performance history
    for (const [key, perf] of this.performanceHistory.entries()) {
      if (perf.length > 0) {
        performance[key] = perf[perf.length - 1];
      }
    }
    
    return {
      weights,
      performance,
      timestamp: new Date().toISOString()
    };
  }
  
  /**
   * Import calibration data
   */
  importCalibration(data: {
    weights: Record<string, Record<string, number>>;
    performance: Record<string, SignalPerformance>;
  }): void {
    // Import performance history
    for (const [key, perf] of Object.entries(data.performance)) {
      this.performanceHistory.set(key, [perf]);
    }
    
    console.log(`Imported calibration with ${Object.keys(data.performance).length} performance records`);
  }
}