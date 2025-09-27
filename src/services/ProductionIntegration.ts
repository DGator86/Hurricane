/**
 * Production Integration - Ties together all production-ready components
 */

import { HealthFeedbackLoop } from './HealthFeedbackLoop';
import { CrossTimeframeConsensus, TimeframePrediction } from './CrossTimeframeConsensus';
import { FlowSmoothingManager, AdaptiveFlowSmoother } from './FlowSmoothing';
import { VolatilityAwareKelly } from './VolatilityAwareKelly';
import { TFHealth } from '../health/PredictionHealth';

export interface ProductionPrediction {
  tf: string;
  side: 'CALL' | 'PUT';
  baseConfidence: number;
  adjustedConfidence: number;
  kellySize: number;
  consensusBoost: number;
  healthScore: number;
  attribution: Record<string, number>;
  metadata: {
    vix: number;
    vixPercentile: number;
    regime: string;
    crossTfAgreement: string[];
    smoothedDex: number;
    smoothedGex: number;
    flowTrend: string;
  };
}

export interface ProductionConfig {
  enableHealthFeedback: boolean;
  enableCrossTfConsensus: boolean;
  enableFlowSmoothing: boolean;
  enableVolAwareKelly: boolean;
  enableAttributionLogging: boolean;
}

export class ProductionIntegrationSystem {
  private healthFeedback: HealthFeedbackLoop;
  private crossTfConsensus: CrossTimeframeConsensus;
  private flowSmoother: AdaptiveFlowSmoother;
  private kellySizer: VolatilityAwareKelly;
  private config: ProductionConfig;
  private attributionLog: Map<string, Record<string, number>> = new Map();
  
  constructor(config: Partial<ProductionConfig> = {}) {
    this.config = {
      enableHealthFeedback: true,
      enableCrossTfConsensus: true,
      enableFlowSmoothing: true,
      enableVolAwareKelly: true,
      enableAttributionLogging: true,
      ...config
    };
    
    this.healthFeedback = new HealthFeedbackLoop();
    this.crossTfConsensus = new CrossTimeframeConsensus();
    this.flowSmoother = new AdaptiveFlowSmoother();
    this.kellySizer = new VolatilityAwareKelly();
  }
  
  /**
   * Process predictions with all production enhancements
   */
  async processPredictions(
    rawPredictions: any[],
    tfHealthMap: Map<string, TFHealth>,
    flowData: any,
    vix: number
  ): Promise<ProductionPrediction[]> {
    const results: ProductionPrediction[] = [];
    
    // Step 1: Apply health feedback to adjust weights
    let adjustedWeights = new Map<string, Map<string, number>>();
    if (this.config.enableHealthFeedback) {
      const currentWeights = this.extractCurrentWeights(rawPredictions);
      adjustedWeights = await this.healthFeedback.adjustSignalWeights(tfHealthMap, currentWeights);
    }
    
    // Step 2: Process flow smoothing
    let smoothedFlow = flowData;
    if (this.config.enableFlowSmoothing && flowData) {
      smoothedFlow = this.flowSmoother.processAdaptive('SPY', {
        timestamp: new Date(),
        dex: flowData.dex?.value || 0,
        gex: flowData.gex?.value || 0,
        spot: flowData.spot || 505
      }, vix);
    }
    
    // Step 3: Prepare predictions for consensus
    const tfPredictions: TimeframePrediction[] = rawPredictions.map(pred => ({
      tf: pred.tf,
      side: pred.side,
      confidence: pred.confidence,
      health: tfHealthMap.get(pred.tf)?.healthScore() || 0.5,
      regime: pred.regime
    }));
    
    // Step 4: Calculate cross-timeframe consensus
    let consensus = { consensusStrength: 0, alignedTimeframes: [], dominantSide: 'NEUTRAL' as any, confidenceBoost: 1 };
    if (this.config.enableCrossTfConsensus) {
      consensus = this.crossTfConsensus.calculateConsensus(tfPredictions);
    }
    
    // Step 5: Process each prediction with all enhancements
    for (const pred of rawPredictions) {
      const tfHealth = tfHealthMap.get(pred.tf);
      const healthScore = tfHealth?.healthScore() || 0.5;
      
      // Apply confidence adjustments
      let adjustedConfidence = pred.confidence;
      
      // Health adjustment
      adjustedConfidence *= (0.6 + 0.4 * healthScore);
      
      // Consensus boost
      if (consensus.alignedTimeframes.includes(pred.tf)) {
        adjustedConfidence *= consensus.confidenceBoost;
      }
      
      // Cap at 0.95
      adjustedConfidence = Math.min(0.95, adjustedConfidence);
      
      // Calculate Kelly sizing
      let kellySize = 0.1; // Default 10%
      if (this.config.enableVolAwareKelly) {
        const vixPercentile = this.kellySizer.getVixPercentile(vix);
        const kellyResult = this.kellySizer.calculatePositionSize({
          winRate: pred.winRate || 0.65,
          winAmount: pred.atr * 2 || 2,
          lossAmount: pred.atr || 1,
          confidence: adjustedConfidence,
          vix,
          vixPercentile
        });
        kellySize = kellyResult.finalSize;
      }
      
      // Build attribution if enabled
      const attribution = this.config.enableAttributionLogging ? 
        this.buildAttribution(pred, healthScore, consensus, smoothedFlow) : {};
      
      // Store attribution for analysis
      if (this.config.enableAttributionLogging) {
        this.attributionLog.set(`${pred.tf}-${Date.now()}`, attribution);
      }
      
      // Create production prediction
      const productionPred: ProductionPrediction = {
        tf: pred.tf,
        side: pred.side,
        baseConfidence: pred.confidence,
        adjustedConfidence,
        kellySize,
        consensusBoost: consensus.confidenceBoost,
        healthScore,
        attribution,
        metadata: {
          vix,
          vixPercentile: this.kellySizer.getVixPercentile(vix),
          regime: pred.regime,
          crossTfAgreement: consensus.alignedTimeframes,
          smoothedDex: smoothedFlow?.smoothed?.dex || flowData?.dex?.value || 0,
          smoothedGex: smoothedFlow?.smoothed?.gex || flowData?.gex?.value || 0,
          flowTrend: smoothedFlow?.trend || 'STABLE'
        }
      };
      
      results.push(productionPred);
    }
    
    return results;
  }
  
