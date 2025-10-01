import { Hono } from 'hono'
import { IntegratedPredictionSystem } from '../services/IntegratedPredictionSystem'
import { buildUnusualWhalesClient } from '../services/unusualWhales'

const api = new Hono<{ Bindings: Record<string, string | undefined> }>()

let cachedSystem: IntegratedPredictionSystem | null = null
let cachedToken: string | undefined

function getSystem(env: Record<string, string | undefined>) {
  const token = env.UNUSUAL_WHALES_API_TOKEN
  if (!cachedSystem || cachedToken !== token) {
    cachedSystem = new IntegratedPredictionSystem(undefined, undefined, { env })
    cachedToken = token
  }
  return cachedSystem
}

function ensureConfigured(system: IntegratedPredictionSystem) {
  if (!system.configured) {
    throw new Error('Unusual Whales credentials missing. Set UNUSUAL_WHALES_API_TOKEN.')
  }
}

api.get('/api/meteorology/predict', async c => {
  try {
    const system = getSystem(c.env)
    ensureConfigured(system)

    const asof = c.req.query('asof') ?? undefined
    const symbol = (c.req.query('symbol') ?? 'SPY').toUpperCase()

    const prediction = await system.generatePrediction(asof)
    return c.json({ symbol, ...prediction })
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

api.get('/api/meteorology/flow', async c => {
  try {
    const client = buildUnusualWhalesClient(c.env)
    if (!client.enabled) {
      throw new Error('Unusual Whales credentials missing. Set UNUSUAL_WHALES_API_TOKEN.')
    }

    const symbol = (c.req.query('symbol') ?? 'SPY').toUpperCase()
    const snapshot = await client.fetchFlow(symbol)
    return c.json({ success: true, symbol, snapshot })
  } catch (error: any) {
    console.error('Flow error:', error)
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

export { api }
