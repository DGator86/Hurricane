// Enhanced Production API with Options Pricing and Backtesting

import { Hono } from 'hono'
import { EnhancedOptionsScanner } from '../models/OptionsScanner'
import { BacktestingAccuracy } from '../models/BacktestingAccuracy'
import { BlackScholes } from '../models/BlackScholes'
import { IntegratedPredictionSystem } from '../services/IntegratedPredictionSystem'
import type { OptionContract, OptionRecommendation } from '../models/OptionsScanner'

type Bindings = {
  UNUSUAL_WHALES_API_TOKEN?: string
  UNUSUAL_WHALES_API_BASE?: string
  UNUSUAL_WHALES_PREDICT_PATH?: string
  UNUSUAL_WHALES_ENHANCED_PATH?: string
}

const api = new Hono<{ Bindings: Bindings }>()

// Initialize services
let optionsScanner: EnhancedOptionsScanner | null = null
let backtestingTracker: BacktestingAccuracy | null = null
let predictionSystem: IntegratedPredictionSystem | null = null

// Get or create services
function getServices(env: Bindings) {
  if (!optionsScanner) {
    optionsScanner = new EnhancedOptionsScanner({
      maxDaysToExpiry: 2,  // 0DTE, 1DTE, 2DTE
      minDelta: 0.25,
      maxDelta: 0.55,
      minVolume: 100,
      minOpenInterest: 100,
      targetDelta: 0.40,  // Slightly OTM for scalping
      riskFreeRate: 0.05
    })
  }
  
  if (!backtestingTracker) {
    // Initialize with synthetic historical data for demonstration
    backtestingTracker = BacktestingAccuracy.generateSyntheticHistory(30)
  }
  
  if (!predictionSystem) {
    predictionSystem = new IntegratedPredictionSystem(undefined, undefined, { env })
  }
  
  return { optionsScanner, backtestingTracker, predictionSystem }
}

// Get option chain from Polygon or generate synthetic
async function getOptionChain(
  symbol: string,
  env: Bindings
): Promise<OptionContract[]> {
  // Synthetic chain until Unusual Whales options endpoints are wired
  const spotPrice = 455  // Default SPY price
  return EnhancedOptionsScanner.generateSyntheticOptionChain(spotPrice, [0, 1, 2])
}

// Enhanced predictions with options recommendations
api.get('/predictions-with-options', async (c) => {
  try {
    const { optionsScanner, predictionSystem } = getServices(c.env)
    
    // Get predictions
    const predictions = await predictionSystem.generatePrediction()
    
    // Get current SPY price
    const spotPrice = predictions.currentPrice || 455
    
    // Get option chain
    const optionChain = await getOptionChain('SPY', c.env)
    
    // Find best options for each timeframe
    const optionRecommendations = new Map<string, OptionRecommendation>()
    
    for (const [timeframe, prediction] of Object.entries(predictions.predictions)) {
      const recommendation = await optionsScanner.findBestOption(
        spotPrice,
        {
          direction: prediction.direction,
          expectedReturn: prediction.expectedReturn,
          confidence: prediction.confidence,
          timeframe
        },
        optionChain
      )
      
      if (recommendation) {
        optionRecommendations.set(timeframe, recommendation)
      }
    }
    
    return c.json({
      predictions: predictions.predictions,
      options: Object.fromEntries(optionRecommendations),
      marketData: {
        price: predictions.currentPrice,
        regime: predictions.marketRegime,
        vix: 16  // Default VIX
      },
      technicals: predictions.predictions,  // Use predictions as technicals
      overallConfidence: predictions.overallConfidence,
      kellySizing: predictions.kellySizing,
      criticalLevels: predictions.criticalLevels,
      warnings: predictions.warnings,
      timestamp: predictions.timestamp
    })
  } catch (error) {
    console.error('Error generating predictions with options:', error)
    return c.json({ error: 'Failed to generate predictions' }, 500)
  }
})

