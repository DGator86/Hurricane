/**
 * Options Flow and Health API Routes
 * Bolt-on endpoints for DEX/GEX and prediction health
 */

import { Hono } from 'hono'
import { optionsFlowAnalyzer } from '../services/OptionsFlowAnalysis'
import { predictionHealthManager } from '../health/PredictionHealth'
import { loadTF } from '../services/TimeframeDataLoader'
import { YahooFinanceAPI } from '../services/YahooFinanceAPI'
import { PolygonAPI } from '../services/PolygonAPI'
import { MockDataGenerator } from '../services/MockDataGenerator'

const api = new Hono()

/**
 * Get options flow analysis (DEX/GEX/Magnets)
 */
api.get('/flow', async (c) => {
  const symbol = c.req.query('symbol') || 'SPY'
  const asofStr = c.req.query('asof')
  const asof = asofStr ? new Date(asofStr) : new Date()
  
  try {
    // Use mock data for now since we don't have real options chain
    const spot = 505 + (Math.random() - 0.5) * 10  // Mock spot around 505
    const chain = MockDataGenerator.generateOptionsChain(spot)
    
    if (!chain || chain.length === 0) {
      return c.json({ 
        error: 'No options data available',
        symbol,
        asof,
        flow: null
      }, 404)
    }
    
    // Get ATR data for vol zones
    const atrByTF = await getATRByTimeframe(symbol, asof)
    
    // Get technical levels for S/R
    const technicalLevels = await getTechnicalLevels(symbol, asof)
    
    // Analyze flow
    const flowAnalysis = await optionsFlowAnalyzer.analyzeFlow(
      chain,
      spot,
      asof,
      atrByTF,
      technicalLevels
    )
    
    return c.json({
      symbol,
      asof,
      flow: flowAnalysis
    })
  } catch (error) {
    console.error('Flow analysis error:', error)
    return c.json({ 
      error: 'Failed to analyze options flow',
      details: error.message
    }, 500)
  }
})

/**
 * Get price levels (magnets and S/R)
 */
api.get('/levels', async (c) => {
  const symbol = c.req.query('symbol') || 'SPY'
  const asofStr = c.req.query('asof')
  const asof = asofStr ? new Date(asofStr) : new Date()
  
  try {
    // Use mock data
    const spot = 505 + (Math.random() - 0.5) * 10
    const chain = MockDataGenerator.generateOptionsChain(spot)
    
    const atrByTF = await getATRByTimeframe(symbol, asof)
    const technicalLevels = await getTechnicalLevels(symbol, asof)
    
    const flow = await optionsFlowAnalyzer.analyzeFlow(
      chain,
      spot,
      asof,
      atrByTF,
      technicalLevels
    )
    
    // Extract just levels and magnets
    return c.json({
      symbol,
      spot,
      asof,
      magnets: flow.magnets,
      vol_zones: flow.vol_zones,
      levels: flow.levels,
      gamma_flip: flow.gex.gamma_flip
    })
  } catch (error) {
    console.error('Levels error:', error)
    return c.json({ 
      error: 'Failed to get price levels',
      details: error.message
    }, 500)
  }
})

/**
 * Get prediction health for all timeframes
 */
api.get('/health', async (c) => {
  const symbol = c.req.query('symbol') || 'SPY'
  
  try {
    // Use mock data for now
    const metrics = MockDataGenerator.generateHealthMetrics()
    const warnings: string[] = []
    
    // Overall system health
    const healthScores = Object.values(metrics).map(m => m.score)
    const avgHealth = healthScores.length > 0 ? 
      healthScores.reduce((a, b) => a + b, 0) / healthScores.length : 0.6
    
    const overall = avgHealth >= 0.5 && warnings.length === 0
    
    return c.json({
      symbol,
      overall,
      avgHealth: Math.round(avgHealth * 100) / 100,
      metrics,
      warnings,
      summary: overall ? 
        `✅ All systems healthy (${(avgHealth * 100).toFixed(0)}%)` :
        `⚠️ Health degraded: ${warnings.length} issues`
    })
  } catch (error) {
    console.error('Health check error:', error)
    return c.json({ 
      error: 'Failed to get health metrics',
      details: error.message
    }, 500)
  }
})

/**
 * Get health for specific timeframe
 */
