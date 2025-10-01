/**
 * Integrated Hurricane SPY Prediction System
 * Unified around the Unusual Whales API as the single data source.
 */

import {
  buildUnusualWhalesClient,
  UnusualWhalesClient,
  type ClientOptions
} from './unusualWhales'

export type TimeframeKey = '1m' | '5m' | '15m' | '1h' | '4h' | '1d'
export type PredictionBias = 'bullish' | 'bearish' | 'neutral'
export type PredictionDirection =
  | 'STRONG_BUY'
  | 'BUY'
  | 'NEUTRAL'
  | 'SELL'
  | 'STRONG_SELL'

export interface TimeframePrediction {
  timeframe: TimeframeKey
  direction: PredictionDirection
  bias: PredictionBias
  confidence: number
  targetPrice: number
  stopLoss: number
  expectedMove: number // Percentage magnitude (e.g. 1.2 == 1.2%)
  expectedReturn: number // Signed decimal (e.g. 0.012 == +1.2%)
  riskReward: number
  kellySize: number
  reasons: string[]
  features: Record<string, unknown>
  timestamp: number
}

export interface ComprehensivePrediction {
  timestamp: string
  currentPrice: number
  predictions: Record<TimeframeKey, TimeframePrediction>
  overallConfidence: number
  strongestSignal: TimeframeKey
  marketRegime: string
  kellySizing: number
  criticalLevels: {
    support: number[]
    resistance: number[]
    vwap: number
  }
  warnings: string[]
}

export type IntegratedSystemOptions = Partial<ClientOptions> & {
  env?: Record<string, string | undefined>
  client?: UnusualWhalesClient
  symbol?: string
}

const TIMEFRAMES: TimeframeKey[] = ['1m', '5m', '15m', '1h', '4h', '1d']

export class IntegratedPredictionSystem {
  private client: UnusualWhalesClient
  private symbol: string

  constructor(
    _polygonApiKey?: string,
    _twelveDataApiKey?: string,
    options: IntegratedSystemOptions = {},
  ) {
    this.symbol = options.symbol ?? 'SPY'

    if (options.client) {
      this.client = options.client
    } else {
      const { env, client: _ignoredClient, symbol: _ignoredSymbol, ...clientOverrides } = options
      const envSource =
        env ??
        (typeof process !== 'undefined'
          ? (process.env as Record<string, string | undefined>)
          : {})

      this.client = buildUnusualWhalesClient(envSource, clientOverrides)
    }
  }

  get configured(): boolean {
    return this.client.enabled
  }

  async generatePrediction(asofDate?: string): Promise<ComprehensivePrediction> {
    if (!this.configured) {
      throw new Error(
        'Unusual Whales credentials are not configured. Set UNUSUAL_WHALES_API_TOKEN.'
      )
    }

    const payload = await this.client.fetchEnhancedPrediction(
      this.symbol,
      asofDate
    )

    const currentPrice = this.extractPrice(payload)
    const timeframePayload: Record<string, any> =
      payload?.predictions ?? payload?.forecasts ?? {}

    const predictions: Partial<Record<TimeframeKey, TimeframePrediction>> = {}
    let strongest: TimeframeKey = '1m'
    let highestConfidence = -1

    for (const tf of TIMEFRAMES) {
      const mapped = this.buildTimeframePrediction(
        tf,
        timeframePayload[tf] ?? {},
        currentPrice,
        payload
      )
      predictions[tf] = mapped
      if (mapped.confidence > highestConfidence) {
        strongest = tf
        highestConfidence = mapped.confidence
      }
    }

    const strongestSignal =
      (payload?.strongestSignal?.timeframe as TimeframeKey | undefined) ??
      strongest
    const overallConfidence = this.extractOverallConfidence(
      payload,
      predictions
    )
    const kellySizing = this.extractOverallKelly(payload, predictions[strongestSignal]!)
    const criticalLevels = this.extractCriticalLevels(payload, currentPrice)
    const warnings = this.extractWarnings(payload, predictions)
    const marketRegime = this.extractMarketRegime(payload)
    const timestamp = this.extractTimestamp(payload)

    return {
      timestamp,
      currentPrice,
      predictions: predictions as Record<TimeframeKey, TimeframePrediction>,
      overallConfidence,
      strongestSignal,
      marketRegime,
      kellySizing,
      criticalLevels,
      warnings
    }
  }

