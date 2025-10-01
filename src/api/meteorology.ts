/**
 * Market Meteorology API (Unusual Whales backed)
 */

import { Hono } from 'hono'
import { IntegratedPredictionSystem, type ComprehensivePrediction } from '../services/IntegratedPredictionSystem'
import { buildUnusualWhalesClient } from '../services/unusualWhales'

const meteorologyApi = new Hono<{ Bindings: Record<string, string | undefined> }>()

let cachedSystem: IntegratedPredictionSystem | null = null
let cachedToken: string | undefined

function getIntegratedSystem(env: Record<string, string | undefined>) {
  const token = env.UNUSUAL_WHALES_API_TOKEN
  if (!cachedSystem || cachedToken !== token) {
    cachedSystem = new IntegratedPredictionSystem(undefined, undefined, { env })
    cachedToken = token
  }
  return cachedSystem
}

function formatPredictionResponse(prediction: ComprehensivePrediction) {
  const timeframePredictions: Record<string, any> = {}
  const confidences: Record<string, number> = { overall: prediction.overallConfidence }

  for (const [tf, pred] of Object.entries(prediction.predictions)) {
    timeframePredictions[tf] = {
      direction: pred.direction.replace('STRONG_', ''),
      target: pred.targetPrice,
      targetPrice: pred.targetPrice,
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
  }

  return {
    success: true,
    timestamp: prediction.timestamp,
    currentPrice: prediction.currentPrice,
    dataSource: 'Unusual Whales',
    regime: {
      state: prediction.marketRegime,
      current: prediction.marketRegime
    },
    confidence: confidences,
    predictions: timeframePredictions,
    forecasts: timeframePredictions,
    kellySizing: prediction.kellySizing,
    kelly_size: prediction.kellySizing,
    criticalLevels: prediction.criticalLevels,
    warnings: prediction.warnings,
    strongestSignal: {
      timeframe: prediction.strongestSignal,
      prediction: prediction.predictions[prediction.strongestSignal]
    }
  }
}

meteorologyApi.get('/predict/enhanced', async c => {
  try {
    const system = getIntegratedSystem(c.env)
    if (!system.configured) {
      return c.json(
        {
          success: false,
          error: 'Unusual Whales credentials missing',
          message: 'Set UNUSUAL_WHALES_API_TOKEN to enable predictions.'
        },
        500
      )
    }

    const asof = c.req.query('asof') ?? undefined
    const prediction = await system.generatePrediction(asof)
    return c.json(formatPredictionResponse(prediction))
  } catch (error: any) {
    console.error('Enhanced prediction error:', error)
    return c.json(
      {
        success: false,
        error: 'Failed to generate enhanced prediction',
        message: error?.message ?? String(error)
      },
      500
    )
  }
})

meteorologyApi.get('/predict', async c => {
  try {
    const system = getIntegratedSystem(c.env)
    if (!system.configured) {
      return c.json(
        {
          success: false,
          error: 'Unusual Whales credentials missing',
          message: 'Set UNUSUAL_WHALES_API_TOKEN to enable predictions.'
        },
        500
      )
    }

    const asof = c.req.query('asof') ?? undefined
    const prediction = await system.generatePrediction(asof)
    return c.json(formatPredictionResponse(prediction))
  } catch (error: any) {
    console.error('Prediction error:', error)
    return c.json(
      {
        success: false,
        error: 'Failed to generate prediction',
        message: error?.message ?? String(error)
      },
      500
    )
  }
})

meteorologyApi.get('/flow', async c => {
  try {
    const client = buildUnusualWhalesClient(c.env)
    if (!client.enabled) {
      return c.json(
        {
          success: false,
          error: 'Unusual Whales credentials missing',
          message: 'Set UNUSUAL_WHALES_API_TOKEN to enable flow snapshots.'
        },
        500
      )
    }

    const symbol = (c.req.query('symbol') ?? 'SPY').toUpperCase()
    const snapshot = await client.fetchFlow(symbol)
    return c.json({ success: true, symbol, snapshot })
  } catch (error: any) {
    console.error('Flow fetch error:', error)
    return c.json(
      {
        success: false,
        error: 'Failed to fetch Unusual Whales flow snapshot',
        message: error?.message ?? String(error)
      },
      500
    )
  }
})

export { meteorologyApi }