api.get('/health/:tf', async (c) => {
  const tf = c.req.param('tf')
  const symbol = c.req.query('symbol') || 'SPY'
  
  try {
    const score = predictionHealthManager.getHealthScore(tf)
    const metrics = predictionHealthManager.getAllMetrics()[tf]
    
    if (!metrics) {
      return c.json({ 
        error: 'Invalid timeframe',
        tf
      }, 400)
    }
    
    // Generate health report card
    const reportCard = {
      grade: getHealthGrade(score),
      score: Math.round(score * 100),
      status: score >= 0.7 ? 'excellent' : 
              score >= 0.5 ? 'good' : 
              score >= 0.3 ? 'degraded' : 'poor',
      details: {
        samples: metrics.n,
        calibration: {
          p50: `${(metrics.p50Coverage * 100).toFixed(0)}% (target: 50%)`,
          p80: `${(metrics.p80Coverage * 100).toFixed(0)}% (target: 80%)`,
          p95: `${(metrics.p95Coverage * 100).toFixed(0)}% (target: 95%)`,
          error: metrics.calibrationError
        },
        residuals: {
          mean: metrics.zMean,
          std: metrics.zStd,
          status: Math.abs(metrics.zMean) < 0.2 && Math.abs(metrics.zStd - 1) < 0.2 ? 
                  'normal' : 'skewed'
        },
        accuracy: {
          directional: `${(metrics.directionalAccuracy * 100).toFixed(0)}%`,
          edge: metrics.directionalAccuracy > 0.5 ? 
                `+${((metrics.directionalAccuracy - 0.5) * 100).toFixed(0)}%` : 
                'none'
        },
        sharpness: metrics.sharpness
      }
    }
    
    return c.json({
      symbol,
      tf,
      reportCard
    })
  } catch (error) {
    console.error('TF health error:', error)
    return c.json({ 
      error: 'Failed to get timeframe health',
      details: error.message
    }, 500)
  }
})

/**
 * Update health with outcome (for backtesting/live tracking)
 */
api.post('/health/update', async (c) => {
  try {
    const body = await c.req.json()
    const { tf, predicted, realized, trade } = body
    
    if (!tf || !predicted || !realized || !trade) {
      return c.json({ 
        error: 'Missing required fields',
        required: ['tf', 'predicted', 'realized', 'trade']
      }, 400)
    }
    
    // Update health
    predictionHealthManager.updateHealth(tf, predicted, realized, trade)
    
    // Get updated metrics
    const metrics = predictionHealthManager.getAllMetrics()[tf]
    
    return c.json({
      success: true,
      tf,
      updated: metrics
    })
  } catch (error) {
    console.error('Health update error:', error)
    return c.json({ 
      error: 'Failed to update health',
      details: error.message
    }, 500)
  }
})

/**
 * Helper: Get ATR by timeframe
 */
async function getATRByTimeframe(symbol: string, asof: Date): Promise<Record<string, number>> {
  const atrByTF: Record<string, number> = {}
  const timeframes = ['1m', '5m', '15m', '30m', '1h', '4h', '1d']
  
  for (const tf of timeframes) {
    try {
      // Simplified - would use actual loadTF with data fetcher
      const mockATR = {
        '1m': 0.5,
        '5m': 0.8,
        '15m': 1.2,
        '30m': 1.5,
        '1h': 2.0,
        '4h': 3.5,
        '1d': 5.0
      }
      atrByTF[tf] = mockATR[tf] || 1.0
    } catch (error) {
      console.warn(`Failed to get ATR for ${tf}:`, error)
    }
  }
  
  return atrByTF
}

/**
 * Helper: Get technical levels
 */
async function getTechnicalLevels(symbol: string, asof: Date): Promise<any> {
  // Simplified - would fetch actual BB, swings, etc.
  return {
    bb: {
      upper: 510,
      lower: 500
    },
    swings: [498, 502, 505, 508, 512]
  }
}

/**
 * Helper: Get health grade
 */
function getHealthGrade(score: number): string {
  if (score >= 0.9) return 'A+'
  if (score >= 0.85) return 'A'
  if (score >= 0.80) return 'A-'
  if (score >= 0.75) return 'B+'
  if (score >= 0.70) return 'B'
  if (score >= 0.65) return 'B-'
  if (score >= 0.60) return 'C+'
  if (score >= 0.55) return 'C'
  if (score >= 0.50) return 'C-'
  if (score >= 0.45) return 'D+'
  if (score >= 0.40) return 'D'
  return 'F'
}

export default api