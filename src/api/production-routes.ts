/**
 * Production API routes for enhanced features
 */

import { Hono } from 'hono';
import { ProductionIntegrationSystem } from '../services/ProductionIntegration';
import { AutoCalibrationScheduler } from '../services/AutoCalibrationScheduler';
import { VolatilityAwareKelly } from '../services/VolatilityAwareKelly';
import { CrossTimeframeConsensus } from '../services/CrossTimeframeConsensus';
import { AdaptiveFlowSmoother } from '../services/FlowSmoothing';
import { MockDataGenerator } from '../services/MockDataGenerator';

const app = new Hono();

// Initialize production systems (lazy initialization to avoid global scope issues)
let productionSystem: ProductionIntegrationSystem | null = null;
let calibrationScheduler: AutoCalibrationScheduler | null = null;
let kellySizer: VolatilityAwareKelly | null = null;
let consensusAnalyzer: CrossTimeframeConsensus | null = null;
let flowSmoother: AdaptiveFlowSmoother | null = null;

// Initialize on first request
function initializeServices() {
  if (!productionSystem) {
    productionSystem = new ProductionIntegrationSystem();
    calibrationScheduler = new AutoCalibrationScheduler();
    kellySizer = new VolatilityAwareKelly();
    consensusAnalyzer = new CrossTimeframeConsensus();
    flowSmoother = new AdaptiveFlowSmoother();
    
    // Note: Auto-calibration scheduling disabled for Cloudflare Workers
    // Would need to use Cloudflare Cron Triggers instead
    // calibrationScheduler.scheduleDaily(3, 0);
  }
}

/**
 * Get production-enhanced predictions
 */