  /**
   * Extract current signal weights from predictions
   */
  private extractCurrentWeights(predictions: any[]): Map<string, Map<string, number>> {
    const weights = new Map<string, Map<string, number>>();
    
    for (const pred of predictions) {
      const tfWeights = new Map<string, number>();
      
      // Default weights if not specified
      tfWeights.set('hurricane', 0.25);
      tfWeights.set('flow', 0.20);
      tfWeights.set('rsi', 0.15);
      tfWeights.set('macd', 0.15);
      tfWeights.set('bb', 0.10);
      tfWeights.set('volume', 0.15);
      
      weights.set(pred.tf, tfWeights);
    }
    
    return weights;
  }
  
  /**
   * Build attribution breakdown
   */
  private buildAttribution(
    pred: any,
    healthScore: number,
    consensus: any,
    flowData: any
  ): Record<string, number> {
    const attribution: Record<string, number> = {};
    
    // Signal contributions (example breakdown)
    attribution['hurricane_base'] = 0.25;
    attribution['technical_signals'] = 0.20;
    attribution['options_flow'] = flowData ? 0.20 : 0;
    attribution['health_adjustment'] = healthScore * 0.15;
    attribution['consensus_boost'] = consensus.consensusStrength * 0.10;
    attribution['regime_factor'] = 0.10;
    
    // Normalize to sum to 1
    const total = Object.values(attribution).reduce((a, b) => a + b, 0);
    for (const key in attribution) {
      attribution[key] = attribution[key] / total;
    }
    
    return attribution;
  }
  
  /**
   * Get recent attribution history for analysis
   */
  getAttributionHistory(limit: number = 20): Array<{ timestamp: string; attribution: Record<string, number> }> {
    const entries = Array.from(this.attributionLog.entries()).slice(-limit);
    return entries.map(([key, attribution]) => ({
      timestamp: key,
      attribution
    }));
  }
  
  /**
   * Export calibration data for persistence
   */
  exportCalibration(): any {
    return {
      healthFeedback: this.healthFeedback.exportCalibration(),
      timestamp: new Date().toISOString(),
      config: this.config
    };
  }
  
  /**
   * Import calibration data
   */
  importCalibration(data: any): void {
    if (data.healthFeedback) {
      this.healthFeedback.importCalibration(data.healthFeedback);
    }
    console.log('Production calibration imported successfully');
  }
}