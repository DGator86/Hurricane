/**
 * Market Meteorology API
 * Implements the Hurricane-inspired ensemble prediction system
 */

import { Hono } from 'hono'
import { 
  MarketMeteorologySystem,
  MarketRegime,
  type OHLCV,
  type OptionSnapshot,
  type DarkPoolPrint,
  type MarketEvent,
  type OptionTrade
} from '../models/MarketMeteorology'
import { EnhancedMarketDataService } from '../market-data-enhanced'
import { IntegratedPredictionSystem, type TimeframePrediction } from '../services/IntegratedPredictionSystem'

type Bindings = {
  POLYGON_API_KEY?: string
  ALPHA_VANTAGE_API_KEY?: string
  TWELVE_DATA_API_KEY?: string
}

type ExtendedOptionTrade = OptionTrade & {
  premium?: number
  targetPrice?: number
  greeks?: Record<string, number>
  kellySize?: number
}

const meteorologyApi = new Hono<{ Bindings: Bindings }>()

// Initialize the system
const meteorologySystem = new MarketMeteorologySystem()

/**
 * Get ENHANCED prediction with all Hurricane features (75% accuracy target)
 */
meteorologyApi.get('/predict/enhanced', async (c) => {
  try {
    const asof = c.req.query('asof')
    
    // Initialize the integrated system
    const env = c.env as Bindings
    const integratedSystem = new IntegratedPredictionSystem(
      env.POLYGON_API_KEY || 'Jm_fqc_gtSTSXG78P67dpBpO3LX_4P6D',
      env.TWELVE_DATA_API_KEY || '44b220a2cbd540c9a50ed2a97ef3e8d8'
    )

    // Generate comprehensive prediction
    const prediction = await integratedSystem.generatePrediction(asof)

    // Format response for backtesting compatibility
    const timeframePredictions: Record<string, Record<string, unknown>> = {}
    const confidences: Record<string, number> = { overall: prediction.overallConfidence }

    const predictionEntries = Object.entries(prediction.predictions) as [
      keyof typeof prediction.predictions,
      TimeframePrediction
    ][]

    predictionEntries.forEach(([tf, pred]) => {
      timeframePredictions[tf] = {
        direction: pred.direction.replace('STRONG_', '').replace('_', ''),
        target: pred.targetPrice,
        stop_loss: pred.stopLoss,
        stopLoss: pred.stopLoss,
        cone_upper: pred.targetPrice * 1.02,
        cone_lower: pred.stopLoss * 0.98,
        upperBound: pred.targetPrice * 1.02,
        lowerBound: pred.stopLoss * 0.98,
        confidence: pred.confidence,
        reasons: pred.reasons,
        riskReward: pred.riskReward,
        kellySize: pred.kellySize
      }
      confidences[tf] = pred.confidence
    })
    
    return c.json({
      success: true,
      timestamp: prediction.timestamp,
      currentPrice: prediction.currentPrice,
      dataSource: 'Integrated Hurricane System v2',
      
      // Regime
      regime: {
        state: prediction.marketRegime,
        current: prediction.marketRegime
      },
      
      // Confidence
      confidence: confidences,
      
      // Predictions
      predictions: timeframePredictions,
      forecasts: timeframePredictions,
      
      // Kelly sizing
      kellySizing: prediction.kellySizing,
      kelly_size: prediction.kellySizing,
      
      // Critical levels
      criticalLevels: prediction.criticalLevels,
      
      // Warnings
      warnings: prediction.warnings,
      
      // Strongest signal
      strongestSignal: {
        timeframe: prediction.strongestSignal,
        prediction: prediction.predictions[prediction.strongestSignal]
      }
    })
  } catch (error) {
    console.error('Enhanced prediction error:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return c.json({
      success: false,
      error: 'Failed to generate enhanced prediction',
      message
    }, 500)
  }
})

/**
 * Get full Market Meteorology prediction (original)
 */