  private extractTimestamp(payload: any): string {
    const raw = payload?.timestamp
    if (typeof raw === 'string') {
      return raw
    }
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      return new Date(raw).toISOString()
    }
    return new Date().toISOString()
  }

  private extractPrice(payload: any): number {
    const candidates = [
      payload?.currentPrice,
      payload?.spot,
      payload?.price,
      payload?.underlyingPrice,
      payload?.lastPrice
    ]

    for (const value of candidates) {
      if (typeof value === 'number' && Number.isFinite(value)) {
        return value
      }
    }

    return 0
  }

  private buildTimeframePrediction(
    timeframe: TimeframeKey,
    raw: any,
    currentPrice: number,
    payload: any
  ): TimeframePrediction {
    const price =
      typeof raw?.currentPrice === 'number' && Number.isFinite(raw.currentPrice)
        ? raw.currentPrice
        : currentPrice

    const confidence = this.extractConfidence(raw)
    const bias = this.deriveBias(raw)
    const direction = this.deriveDirection(bias, confidence)

    const targetPrice = this.extractTargetPrice(raw, price, bias)
    const stopLoss = this.extractStopLoss(raw, price, bias)
    const expectedMove = this.computeExpectedMove(price, targetPrice)
    const expectedReturn =
      expectedMove === 0
        ? 0
        : (expectedMove / 100) * (bias === 'bearish' ? -1 : bias === 'bullish' ? 1 : 0)
    const riskReward = this.computeRiskReward(price, targetPrice, stopLoss, bias)
    const kellySize = this.estimateKellySize(
      raw,
      confidence,
      riskReward,
      payload?.kellySizing ?? payload?.kelly_size
    )
    const reasons = this.extractReasons(raw, bias)
    const features = this.extractFeatures(raw)

    const timestampValue =
      typeof raw?.timestamp === 'string'
        ? Date.parse(raw.timestamp)
        : typeof raw?.timestamp === 'number'
        ? raw.timestamp
        : undefined

    return {
      timeframe,
      direction,
      bias,
      confidence,
      targetPrice,
      stopLoss,
      expectedMove,
      expectedReturn,
      riskReward,
      kellySize,
      reasons,
      features,
      timestamp: timestampValue && Number.isFinite(timestampValue)
        ? timestampValue
        : Date.now()
    }
  }

  private extractConfidence(raw: any): number {
    const candidates = [raw?.confidence, raw?.score, raw?.probability, raw?.strength]
    for (const value of candidates) {
      if (typeof value === 'number' && !Number.isNaN(value)) {
        if (value > 1) {
          return Math.min(1, value / 100)
        }
        if (value >= 0) {
          return Math.max(0, Math.min(1, value))
        }
      }
    }
    return 0.5
  }

  private deriveBias(raw: any): PredictionBias {
    const hint =
      (typeof raw?.bias === 'string' && raw.bias) ||
      (typeof raw?.direction === 'string' && raw.direction) ||
      (typeof raw?.side === 'string' && raw.side) ||
      (typeof raw?.signal === 'string' && raw.signal) ||
      (typeof raw?.regime === 'string' && raw.regime) ||
      ''

    const normalized = hint.toUpperCase()
    if (
      normalized.includes('BULL') ||
      normalized.includes('CALL') ||
      normalized.includes('UP') ||
      normalized.includes('LONG')
    ) {
      return 'bullish'
    }

    if (
      normalized.includes('BEAR') ||
      normalized.includes('PUT') ||
      normalized.includes('DOWN') ||
      normalized.includes('SHORT') ||
      normalized.includes('SELL')
    ) {
      return 'bearish'
    }

    return 'neutral'
  }

  private deriveDirection(
    bias: PredictionBias,
    confidence: number
  ): PredictionDirection {
    if (bias === 'bullish') {
      return confidence >= 0.75 ? 'STRONG_BUY' : 'BUY'
    }
    if (bias === 'bearish') {
      return confidence >= 0.75 ? 'STRONG_SELL' : 'SELL'
    }
    return 'NEUTRAL'
  }

  private extractTargetPrice(
    raw: any,
    price: number,
    bias: PredictionBias
  ): number {
    const candidates = [
      raw?.target,
      raw?.targetPrice,
      raw?.upperBound,
      raw?.cone_upper,
      raw?.priceTarget,
      raw?.takeProfit
    ]

    for (const value of candidates) {
      if (typeof value === 'number' && Number.isFinite(value)) {
        return value
      }
    }

    if (!Number.isFinite(price) || price <= 0) {
      return 0
    }

    const delta = price * 0.01
    if (bias === 'bullish') {
      return price + delta
    }
    if (bias === 'bearish') {
      return price - delta
    }
    return price
  }

  private extractStopLoss(
    raw: any,
    price: number,
    bias: PredictionBias
  ): number {
    const candidates = [
      raw?.stopLoss,
      raw?.stop_loss,
      raw?.lowerBound,
      raw?.cone_lower,
      raw?.stop,
      raw?.stop_price
    ]

    for (const value of candidates) {
      if (typeof value === 'number' && Number.isFinite(value)) {
        return value
      }
    }

    if (!Number.isFinite(price) || price <= 0) {
      return 0
    }

    const delta = price * 0.005
    if (bias === 'bullish') {
      return price - delta
    }
    if (bias === 'bearish') {
      return price + delta
    }
    return price
  }

  private computeExpectedMove(price: number, target: number): number {
    if (!Number.isFinite(price) || price === 0 || !Number.isFinite(target)) {
      return 0
    }

    return Math.abs((target - price) / price) * 100
  }

  private computeRiskReward(
    price: number,
    target: number,
    stop: number,
    bias: PredictionBias
  ): number {
    if (!Number.isFinite(price) || !Number.isFinite(target) || !Number.isFinite(stop)) {
      return 1
    }

    const reward = Math.abs(target - price)
    const risk = Math.abs(price - stop)

    if (risk === 0) {
      return 1
    }

    if (bias === 'neutral') {
      return 1
    }

    return Math.max(0.1, reward / risk)
  }

  private estimateKellySize(
    raw: any,
    confidence: number,
    riskReward: number,
    overallKelly?: number
  ): number {
    if (typeof raw?.kellySize === 'number' && Number.isFinite(raw.kellySize)) {
      return raw.kellySize
    }

    const base =
      typeof overallKelly === 'number' && Number.isFinite(overallKelly)
        ? overallKelly
        : 0.1

    const kelly = base * confidence * Math.max(0.5, Math.min(2, riskReward))
    return Math.min(0.25, Math.max(0, kelly))
  }

  private extractReasons(raw: any, bias: PredictionBias): string[] {
    const reasons: string[] = []
    if (Array.isArray(raw?.reasons)) {
      reasons.push(...raw.reasons.map((r: any) => String(r)))
    } else if (typeof raw?.reason === 'string') {
      reasons.push(raw.reason)
    } else if (typeof raw?.notes === 'string') {
      reasons.push(raw.notes)
    }

    if (reasons.length === 0 && bias !== 'neutral') {
      reasons.push(
        bias === 'bullish' ? 'Unusual Whales bullish signal' : 'Unusual Whales bearish signal'
      )
    }

    return reasons
  }

  private extractFeatures(raw: any): Record<string, unknown> {
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      if (raw.features && typeof raw.features === 'object') {
        return { ...raw.features }
      }

      const indicators: Record<string, unknown> = {}
      const candidateKeys = [
        'gex',
        'dix',
        'putCallRatio',
        'vanna',
        'momentumScore',
        'volatilityScore',
        'gammaFlip',
        'vix',
        'volume'
      ]

      for (const key of candidateKeys) {
        const value = raw[key]
        if (typeof value === 'number' && Number.isFinite(value)) {
          indicators[key] = value
        }
      }

      if (Object.keys(indicators).length > 0) {
        return indicators
      }
    }

    return {}
  }

  private extractOverallConfidence(
    payload: any,
    predictions: Partial<Record<TimeframeKey, TimeframePrediction>>
  ): number {
    const payloadConfidence = payload?.confidence?.overall
    if (typeof payloadConfidence === 'number' && !Number.isNaN(payloadConfidence)) {
      return Math.max(0, Math.min(1, payloadConfidence))
    }

    const confidences = Object.values(predictions)
      .filter((pred): pred is TimeframePrediction => Boolean(pred))
      .map(pred => pred.confidence)

    if (confidences.length === 0) {
      return 0.5
    }

    const avg = confidences.reduce((sum, value) => sum + value, 0) / confidences.length
    return Math.max(0, Math.min(1, avg))
  }

  private extractOverallKelly(
    payload: any,
    strongestPrediction: TimeframePrediction
  ): number {
    const payloadKelly = payload?.kellySizing ?? payload?.kelly_size
    if (typeof payloadKelly === 'number' && Number.isFinite(payloadKelly)) {
      return Math.max(0, Math.min(0.5, payloadKelly))
    }

    return Math.min(
      0.25,
      Math.max(0, strongestPrediction.confidence * strongestPrediction.riskReward * 0.1)
    )
  }

  private extractCriticalLevels(payload: any, price: number) {
    const defaults = {
      support: price ? [price * 0.995, price * 0.99] : [],
      resistance: price ? [price * 1.005, price * 1.01] : [],
      vwap: price || 0
    }

    if (!payload?.criticalLevels && !payload?.critical_levels) {
      return defaults
    }

    const levels = payload?.criticalLevels ?? payload?.critical_levels ?? {}
    return {
      support: Array.isArray(levels.support) ? levels.support : defaults.support,
      resistance: Array.isArray(levels.resistance) ? levels.resistance : defaults.resistance,
      vwap:
        typeof levels.vwap === 'number' && Number.isFinite(levels.vwap)
          ? levels.vwap
          : defaults.vwap
    }
  }

  private extractWarnings(
    payload: any,
    predictions: Partial<Record<TimeframeKey, TimeframePrediction>>
  ): string[] {
    const warnings: string[] = []

    if (Array.isArray(payload?.warnings)) {
      warnings.push(...payload.warnings.map((w: any) => String(w)))
    }

    const lowConfidence = Object.values(predictions)
      .filter((pred): pred is TimeframePrediction => Boolean(pred))
      .filter(pred => pred.confidence < 0.4)

    if (lowConfidence.length > 0) {
      warnings.push(
        `Low confidence on ${lowConfidence.length} timeframe${
          lowConfidence.length === 1 ? '' : 's'
        }`
      )
    }

    return warnings
  }

  private extractMarketRegime(payload: any): string {
    const candidates = [
      payload?.regime?.state,
      payload?.regime,
      payload?.marketRegime,
      payload?.market_regime
    ]

    for (const value of candidates) {
      if (typeof value === 'string' && value.trim().length > 0) {
        return value
      }
    }

    return 'UNKNOWN'
  }
}
