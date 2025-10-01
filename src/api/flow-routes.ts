/**
 * Options Flow and Health API Routes
 * Bolt-on endpoints for DEX/GEX and prediction health
 */

import { Hono } from 'hono'
import { optionsFlowAnalyzer, type Contract } from '../services/OptionsFlowAnalysis'
import { predictionHealthManager } from '../health/PredictionHealth'
import { loadTF } from '../services/TimeframeDataLoader'
import { YahooFinanceAPI } from '../services/YahooFinanceAPI'
import { PolygonAPI } from '../services/PolygonAPI'
import { MockDataGenerator } from '../services/MockDataGenerator'
import {
  UnusualWhalesClient,
  type UnusualWhalesVariantResult,
  type UnusualWhalesVariant
} from '../services/UnusualWhalesClient'

type Bindings = {
  UNUSUAL_WHALES_API_KEY?: string
  UNUSUAL_WHALES_BASE_URL?: string
}

const api = new Hono<{ Bindings: Bindings }>()

const whaleClientCache = new Map<string, UnusualWhalesClient>()

function getWhalesClient(env: Bindings): UnusualWhalesClient | null {
  const apiKey = env.UNUSUAL_WHALES_API_KEY?.trim()
  const baseUrl = env.UNUSUAL_WHALES_BASE_URL?.trim()

  if (!apiKey && !baseUrl) {
    return null
  }

  const cacheKey = `${apiKey || 'anon'}|${baseUrl || ''}`
  const cached = whaleClientCache.get(cacheKey)
  if (cached) {
    return cached
  }

  const client = new UnusualWhalesClient({ apiKey, baseUrl })
  whaleClientCache.set(cacheKey, client)
  return client
}

function extractArray(payload?: UnusualWhalesVariantResult | null): any[] {
  if (!payload) return []

  const candidates = [
    payload.data,
    payload.data?.data,
    payload.data?.results,
    payload.data?.chains,
    payload.data?.rows,
    (payload as any)?.results,
    (payload as any)?.chains,
    (payload as any)?.rows
  ]

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate
    }
  }

  return []
}

const pickValue = (source: any, keys: string[]): any => {
  if (!source) return undefined
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null) {
      return source[key]
    }
  }
  return undefined
}

function normalizeContract(raw: any): Contract | null {
  if (!raw) return null

  const typeRaw = (pickValue(raw, ['option_type', 'type', 'contract_type', 'side', 'put_call']) || '').toString().toLowerCase()
  const strikeRaw = pickValue(raw, [
    'strike',
    'strike_price',
    'strikePrice',
    'strikeprice',
    'strike_px'
  ])
  const expiryRaw = pickValue(raw, ['expiration', 'expiry', 'expiration_date', 'expirationDate', 'exp_date'])
  const oiRaw = pickValue(raw, ['open_interest', 'openInterest', 'oi'])
  const deltaRaw = pickValue(raw, ['delta', 'greeks_delta']) ?? pickValue(raw?.greeks, ['delta']) ?? pickValue(raw?.option_greeks, ['delta'])
  const gammaRaw = pickValue(raw, ['gamma', 'greeks_gamma']) ?? pickValue(raw?.greeks, ['gamma']) ?? pickValue(raw?.option_greeks, ['gamma'])

  const strike = typeof strikeRaw === 'string' ? parseFloat(strikeRaw) : Number(strikeRaw)
  const openInterest = typeof oiRaw === 'string' ? parseFloat(oiRaw) : Number(oiRaw)
  const delta = typeof deltaRaw === 'string' ? parseFloat(deltaRaw) : Number(deltaRaw)
  const gamma = typeof gammaRaw === 'string' ? parseFloat(gammaRaw) : Number(gammaRaw)

  const type = typeRaw.startsWith('c') ? 'call' : typeRaw.startsWith('p') ? 'put' : null

  if (!type || !isFinite(strike) || !expiryRaw || !isFinite(openInterest) || !isFinite(delta) || !isFinite(gamma)) {
    return null
  }

  return {
    type,
    strike,
    expiry: typeof expiryRaw === 'string' ? expiryRaw : new Date(expiryRaw).toISOString(),
    open_interest: openInterest,
    delta,
    gamma,
    vega: typeof raw.vega === 'number' ? raw.vega : Number(raw.vega) || undefined,
    iv: typeof raw.iv === 'number' ? raw.iv : Number(raw.iv) || undefined,
    bid: typeof raw.bid === 'number' ? raw.bid : Number(raw.bid) || undefined,
    ask: typeof raw.ask === 'number' ? raw.ask : Number(raw.ask) || undefined
  }
}