meteorologyApi.get('/predict', async (c) => {
  try {
    // Check for historical date parameter (for backtesting)
    const asof = c.req.query('asof')
    const isHistorical = !!asof
    
    // Get market data (using Polygon as primary)
    const env = c.env as Bindings
    const marketService = new EnhancedMarketDataService(
      env.POLYGON_API_KEY || 'Jm_fqc_gtSTSXG78P67dpBpO3LX_4P6D',
      env.ALPHA_VANTAGE_API_KEY
    )
    
    // For historical requests, we need to fetch historical data
    // Note: This would require the market service to support historical queries
    const marketStatus = isHistorical 
      ? await marketService.getHistoricalMarketStatus(asof)
      : await marketService.getMarketStatus()
    
    // Convert to OHLCV format
    const currentBar: OHLCV = {
      symbol: 'SPY',
      ts: Date.now(),
      open: marketStatus.spy.price,
      high: marketStatus.spy.price * 1.001,
      low: marketStatus.spy.price * 0.999,
      close: marketStatus.spy.price,
      volume: marketStatus.spy.volume || 80000000
    }
    
    // Generate synthetic options data (in production, fetch real data)
    const optionsData = generateSyntheticOptions(marketStatus.spy.price, marketStatus.vix)
    
    // Generate synthetic dark pool data
    const darkPoolData = generateSyntheticDarkPool(marketStatus.spy.price)
    
    // Check for recent events
    const events = getMarketEvents()
    
    // Run the full Market Meteorology prediction
    const prediction = await meteorologySystem.predict(
      currentBar,
      optionsData,
      darkPoolData,
      events
    )
    
    // Generate timeframe predictions based on forecast
    const timeframePredictions = generateTimeframePredictions(
      marketStatus.spy.price,
      prediction.forecast,
      marketStatus
    )
    
    // Format response (compatible with backtest harness)
    const optionTrade = prediction.optionTrade as ExtendedOptionTrade
    const premium = optionTrade.premium ?? optionTrade.entryPrice
    const targetPremium = optionTrade.targetPrice ?? optionTrade.targetExit
    const greeks = optionTrade.greeks ?? {}
    const kellySize = optionTrade.kellySize ?? 0.1

    return c.json({
      success: true,
      timestamp: isHistorical ? `${asof}T09:30:00Z` : new Date().toISOString(),
      currentPrice: marketStatus.spy.price,
      dataSource: marketStatus.dataSource,
      
      // Regime analysis
      regime: {
        state: MarketRegime[prediction.regime],
        current: MarketRegime[prediction.regime],
        probability: getRegimeProbability(prediction.regime)
      },
      
      // Overall confidence
      confidence: {
        overall: prediction.forecast.confidence,
        ...Object.fromEntries(
          Object.entries(timeframePredictions).map(([tf, pred]) => [
            tf,
            (pred as { confidence?: number }).confidence ?? prediction.forecast.confidence
          ])
        )
      },
      
      // Timeframe predictions (formatted for backtester)
      predictions: timeframePredictions,
      forecasts: timeframePredictions, // Duplicate for compatibility
      
      // Price forecast
      forecast: {
        expectedPrice: prediction.forecast.expectedPrice,
        cone: prediction.forecast.cone,
        directionalScore: prediction.forecast.directionalScore,
        confidence: prediction.forecast.confidence,
        signal: getSignalFromScore(prediction.forecast.directionalScore)
      },
      
      // Options recommendation
      optionTrade: {
        ...prediction.optionTrade,
        side: optionTrade.side,
        premium,
        targetPremium,
        greeks
      },
      option_recommendation: {
        type: optionTrade.side,
        strike: optionTrade.strike,
        expiry: optionTrade.expiry,
        entry_price: premium,
        target_price: targetPremium,
        stop_loss: optionTrade.stopLoss,
        confidence: optionTrade.confidence || prediction.forecast.confidence,
        greeks
      },

      // Kelly sizing
      kellySizing: kellySize,
      kelly_size: kellySize,
      
      // Flow metrics
      flowMetrics: {
        gex: calculateGEX(optionsData),
        dix: 0.42, // Placeholder - would need real DIX data
        vanna: calculateVanna(optionsData),
        charm: calculateCharm(optionsData)
      },
      flow_metrics: {
        gex: calculateGEX(optionsData),
        dix: 0.42,
        vanna: calculateVanna(optionsData),
        charm: calculateCharm(optionsData)
      },
      
      // Supporting metrics
      metrics: {
        vix: marketStatus.vix,
        rsi: marketStatus.rsi,
        macd: marketStatus.macd,
        gex: calculateGEX(optionsData),
        darkPoolBias: calculateDarkPoolBias(darkPoolData)
      }
    })
  } catch (error) {
    console.error('Market Meteorology prediction error:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return c.json({
      success: false,
      error: 'Failed to generate prediction',
      message
    }, 500)
  }
})