// Get options recommendations only
api.get('/options-recommendations', async (c) => {
  try {
    const { optionsScanner, predictionSystem } = getServices(c.env)
    
    // Get predictions
    const predictions = await predictionSystem.generatePrediction()
    const spotPrice = predictions.currentPrice || 455
    
    // Get option chain
    const optionChain = await getOptionChain('SPY', c.env)
    
    // Scan for best options
    const recommendations = await optionsScanner.scanAllTimeframes(
      spotPrice,
      new Map(Object.entries(predictions.predictions)),
      optionChain
    )
    
    return c.json({
      recommendations: Object.fromEntries(recommendations),
      spotPrice,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Error getting options recommendations:', error)
    return c.json({ error: 'Failed to get recommendations' }, 500)
  }
})

// Get backtesting accuracy metrics
api.get('/backtesting', async (c) => {
  try {
    const { backtestingTracker } = getServices(c.env)
    
    // Get comprehensive backtest summary
    const summary = backtestingTracker.getBacktestSummary()
    
    return c.json(summary)
  } catch (error) {
    console.error('Error getting backtesting data:', error)
    return c.json({ error: 'Failed to get backtesting data' }, 500)
  }
})

// Get accuracy for specific timeframe
api.get('/backtesting/:timeframe', async (c) => {
  try {
    const { backtestingTracker } = getServices(c.env)
    const timeframe = c.req.param('timeframe')
    
    const metrics = backtestingTracker.getAccuracyMetrics(timeframe)
    
    if (!metrics) {
      return c.json({ error: 'No data for timeframe' }, 404)
    }
    
    return c.json(metrics)
  } catch (error) {
    console.error('Error getting timeframe accuracy:', error)
    return c.json({ error: 'Failed to get accuracy data' }, 500)
  }
})

// Record a new prediction (for tracking)
api.post('/backtesting/record', async (c) => {
  try {
    const { backtestingTracker } = getServices(c.env)
    const body = await c.req.json()
    
    const id = backtestingTracker.recordPrediction(
      body.timeframe,
      body.prediction
    )
    
    return c.json({ id, success: true })
  } catch (error) {
    console.error('Error recording prediction:', error)
    return c.json({ error: 'Failed to record prediction' }, 500)
  }
})

// Update prediction with actual result
api.post('/backtesting/update/:id', async (c) => {
  try {
    const { backtestingTracker } = getServices(c.env)
    const id = c.req.param('id')
    const body = await c.req.json()
    
    backtestingTracker.updatePredictionResult(id, body.actual)
    
    return c.json({ success: true })
  } catch (error) {
    console.error('Error updating prediction:', error)
    return c.json({ error: 'Failed to update prediction' }, 500)
  }
})

// Calculate Black-Scholes price for specific option
api.post('/black-scholes', async (c) => {
  try {
    const body = await c.req.json()
    const {
      spotPrice,
      strike,
      timeToExpiry,
      riskFreeRate = 0.05,
      volatility,
      optionType = 'call'
    } = body
    
    const bs = new BlackScholes()
    
    const result = optionType === 'call'
      ? bs.calculateCall(spotPrice, strike, timeToExpiry, riskFreeRate, volatility)
      : bs.calculatePut(spotPrice, strike, timeToExpiry, riskFreeRate, volatility)
    
    return c.json(result)
  } catch (error) {
    console.error('Error calculating Black-Scholes:', error)
    return c.json({ error: 'Failed to calculate option price' }, 500)
  }
})

// Get option chain with Greeks
api.get('/option-chain/:symbol', async (c) => {
  try {
    const symbol = c.req.param('symbol')
    const optionChain = await getOptionChain(symbol, c.env)
    
    // Enhance with Black-Scholes Greeks
    const bs = new BlackScholes()
    const spotPrice = 455  // Would get from market data
    
    const enhancedChain = optionChain.map(option => {
      const timeToExpiry = Math.max(
        (option.expiration.getTime() - Date.now()) / (365 * 24 * 60 * 60 * 1000),
        0.001
      )
      
      const bsResult = option.type === 'call'
        ? bs.calculateCall(spotPrice, option.strike, timeToExpiry, 0.05, option.impliedVolatility)
        : bs.calculatePut(spotPrice, option.strike, timeToExpiry, 0.05, option.impliedVolatility)
      
      return {
        ...option,
        theoreticalPrice: bsResult.price,
        greeks: bsResult.greeks,
        mispricing: option.mid - bsResult.price
      }
    })
    
    return c.json({
      chain: enhancedChain,
      spotPrice,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Error getting option chain:', error)
    return c.json({ error: 'Failed to get option chain' }, 500)
  }
})

// Health check
api.get('/health', (c) => {
  return c.json({
    status: 'healthy',
    services: {
      optionsScanner: !!optionsScanner,
      backtestingTracker: !!backtestingTracker,
      predictionSystem: !!predictionSystem
    },
    timestamp: new Date().toISOString()
  })
})

export default api