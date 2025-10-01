import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { AlpacaClient, type AlpacaCredentials, type AlpacaOrderRequest } from '../services/AlpacaClient'

type Bindings = {
  ALPACA_API_KEY?: string
  ALPACA_API_SECRET?: string
  ALPACA_API_BASE_URL?: string
}

type AlpacaRequestBody = {
  baseUrl?: string
  endpoint?: string
  apiKey?: string
  apiSecret?: string
  credentials?: AlpacaCredentials
  order?: {
    symbol: string
    qty?: number
    notional?: number
    side: string
    type: string
    timeInForce: string
    limitPrice?: number
    stopPrice?: number
    extendedHours?: boolean
    clientOrderId?: string
  }
  list?: {
    status?: string
    limit?: number
  }
}

const api = new Hono<{ Bindings: Bindings }>()

api.use('/*', cors({
  origin: ['*'],
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type']
}))

function resolveCredentials(body: AlpacaRequestBody | undefined, env: Bindings): AlpacaCredentials {
  const baseUrl = body?.baseUrl || body?.endpoint || body?.credentials?.baseUrl || env.ALPACA_API_BASE_URL
  const apiKey = body?.apiKey || body?.credentials?.apiKey || env.ALPACA_API_KEY
  const apiSecret = body?.apiSecret || body?.credentials?.apiSecret || env.ALPACA_API_SECRET

  if (!apiKey || !apiSecret) {
    const error = new Error('Missing Alpaca credentials')
    ;(error as any).status = 400
    throw error
  }

  return {
    apiKey,
    apiSecret,
    baseUrl: baseUrl || 'https://paper-api.alpaca.markets'
  }
}

function maskKey(apiKey: string): string {
  if (!apiKey) return ''
  if (apiKey.length <= 4) return apiKey
  return `${apiKey.slice(0, 4)}…${apiKey.slice(-4)}`
}

api.post('/connect', async c => {
  try {
    const body = await c.req.json<AlpacaRequestBody>().catch(() => ({} as AlpacaRequestBody))
    const credentials = resolveCredentials(body, c.env)
    const client = new AlpacaClient(credentials)

    const account = await client.getAccount()
    let positions: any[] = []
    try {
      positions = await client.getPositions()
    } catch (positionError) {
      const status = (positionError as any)?.status
      if (status && status !== 404) {
        throw positionError
      }
      positions = []
    }

    return c.json({
      connected: true,
      account,
      positions,
      endpoint: credentials.baseUrl,
      key: maskKey(credentials.apiKey)
    })
  } catch (error) {
    console.error('Alpaca connect error:', error)
    const status = (error as any)?.status || 500
    const message = status === 400 ? 'Missing or invalid Alpaca credentials' : 'Failed to connect to Alpaca'
    return c.json({
      connected: false,
      error: message,
      details: (error as Error).message
    }, status)
  }
})

api.post('/orders', async c => {
  try {
    const body = await c.req.json<AlpacaRequestBody>()
    const credentials = resolveCredentials(body, c.env)
    const client = new AlpacaClient(credentials)

    if (!body?.order) {
      return c.json({ error: 'Missing order payload' }, 400)
    }

    const { order } = body
    if (!order.symbol || (!order.qty && !order.notional)) {
      return c.json({ error: 'Order requires symbol and quantity or notional' }, 400)
    }

    const alpacaOrder: AlpacaOrderRequest = {
      symbol: order.symbol.toUpperCase(),
      side: (order.side || 'buy').toLowerCase() as 'buy' | 'sell',
      type: (order.type || 'market').toLowerCase() as AlpacaOrderRequest['type'],
      time_in_force: (order.timeInForce || 'day').toLowerCase() as AlpacaOrderRequest['time_in_force'],
      extended_hours: order.extendedHours ?? false,
      order_class: 'simple'
    }

    if (order.qty) {
      alpacaOrder.qty = Number(order.qty)
    }
    if (order.notional) {
      alpacaOrder.notional = Number(order.notional)
    }
    if (order.limitPrice) {
      alpacaOrder.limit_price = Number(order.limitPrice)
    }
    if (order.stopPrice) {
      alpacaOrder.stop_price = Number(order.stopPrice)
    }
    if (order.clientOrderId) {
      alpacaOrder.client_order_id = order.clientOrderId
    }

    const response = await client.submitOrder(alpacaOrder)

    return c.json({
      success: true,
      order: response
    })
  } catch (error) {
    console.error('Alpaca order error:', error)
    const status = (error as any)?.status || 500
    return c.json({
      success: false,
      error: status === 400 ? (error as Error).message : 'Failed to submit order',
      details: (error as Error).message
    }, status)
  }
})

api.post('/orders/list', async c => {
  try {
    const body = await c.req.json<AlpacaRequestBody>().catch(() => ({} as AlpacaRequestBody))
    const credentials = resolveCredentials(body, c.env)
    const client = new AlpacaClient(credentials)

    const orders = await client.listOrders(body.list || {})
    return c.json({ orders })
  } catch (error) {
    console.error('Alpaca orders list error:', error)
    const status = (error as any)?.status || 500
    return c.json({
      error: status === 400 ? (error as Error).message : 'Failed to fetch Alpaca orders',
      details: (error as Error).message
    }, status)
  }
})

export default api
