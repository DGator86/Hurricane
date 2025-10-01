// QuantConnect Integration API
// Provides endpoints for QuantConnect to fetch predictions and submit results

import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { EnhancedOptionsScanner } from '../models/OptionsScanner'
import { BacktestingAccuracy } from '../models/BacktestingAccuracy'
import { IntegratedPredictionSystem } from '../services/IntegratedPredictionSystem'

type Bindings = {
  UNUSUAL_WHALES_API_TOKEN?: string
  UNUSUAL_WHALES_API_BASE?: string
  UNUSUAL_WHALES_PREDICT_PATH?: string
  UNUSUAL_WHALES_ENHANCED_PATH?: string
}

const api = new Hono<{ Bindings: Bindings }>()

// Enable CORS for QuantConnect
api.use('/*', cors({
  origin: ['*'], // Allow all origins for API access
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-QC-Token'],
}))

// Store for tracking live trades
const liveTradesStore = new Map<string, any>()
const backtestResultsStore = new Map<string, any>()

/**
 * Get current predictions optimized for QuantConnect
 * Returns simplified format for easy consumption
 */
api.get('/predictions/current', async (c) => {
  try {
    const predictionSystem = new IntegratedPredictionSystem(undefined, undefined, { env: c.env })
    
    const predictions = await predictionSystem.generatePrediction()
    const optionsScanner = new EnhancedOptionsScanner()
    
    // Get current SPY price
    const spotPrice = predictions.currentPrice || 455
    
    // Generate synthetic option chain for recommendations
    const optionChain = EnhancedOptionsScanner.generateSyntheticOptionChain(spotPrice, [0, 1, 2])
    
    // Format for QuantConnect
    const qcFormat = {
      timestamp: predictions.timestamp,
      spot_price: spotPrice,
      market_regime: predictions.marketRegime,
      overall_confidence: predictions.overallConfidence,
      kelly_sizing: predictions.kellySizing,
      critical_levels: predictions.criticalLevels,
      timeframes: {}
    }
    
    // Process each timeframe
    for (const [tf, pred] of Object.entries(predictions.predictions)) {
      const option = await optionsScanner.findBestOption(
        spotPrice,
        {
          direction: pred.direction,
          expectedReturn: pred.expectedMove / 100,
          confidence: pred.confidence,
          timeframe: tf
        },
        optionChain
      )
      
      qcFormat.timeframes[tf] = {
        direction: pred.direction === 'BUY' ? 1 : pred.direction === 'SELL' ? -1 : 0,
        confidence: pred.confidence,
        target_price: pred.targetPrice,
        stop_loss: pred.stopLoss,
        expected_move: pred.expectedMove,
        kelly_size: pred.kellySize || predictions.kellySizing,
        option: option ? {
          type: option.type,
          strike: option.strike,
          expiry_days: option.daysToExpiry,
          cost: option.cost,
          delta: option.delta,
          gamma: option.gamma,
          theta: option.theta,
          vega: option.vega,
          expected_value: option.expectedValue
        } : null
      }
    }
    
    return c.json(qcFormat)
  } catch (error) {
    console.error('Error generating QC predictions:', error)
    return c.json({ error: 'Failed to generate predictions' }, 500)
  }
})

/**
 * Get predictions for specific timeframe
 */
api.get('/predictions/:timeframe', async (c) => {
  const timeframe = c.req.param('timeframe')
  const validTimeframes = ['1m', '5m', '15m', '1h', '4h', '1d']
  
  if (!validTimeframes.includes(timeframe)) {
    return c.json({ error: 'Invalid timeframe' }, 400)
  }
  
  try {
    const predictionSystem = new IntegratedPredictionSystem(undefined, undefined, { env: c.env })
    
    const predictions = await predictionSystem.generatePrediction()
    const tfPrediction = predictions.predictions[timeframe]
    
    if (!tfPrediction) {
      return c.json({ error: 'No prediction for timeframe' }, 404)
    }
    
    return c.json({
      timeframe,
      prediction: tfPrediction,
      spot_price: predictions.currentPrice,
      timestamp: predictions.timestamp
    })
  } catch (error) {
    return c.json({ error: 'Failed to get prediction' }, 500)
  }
})

/**
 * Submit trade execution from QuantConnect
 */
api.post('/trades/execute', async (c) => {
  try {
    const body = await c.req.json()
    const {
      trade_id,
      timestamp,
      symbol,
      action, // BUY, SELL
      quantity,
      price,
      option_details,
      prediction_used,
      portfolio_value
    } = body
    
    // Store trade for tracking
    liveTradesStore.set(trade_id, {
      ...body,
      submitted_at: new Date().toISOString(),
      status: 'executed'
    })
    
    // Track in backtesting system
    if (prediction_used) {
      const tracker = new BacktestingAccuracy()
      const id = tracker.recordPrediction(
        prediction_used.timeframe,
        {
          direction: action.toLowerCase() as any,
          expectedReturn: prediction_used.expected_move / 100,
          confidence: prediction_used.confidence,
          entryPrice: price,
          targetPrice: prediction_used.target_price,
          stopLoss: prediction_used.stop_loss
        }
      )
      
      // Store ID for later update
      liveTradesStore.set(trade_id, {
        ...liveTradesStore.get(trade_id),
        prediction_id: id
      })
    }
    
    return c.json({
      success: true,
      trade_id,
      message: 'Trade recorded successfully'
    })
  } catch (error) {
    console.error('Error recording trade:', error)
    return c.json({ error: 'Failed to record trade' }, 500)
  }
})