app.get('/predict', async (c) => {
  initializeServices();
  try {
    // Get mock predictions (replace with real data in production)
    const mockPredictions = MockDataGenerator.generatePredictions();
    const mockFlow = MockDataGenerator.generateOptionsFlow(505);
    const vix = 15.82; // Mock VIX
    
    // Create mock health data
    const tfHealthMap = new Map();
    ['5m', '15m', '30m', '1h', '4h', '1d'].forEach(tf => {
      tfHealthMap.set(tf, {
        healthScore: () => 0.65 + Math.random() * 0.3,
        directionalAccuracy: 0.45 + Math.random() * 0.3
      });
    });
    
    // Process with production enhancements
    const productionPredictions = await productionSystem!.processPredictions(
      mockPredictions.perTF,
      tfHealthMap,
      mockFlow.flow,
      vix
    );
    
    // Calculate consensus
    const consensus = consensusAnalyzer!.calculateConsensus(
      productionPredictions.map(p => ({
        tf: p.tf,
        side: p.side,
        confidence: p.adjustedConfidence,
        health: p.healthScore,
        regime: p.metadata.regime
      }))
    );
    
    return c.json({
      success: true,
      predictions: productionPredictions,
      consensus: {
        strength: (consensus.consensusStrength * 100).toFixed(0) + '%',
        dominant: consensus.dominantSide,
        aligned: consensus.alignedTimeframes,
        boost: consensus.confidenceBoost
      },
      metadata: {
        vix,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

/**
 * Get Kelly sizing recommendation
 */
app.post('/kelly', async (c) => {
  initializeServices();
  try {
    const body = await c.req.json();
    const { confidence = 0.75, winRate = 0.65, atr = 2, vix = 15 } = body;
    
    const vixPercentile = kellySizer!.getVixPercentile(vix);
    const kellyResult = kellySizer!.calculatePositionSize({
      winRate,
      winAmount: atr * 2,
      lossAmount: atr,
      confidence,
      vix,
      vixPercentile
    });
    
    const recommendation = kellySizer!.generateRecommendation(kellyResult, vix);
    
    return c.json({
      success: true,
      kelly: {
        baseKelly: (kellyResult.baseKelly * 100).toFixed(2) + '%',
        fractionalKelly: (kellyResult.fractionalKelly * 100).toFixed(2) + '%',
        volAdjusted: (kellyResult.volAdjustedKelly * 100).toFixed(2) + '%',
        finalSize: (kellyResult.finalSize * 100).toFixed(2) + '%',
        maxAllowed: (kellyResult.maxSize * 100).toFixed(0) + '%'
      },
      adjustments: kellyResult.adjustmentFactors,
      recommendation,
      vixPercentile
    });
  } catch (error: any) {
    return c.json({ error: error.message }, 400);
  }
});

/**
 * Get consensus analysis
 */
app.get('/consensus', async (c) => {
  initializeServices();
  try {
    // Get mock predictions
    const predictions = MockDataGenerator.generatePredictions();
    
    const tfPredictions = predictions.perTF.map(p => ({
      tf: p.tf,
      side: p.side,
      confidence: p.confidence,
      health: 0.65 + Math.random() * 0.3,
      regime: p.regime
    }));
    
    const consensus = consensusAnalyzer!.calculateConsensus(tfPredictions);
    const report = consensusAnalyzer!.generateReport(consensus);
    
    return c.json({
      success: true,
      consensus: {
        strength: consensus.consensusStrength,
        strengthPercent: (consensus.consensusStrength * 100).toFixed(0) + '%',
        dominantSide: consensus.dominantSide,
        alignedTimeframes: consensus.alignedTimeframes,
        confidenceBoost: consensus.confidenceBoost,
        signals: consensus.signals
      },
      report,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

/**
 * Get smoothed flow data
 */
app.get('/flow/smoothed', async (c) => {
  initializeServices();
  try {
    const symbol = c.req.query('symbol') || 'SPY';
    const vix = parseFloat(c.req.query('vix') || '15');
    
    // Get mock flow data
    const mockFlow = MockDataGenerator.generateOptionsFlow(505);
    
    // Apply smoothing
    const smoother = flowSmoother!.getSmoother(symbol);
    const smoothedFlow = smoother.processFlow({
      timestamp: new Date(),
      dex: mockFlow.flow.dex.value,
      gex: mockFlow.flow.gex.value,
      spot: mockFlow.flow.spot
    });
    
    // Get statistics
    const stats = smoother.getStatistics();
    
    return c.json({
      success: true,
      flow: {
        raw: {
          dex: smoothedFlow.raw.dex,
          gex: smoothedFlow.raw.gex
        },
        smoothed: {
          dex: smoothedFlow.smoothed.dex,
          gex: smoothedFlow.smoothed.gex
        },
        trend: smoothedFlow.trend,
        volatility: smoothedFlow.volatility,
        statistics: stats
      },
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

/**
 * Get calibration status
 */
app.get('/calibration/status', (c) => {
  initializeServices();
  const status = calibrationScheduler!.getStatus();
  const lastResult = status.lastResult;
  
  return c.json({
    success: true,
    calibration: {
      isRunning: status.isRunning,
      lastRun: status.lastRun?.toISOString() || null,
      nextRun: status.nextRun?.toISOString() || null,
      lastMetrics: lastResult ? {
        accuracy: (lastResult.metrics.accuracy * 100).toFixed(2) + '%',
        sharpe: lastResult.metrics.sharpe.toFixed(2),
        maxDrawdown: (lastResult.metrics.maxDrawdown * 100).toFixed(2) + '%',
        avgKellySize: (lastResult.metrics.avgKellySize * 100).toFixed(2) + '%'
      } : null,
      isDue: calibrationScheduler!.isDue()
    }
  });
});

/**
 * Trigger manual calibration
 */
app.post('/calibration/run', async (c) => {
  initializeServices();
  try {
    const result = await calibrationScheduler!.runCalibration();
    
    return c.json({
      success: result.success,
      metrics: result.metrics,
      updatedParameters: result.updatedParameters,
      nextRun: result.nextRunTime.toISOString()
    });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

/**
 * Get calibration history
 */
app.get('/calibration/history', (c) => {
  initializeServices();
  const limit = parseInt(c.req.query('limit') || '10');
  const history = calibrationScheduler!.getHistory(limit);
  
  return c.json({
    success: true,
    history: history.map(h => ({
      timestamp: h.timestamp.toISOString(),
      success: h.success,
      accuracy: (h.metrics.accuracy * 100).toFixed(2) + '%',
      sharpe: h.metrics.sharpe.toFixed(2),
      parametersUpdated: Object.keys(h.updatedParameters).length
    }))
  });
});

/**
 * Get attribution breakdown for recent predictions
 */
app.get('/attribution', (c) => {
  initializeServices();
  const attributionHistory = productionSystem!.getAttributionHistory(10);
  
  return c.json({
    success: true,
    attributions: attributionHistory.map(a => ({
      timestamp: a.timestamp,
      breakdown: Object.entries(a.attribution).map(([key, value]) => ({
        component: key,
        contribution: (value * 100).toFixed(1) + '%'
      }))
    }))
  });
});

export default app;