function convertContracts(data: any[]): Contract[] {
  return data.map(normalizeContract).filter((c): c is Contract => Boolean(c))
}

function deriveSpot(
  variants: Record<string, UnusualWhalesVariantResult> | undefined,
  contracts: Contract[]
): number | null {
  const numeric = (value: any): number | null => {
    if (value === null || value === undefined) return null
    const num = typeof value === 'string' ? parseFloat(value) : Number(value)
    return Number.isFinite(num) ? num : null
  }

  const checkPayload = (payload?: UnusualWhalesVariantResult | null): number | null => {
    if (!payload) return null
    const direct =
      numeric(payload.data?.underlying_price) ||
      numeric(payload.data?.underlyingPrice) ||
      numeric(payload.data?.spot) ||
      numeric(payload.data?.underlying)
    if (direct) return direct

    const array = extractArray(payload)
    for (const entry of array) {
      const candidate =
        numeric(entry?.underlying_price) ||
        numeric(entry?.underlyingPrice) ||
        numeric(entry?.stock_price) ||
        numeric(entry?.stockPrice) ||
        numeric(entry?.spot)
      if (candidate) return candidate
    }

    return null
  }

  const preferredOrder: (UnusualWhalesVariant | string)[] = [
    'chains',
    'flow',
    'sweeps',
    'intraday',
    'volume',
    'alerts',
    'darkpool',
    'unusual'
  ]

  if (variants) {
    for (const key of preferredOrder) {
      const payload = variants[key]
      const spot = checkPayload(payload)
      if (spot) return spot
    }
  }

  if (contracts.length > 0) {
    const strikes = contracts.map(c => c.strike)
    const avgStrike = strikes.reduce((sum, val) => sum + val, 0) / strikes.length
    return avgStrike
  }

  return null
}

async function loadOptionsChain(
  env: Bindings,
  symbol: string
): Promise<{
  chain: Contract[]
  variants: Record<string, UnusualWhalesVariantResult>
  spot: number
  dataSource: string
}> {
  const whalesClient = getWhalesClient(env)
  const now = new Date().toISOString()

  let whalesVariants: Record<string, UnusualWhalesVariantResult> = {}
  if (whalesClient) {
    whalesVariants = await whalesClient.fetchAllVariants(symbol)
  } else {
    whalesVariants = {
      unavailable: {
        variant: 'unavailable',
        success: false,
        fetchedAt: now,
        attempts: [],
        error: 'Unusual Whales client not configured'
      }
    }
  }

  const chainPayload = whalesVariants?.chains
  const chainRaw = extractArray(chainPayload)
  let chain: Contract[] = []
  if (chainRaw.length > 0) {
    chain = convertContracts(chainRaw)
  }

  let spot = deriveSpot(whalesVariants, chain)
  let dataSource = 'unusual_whales'

  if (!spot || !Number.isFinite(spot)) {
    spot = 505 + (Math.random() - 0.5) * 10
    dataSource = chain.length > 0 ? 'unusual_whales+synthetic_spot' : 'synthetic'
  }

  if (!chain || chain.length === 0) {
    chain = MockDataGenerator.generateOptionsChain(spot)
    dataSource = 'synthetic'
  }

  return { chain, variants: whalesVariants, spot, dataSource }
}

/**
 * Get options flow analysis (DEX/GEX/Magnets)
 */
api.get('/flow', async (c) => {
  const symbol = c.req.query('symbol') || 'SPY'
  const asofStr = c.req.query('asof')
  const asof = asofStr ? new Date(asofStr) : new Date()

  try {
    const { chain, variants, spot, dataSource } = await loadOptionsChain(c.env, symbol)

    if (!chain || chain.length === 0) {
      return c.json({
        error: 'No options data available',
        symbol,
        asof,
        flow: null,
        variants
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
      dataSource,
      spot,
      flow: flowAnalysis,
      variants,
      chainSize: chain.length
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
    const { chain, spot, variants, dataSource } = await loadOptionsChain(c.env, symbol)

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
      dataSource,
      magnets: flow.magnets,
      vol_zones: flow.vol_zones,
      levels: flow.levels,
      gamma_flip: flow.gex.gamma_flip,
      variants
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