/**
 * Get regime analysis only
 */
meteorologyApi.get('/regime', async (c) => {
  try {
    const env = c.env as Bindings
    const marketService = new EnhancedMarketDataService(
      env.POLYGON_API_KEY || 'Jm_fqc_gtSTSXG78P67dpBpO3LX_4P6D',
      env.ALPHA_VANTAGE_API_KEY
    )
    
    const marketStatus = await marketService.getMarketStatus()
    
    // Simplified regime detection based on current metrics
    const regime = detectRegime(marketStatus)
    
    return c.json({
      success: true,
      regime: MarketRegime[regime],
      characteristics: getRegimeCharacteristics(regime),
      tradingImplications: getTradingImplications(regime),
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return c.json({
      success: false,
      error: 'Failed to analyze regime',
      message
    }, 500)
  }
})

/**
 * Get options flow analysis (GEX, Vanna, Charm)
 */
meteorologyApi.get('/flow', async (c) => {
  try {
    const env = c.env as Bindings
    const marketService = new EnhancedMarketDataService(
      env.POLYGON_API_KEY || 'Jm_fqc_gtSTSXG78P67dpBpO3LX_4P6D',
      env.ALPHA_VANTAGE_API_KEY
    )
    
    const marketStatus = await marketService.getMarketStatus()
    const optionsData = generateSyntheticOptions(marketStatus.spy.price, marketStatus.vix)
    
    const gex = calculateGEX(optionsData)
    const vanna = calculateVanna(optionsData)
    const charm = calculateCharm(optionsData)
    
    return c.json({
      success: true,
      flow: {
        GEX: {
          value: gex,
          sign: Math.sign(gex),
          interpretation: gex > 0 ? 'Suppressive (mean-reverting)' : 'Accelerative (trending)'
        },
        VANNA: {
          value: vanna,
          effect: 'Volatility-driven hedging flow'
        },
        CHARM: {
          value: charm,
          effect: 'Time-decay hedging flow'
        }
      },
      implications: {
        volatility: gex > 0 ? 'Compressed' : 'Expanded',
        momentum: gex < 0 ? 'Can persist' : 'Likely to fade',
        optimalStrategy: gex > 0 ? 'Fade extremes' : 'Follow momentum'
      },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return c.json({
      success: false,
      error: 'Failed to analyze options flow',
      message
    }, 500)
  }
})

// ========================
// HELPER FUNCTIONS
// ========================

function generateSyntheticOptions(spotPrice: number, vix: number): OptionSnapshot[] {
  const options: OptionSnapshot[] = []
  const strikes = []
  
  // Generate strikes around current price
  for (let i = -10; i <= 10; i++) {
    strikes.push(Math.round(spotPrice + i))
  }
  
  // Generate options for each strike
  strikes.forEach(K => {
    const moneyness = K / spotPrice
    const T = 1/252 // 1 day to expiry
    
    // Simplified Greeks
    const callDelta = moneyness > 1 ? 0.3 : 0.6
    const putDelta = -1 + callDelta
    const gamma = Math.exp(-Math.pow(moneyness - 1, 2) / 0.01) * 0.05
    const vega = gamma * 10
    const theta = -gamma * 5
    
    // Call option
    options.push({
      ts: Date.now(),
      S: spotPrice,
      r: 0.05,
      q: 0.02,
      K,
      T,
      cp: 'C',
      mid: Math.max(0, spotPrice - K) + 0.5,
      bid: Math.max(0, spotPrice - K) + 0.4,
      ask: Math.max(0, spotPrice - K) + 0.6,
      iv: vix / 100,
      delta: callDelta,
      gamma,
      vega,
      theta,
      oi: Math.random() * 10000,
      vol: Math.random() * 5000,
      notional: 100 * (Math.max(0, spotPrice - K) + 0.5)
    })
    
    // Put option
    options.push({
      ts: Date.now(),
      S: spotPrice,
      r: 0.05,
      q: 0.02,
      K,
      T,
      cp: 'P',
      mid: Math.max(0, K - spotPrice) + 0.5,
      bid: Math.max(0, K - spotPrice) + 0.4,
      ask: Math.max(0, K - spotPrice) + 0.6,
      iv: vix / 100,
      delta: putDelta,
      gamma,
      vega,
      theta,
      oi: Math.random() * 10000,
      vol: Math.random() * 5000,
      notional: 100 * (Math.max(0, K - spotPrice) + 0.5)
    })
  })
  
  return options
}

function generateSyntheticDarkPool(spotPrice: number): DarkPoolPrint[] {
  const prints: DarkPoolPrint[] = []
  const now = Date.now()
  
  // Generate some dark pool prints
  for (let i = 0; i < 20; i++) {
    prints.push({
      ts: now - i * 60000, // Last 20 minutes
      price: spotPrice + (Math.random() - 0.5) * 0.5,
      size: Math.floor(Math.random() * 10000) + 1000,
      is_short: Math.random() > 0.5,
      venue: 'DARK_POOL_' + Math.floor(Math.random() * 5)
    })
  }
  
  return prints
}

function getMarketEvents(): MarketEvent[] {
  const events: MarketEvent[] = []
  const now = Date.now()
  
  // Check if we're near any major events
  const hour = new Date().getHours()
  const dayOfWeek = new Date().getDay()
  
  // FOMC days (simplified - usually Wednesday afternoon)
  if (dayOfWeek === 3 && hour >= 14 && hour <= 15) {
    events.push({
      event_id: 'FOMC_' + new Date().toISOString().split('T')[0],
      event_type: 'FOMC',
      ts: now,
      importance: 3,
      symbol_scope: 'global'
    })
  }
  
  // Options expiry (Friday)
  if (dayOfWeek === 5) {
    events.push({
      event_id: 'OPEX_' + new Date().toISOString().split('T')[0],
      event_type: 'OPEX',
      ts: now,
      importance: 2,
      symbol_scope: 'SPY'
    })
  }
  
  return events
}

function calculateGEX(options: OptionSnapshot[]): number {
  return options.reduce((gex, opt) => {
    const sign = opt.cp === 'C' ? 1 : -1
    return gex + opt.gamma * opt.notional * sign
  }, 0)
}

function calculateVanna(options: OptionSnapshot[]): number {
  return options.reduce((vanna, opt) => {
    return vanna + opt.vega * opt.delta * opt.notional
  }, 0)
}

function calculateCharm(options: OptionSnapshot[]): number {
  return options.reduce((charm, opt) => {
    return charm + opt.theta * opt.notional
  }, 0)
}

function calculateDarkPoolBias(darkPool: DarkPoolPrint[]): number {
  const totalVolume = darkPool.reduce((sum, dp) => sum + dp.size, 0)
  const shortVolume = darkPool.filter(dp => dp.is_short).reduce((sum, dp) => sum + dp.size, 0)
  
  if (totalVolume === 0) return 0
  
  const shortRatio = shortVolume / totalVolume
  return (0.5 - shortRatio) * 2 // Normalize to [-1, 1]
}

function detectRegime(marketStatus: any): MarketRegime {
  // Simplified regime detection
  const rsi = marketStatus.rsi
  const vix = marketStatus.vix
  
  if (vix > 25) return MarketRegime.VOL_EXPANSION
  if (rsi > 30 && rsi < 70 && vix < 20) return MarketRegime.RANGE
  if ((rsi > 70 || rsi < 30) && vix < 25) return MarketRegime.TREND
  
  return MarketRegime.FLUX
}

function getRegimeProbability(regime: MarketRegime): number {
  // Placeholder - in production, this would come from the HMM posteriors
  return 0.6 + Math.random() * 0.3
}

function getRegimeCharacteristics(regime: MarketRegime): string {
  const characteristics = {
    [MarketRegime.TREND]: 'Strong directional movement, momentum persists, follow the trend',
    [MarketRegime.RANGE]: 'Mean-reverting, fade extremes, support/resistance holds',
    [MarketRegime.VOL_EXPANSION]: 'High volatility, wide swings, breakouts likely',
    [MarketRegime.FLUX]: 'Transitional state, unclear direction, reduce position size'
  }
  return characteristics[regime]
}

function getTradingImplications(regime: MarketRegime): string {
  const implications = {
    [MarketRegime.TREND]: 'Buy calls on pullbacks (uptrend) or puts on rallies (downtrend)',
    [MarketRegime.RANGE]: 'Sell at resistance, buy at support, avoid middle of range',
    [MarketRegime.VOL_EXPANSION]: 'Buy straddles, widen stops, reduce position size',
    [MarketRegime.FLUX]: 'Stay flat or reduce exposure until regime clarifies'
  }
  return implications[regime]
}

function getSignalFromScore(score: number): string {
  if (score > 1.5) return 'STRONG BUY'
  if (score > 0.5) return 'BUY'
  if (score < -1.5) return 'STRONG SELL'
  if (score < -0.5) return 'SELL'
  return 'NEUTRAL'
}

function generateTimeframePredictions(currentPrice: number, forecast: any, marketStatus: any): any {
  const timeframes = ['1m', '5m', '15m', '1h', '4h', '1d']
  const predictions: any = {}
  
  timeframes.forEach(tf => {
    const multiplier = getTimeframeMultiplier(tf)
    
    // Add some variation to directional score based on timeframe
    const tfVariation = (Math.random() - 0.5) * 0.5
    const adjustedScore = forecast.directionalScore + tfVariation
    
    const direction = adjustedScore > 0.3 ? 'BULLISH' : 
                     adjustedScore < -0.3 ? 'BEARISH' : 'NEUTRAL'
    
    // Scale targets based on timeframe
    const moveSize = (Math.abs(forecast.expectedPrice - currentPrice) / currentPrice) * multiplier
    const target = direction === 'BULLISH' ? 
      currentPrice * (1 + moveSize) : 
      direction === 'BEARISH' ?
      currentPrice * (1 - moveSize) :
      currentPrice
    
    const stopDistance = moveSize * 0.5 // 50% of expected move as stop
    const stopLoss = direction === 'BULLISH' ?
      currentPrice * (1 - stopDistance) :
      direction === 'BEARISH' ?
      currentPrice * (1 + stopDistance) :
      currentPrice
    
    // Cone bounds based on volatility
    const coneWidth = moveSize * 2
    
    predictions[tf] = {
      direction,
      target: Math.round(target * 100) / 100,
      stop_loss: Math.round(stopLoss * 100) / 100,
      stopLoss: Math.round(stopLoss * 100) / 100,
      cone_upper: Math.round(currentPrice * (1 + coneWidth) * 100) / 100,
      cone_lower: Math.round(currentPrice * (1 - coneWidth) * 100) / 100,
      upperBound: Math.round(currentPrice * (1 + coneWidth) * 100) / 100,
      lowerBound: Math.round(currentPrice * (1 - coneWidth) * 100) / 100,
      confidence: Math.max(0.5, Math.min(0.95, forecast.confidence - (multiplier * 0.05)))
    }
  })
  
  return predictions
}

function getTimeframeMultiplier(timeframe: string): number {
  const multipliers: any = {
    '1m': 0.1,
    '5m': 0.25,
    '15m': 0.5,
    '1h': 1.0,
    '4h': 2.0,
    '1d': 3.0
  }
  return multipliers[timeframe] || 1.0
}

export { meteorologyApi }