/**
 * Update trade result
 */
api.post('/trades/:trade_id/result', async (c) => {
  try {
    const trade_id = c.req.param('trade_id')
    const body = await c.req.json()
    const {
      exit_price,
      exit_timestamp,
      profit_loss,
      profit_loss_percent,
      hit_target,
      hit_stop_loss,
      max_favorable_move,
      max_adverse_move
    } = body
    
    const trade = liveTradesStore.get(trade_id)
    if (!trade) {
      return c.json({ error: 'Trade not found' }, 404)
    }
    
    // Update trade record
    liveTradesStore.set(trade_id, {
      ...trade,
      exit_price,
      exit_timestamp,
      profit_loss,
      profit_loss_percent,
      hit_target,
      hit_stop_loss,
      max_favorable_move,
      max_adverse_move,
      status: 'closed'
    })
    
    // Update backtesting accuracy
    if (trade.prediction_id) {
      const tracker = new BacktestingAccuracy()
      tracker.updatePredictionResult(trade.prediction_id, {
        exitPrice: exit_price,
        actualReturn: profit_loss_percent / 100,
        hitTarget: hit_target,
        hitStopLoss: hit_stop_loss,
        maxMove: max_favorable_move,
        minMove: max_adverse_move
      })
    }
    
    return c.json({
      success: true,
      trade_id,
      message: 'Trade result recorded'
    })
  } catch (error) {
    console.error('Error updating trade result:', error)
    return c.json({ error: 'Failed to update trade result' }, 500)
  }
})

/**
 * Submit backtest results from QuantConnect
 */
api.post('/backtest/results', async (c) => {
  try {
    const body = await c.req.json()
    const {
      backtest_id,
      start_date,
      end_date,
      initial_capital,
      final_capital,
      total_return,
      sharpe_ratio,
      max_drawdown,
      win_rate,
      total_trades,
      profitable_trades,
      average_win,
      average_loss,
      trades_by_timeframe,
      accuracy_by_timeframe
    } = body
    
    // Store backtest results
    backtestResultsStore.set(backtest_id, {
      ...body,
      submitted_at: new Date().toISOString()
    })
    
    return c.json({
      success: true,
      backtest_id,
      message: 'Backtest results stored',
      summary: {
        total_return: `${(total_return * 100).toFixed(2)}%`,
        sharpe_ratio: sharpe_ratio.toFixed(2),
        win_rate: `${(win_rate * 100).toFixed(1)}%`,
        max_drawdown: `${(max_drawdown * 100).toFixed(1)}%`
      }
    })
  } catch (error) {
    console.error('Error storing backtest results:', error)
    return c.json({ error: 'Failed to store backtest results' }, 500)
  }
})

/**
 * Get historical predictions for backtesting
 */
api.get('/historical/:date', async (c) => {
  const date = c.req.param('date')
  
  // Validate date format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return c.json({ error: 'Invalid date format. Use YYYY-MM-DD' }, 400)
  }
  
  try {
    // In production, this would fetch from your database
    // For now, generate synthetic historical data
    const predictionSystem = new IntegratedPredictionSystem(
      c.env.POLYGON_API_KEY,
      c.env.TWELVE_DATA_API_KEY
    )
    
    // Generate prediction as if it was for that date
    const predictions = await predictionSystem.generatePrediction(date)
    
    return c.json({
      date,
      predictions: predictions.predictions,
      spot_price: predictions.currentPrice,
      market_regime: predictions.marketRegime
    })
  } catch (error) {
    return c.json({ error: 'Failed to get historical data' }, 500)
  }
})

/**
 * Get trade history
 */
api.get('/trades/history', (c) => {
  const limit = parseInt(c.req.query('limit') || '100')
  const status = c.req.query('status') // 'executed', 'closed', 'all'
  
  let trades = Array.from(liveTradesStore.values())
  
  if (status && status !== 'all') {
    trades = trades.filter(t => t.status === status)
  }
  
  // Sort by timestamp descending
  trades.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
  
  // Apply limit
  trades = trades.slice(0, limit)
  
  return c.json({
    trades,
    count: trades.length,
    total: liveTradesStore.size
  })
})

/**
 * Get performance metrics
 */
api.get('/performance', (c) => {
  const trades = Array.from(liveTradesStore.values()).filter(t => t.status === 'closed')
  
  if (trades.length === 0) {
    return c.json({
      message: 'No closed trades yet',
      metrics: null
    })
  }
  
  const profitable = trades.filter(t => t.profit_loss > 0)
  const losses = trades.filter(t => t.profit_loss < 0)
  
  const totalProfit = profitable.reduce((sum, t) => sum + t.profit_loss, 0)
  const totalLoss = Math.abs(losses.reduce((sum, t) => sum + t.profit_loss, 0))
  
  return c.json({
    metrics: {
      total_trades: trades.length,
      profitable_trades: profitable.length,
      losing_trades: losses.length,
      win_rate: (profitable.length / trades.length) * 100,
      profit_factor: totalLoss > 0 ? totalProfit / totalLoss : totalProfit,
      average_win: profitable.length > 0 ? totalProfit / profitable.length : 0,
      average_loss: losses.length > 0 ? totalLoss / losses.length : 0,
      total_pnl: totalProfit - totalLoss
    }
  })
})

// Health check
api.get('/health', (c) => {
  return c.json({
    status: 'healthy',
    service: 'quantconnect-integration',
    timestamp: new Date().toISOString(),
    active_trades: liveTradesStore.size,
    backtest_results: backtestResultsStore.size
  })
})

export default api