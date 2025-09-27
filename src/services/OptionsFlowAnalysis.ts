/**
 * Options Flow Analysis - DEX/GEX calculations and price magnets
 * Bolt-on feature for Hurricane SPY without breaking existing system
 */

export interface Contract {
  type: 'call' | 'put'
  strike: number
  expiry: string
  open_interest: number
  delta: number
  gamma: number
  vega?: number
  iv?: number
  bid?: number
  ask?: number
}

export interface FlowMetrics {
  strike: number
  dex: number  // Delta Exposure
  gex: number  // Gamma Exposure
  zscore?: {
    dex: number
    gex: number
  }
}

export interface PriceMagnet {
  strike: number
  type: 'attractor' | 'repellent'
  strength: number  // 0-1 normalized
  distance: number  // Distance from spot
}

export interface VolatilityZone {
  tf: string
  low: number
  high: number
  ivScale: number
}

export interface SupportResistance {
  level: number
  score: number
  type: 'options_wall' | 'swing' | 'volume_node' | 'technical'
  confluence: number
}

export interface OptionsFlowOutput {
  spot: number
  asof: Date
  dex: {
    by_strike: [number, number][]  // [strike, value]
    total: number
    zscore: number
  }
  gex: {
    by_strike: [number, number][]
    total: number
    zscore: number
    gamma_flip: number  // Zero gamma strike
  }
  magnets: PriceMagnet[]
  vol_zones: VolatilityZone[]
  levels: {
    support: SupportResistance[]
    resistance: SupportResistance[]
  }
  confidence: {
    data_quality: number  // 0-1 based on OI coverage
    chain_depth: number   // Number of strikes with meaningful OI
  }
}

/**
 * Main Options Flow Analyzer
 */
export class OptionsFlowAnalyzer {
  private readonly EQUITY_MULTIPLIER = 100
  private readonly MIN_OI_THRESHOLD = 10
  private readonly SMOOTHING_WINDOW = 2  // Strike smoothing
  private readonly MAX_MAGNETS = 6
  
  // Cache for performance
  private cache = new Map<string, { data: OptionsFlowOutput; timestamp: number }>()
  private readonly CACHE_TTL = 30000  // 30 seconds

  /**
   * Analyze options chain for DEX/GEX and flow metrics
   */
  async analyzeFlow(
    chain: Contract[],
    spot: number,
    asof: Date = new Date(),
    atrByTF?: Record<string, number>,
    technicalLevels?: { bb?: { upper: number; lower: number }; swings?: number[] }
  ): Promise<OptionsFlowOutput> {
    const cacheKey = `${spot}-${asof.getTime()}`
    const cached = this.cache.get(cacheKey)
    
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.data
    }

    // Sanitize chain
    const sanitized = this.sanitizeChain(chain)
    
    // Calculate DEX/GEX by strike
    const flowByStrike = this.aggregateDEXGEX(sanitized, spot)
    
    // Smooth the data
    const smoothed = this.smoothFlow(flowByStrike)
    
    // Find price magnets
    const magnets = this.findMagnets(smoothed, spot)
    
    // Calculate volatility zones
    const volZones = this.calculateVolZones(spot, atrByTF || {}, this.getIVPercentile(sanitized))
    
    // Find support/resistance levels
    const levels = this.findSupportResistance(smoothed, spot, technicalLevels)
    
    // Calculate z-scores
    const zscores = this.calculateZScores(smoothed)
    
    // Assess data quality
    const confidence = this.assessDataQuality(sanitized)
    
    // Find gamma flip point (zero gamma strike)
    const gammaFlip = this.findGammaFlip(smoothed)
    
    const result: OptionsFlowOutput = {
      spot,
      asof,
      dex: {
        by_strike: smoothed.map(f => [f.strike, f.dex]),
        total: smoothed.reduce((sum, f) => sum + f.dex, 0),
        zscore: zscores.dex
      },
      gex: {
        by_strike: smoothed.map(f => [f.strike, f.gex]),
        total: smoothed.reduce((sum, f) => sum + f.gex, 0),
        zscore: zscores.gex,
        gamma_flip: gammaFlip
      },
      magnets,
      vol_zones: volZones,
      levels,
      confidence
    }
    
    // Cache result
    this.cache.set(cacheKey, { data: result, timestamp: Date.now() })
    
    return result
  }

  /**
   * Sanitize options chain data
   */
  private sanitizeChain(chain: Contract[]): Contract[] {
    return chain.filter(c => {
      // Remove contracts with invalid data
      if (!c.open_interest || c.open_interest < this.MIN_OI_THRESHOLD) return false
      if (isNaN(c.delta) || isNaN(c.gamma)) return false
      if (Math.abs(c.delta) > 1) return false
      if (c.gamma < 0) return false
      
      // Optionally patch missing greeks with Black-Scholes if IV is available
      if (!c.delta && c.iv) {
        // Could implement BS calculation here
        return false
      }
      
      return true
    })
  }

  /**
   * Aggregate DEX and GEX by strike
   */
  private aggregateDEXGEX(chain: Contract[], spot: number): FlowMetrics[] {
    const byStrike = new Map<number, FlowMetrics>()
    
    for (const contract of chain) {
      const sign = contract.type === 'call' ? 1 : -1
      const dex = (contract.delta || 0) * (contract.open_interest || 0) * this.EQUITY_MULTIPLIER * sign
      const gex = (contract.gamma || 0) * (contract.open_interest || 0) * (spot ** 2) * this.EQUITY_MULTIPLIER * sign / 100
      
      const existing = byStrike.get(contract.strike) || { strike: contract.strike, dex: 0, gex: 0 }
      existing.dex += dex
      existing.gex += gex
      byStrike.set(contract.strike, existing)
    }
    
    // Convert to sorted array
    return Array.from(byStrike.values())
      .sort((a, b) => a.strike - b.strike)
  }

  /**
   * Smooth flow data using Gaussian kernel
   */
  private smoothFlow(flow: FlowMetrics[]): FlowMetrics[] {
    if (flow.length < 3) return flow
    
    const smoothed: FlowMetrics[] = []
    const sigma = this.SMOOTHING_WINDOW
    
    for (let i = 0; i < flow.length; i++) {
      let weightedDex = 0
      let weightedGex = 0
      let totalWeight = 0
      
      for (let j = 0; j < flow.length; j++) {
        const distance = Math.abs(i - j)
        const weight = Math.exp(-(distance ** 2) / (2 * sigma ** 2))
        
        weightedDex += flow[j].dex * weight
        weightedGex += flow[j].gex * weight
        totalWeight += weight
      }
      
      smoothed.push({
        strike: flow[i].strike,
        dex: weightedDex / totalWeight,
        gex: weightedGex / totalWeight
      })
    }
    
    return smoothed
  }

  /**
   * Find price magnets using curvature and extrema
   */
  private findMagnets(flow: FlowMetrics[], spot: number): PriceMagnet[] {
    const magnets: PriceMagnet[] = []
    
    for (let i = 1; i < flow.length - 1; i++) {
      const prev = flow[i - 1]
      const curr = flow[i]
      const next = flow[i + 1]
      
      // Calculate discrete curvature
      const d1 = curr.gex - prev.gex
      const d2 = next.gex - curr.gex
      const curvature = d2 - d1
      
      // Check for local extrema
      const isExtremum = Math.sign(d1) !== Math.sign(d2)
      
      if (isExtremum || Math.abs(curvature) > 1e8) {
        // Normalize strength (0-1)
        const strength = Math.min(1, Math.abs(curvature) / 1e9)
        
        // Negative GEX often acts as attractor (dealer hedging)
        const type: 'attractor' | 'repellent' = curr.gex < 0 ? 'attractor' : 'repellent'
        
        magnets.push({
          strike: curr.strike,
          type,
          strength,
          distance: Math.abs(curr.strike - spot) / spot
        })
      }
    }
    
    // Sort by strength and keep top N
    return magnets
      .sort((a, b) => b.strength - a.strength)
      .slice(0, this.MAX_MAGNETS)
  }

  /**
   * Calculate volatility zones
   */
  private calculateVolZones(
    spot: number,
    atrByTF: Record<string, number>,
    ivPercentile: number
  ): VolatilityZone[] {
    // Scale factor based on IV percentile (0.8 to 1.4)
    const ivScale = 0.8 + 0.6 * Math.max(0, Math.min(1, ivPercentile))
    
    const zones: VolatilityZone[] = []
    
    // Default TFs if not provided
    const timeframes = Object.keys(atrByTF).length > 0 ? Object.keys(atrByTF) : 
                      ['1m', '5m', '15m', '1h', '4h', '1d']
    
    for (const tf of timeframes) {
      const atr = atrByTF[tf] || this.getDefaultATR(tf, spot)
      const width = Math.max(atr, this.getATRFloor(tf, spot)) * ivScale
      
      zones.push({
        tf,
        low: spot - width,
        high: spot + width,
        ivScale
      })
    }
    
    return zones
  }

  /**
   * Find support and resistance levels
   */
  private findSupportResistance(
    flow: FlowMetrics[],
    spot: number,
    technicalLevels?: { bb?: { upper: number; lower: number }; swings?: number[] }
  ): { support: SupportResistance[]; resistance: SupportResistance[] } {
    const scored: (FlowMetrics & { score: number })[] = []
    
    // Calculate z-scores for scoring
    const gexValues = flow.map(f => f.gex)
    const dexValues = flow.map(f => f.dex)
    const gexMean = this.mean(gexValues)
    const gexStd = this.std(gexValues) || 1
    const dexMean = this.mean(dexValues)
    const dexStd = this.std(dexValues) || 1
    
    for (const f of flow) {
      const gexZ = Math.abs((f.gex - gexMean) / gexStd)
      const dexZ = Math.abs((f.dex - dexMean) / dexStd)
      
      // Check for technical confluence
      let technicalScore = 0
      if (technicalLevels?.bb) {
        if (f.strike >= technicalLevels.bb.lower && f.strike <= technicalLevels.bb.upper) {
          technicalScore += 0.2
        }
      }
      if (technicalLevels?.swings) {
        const nearSwing = technicalLevels.swings.some(s => Math.abs(s - f.strike) < spot * 0.005)
        if (nearSwing) technicalScore += 0.3
      }
      
      // Combined score (options walls weighted heavily)
      const score = 0.5 * gexZ + 0.2 * dexZ + technicalScore
      
      scored.push({ ...f, score })
    }
    
    // Find nearest support/resistance
    const below = scored.filter(s => s.strike <= spot).sort((a, b) => b.strike - a.strike)
    const above = scored.filter(s => s.strike >= spot).sort((a, b) => a.strike - b.strike)
    
    // Get top levels
    const support = below
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map(s => ({
        level: s.strike,
        score: Math.round(s.score * 100) / 100,
        type: 'options_wall' as const,
        confluence: s.score
      }))
    
    const resistance = above
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map(s => ({
        level: s.strike,
        score: Math.round(s.score * 100) / 100,
        type: 'options_wall' as const,
        confluence: s.score
      }))
    
    return { support, resistance }
  }

  /**
   * Calculate z-scores for DEX and GEX
   */
  private calculateZScores(flow: FlowMetrics[]): { dex: number; gex: number } {
    const dexValues = flow.map(f => f.dex)
    const gexValues = flow.map(f => f.gex)
    
    const dexTotal = dexValues.reduce((sum, v) => sum + v, 0)
    const gexTotal = gexValues.reduce((sum, v) => sum + v, 0)
    
    const dexMean = this.mean(dexValues)
    const gexMean = this.mean(gexValues)
    
    const dexStd = this.std(dexValues) || 1
    const gexStd = this.std(gexValues) || 1
    
    return {
      dex: (dexTotal - dexMean * dexValues.length) / (dexStd * Math.sqrt(dexValues.length)),
      gex: (gexTotal - gexMean * gexValues.length) / (gexStd * Math.sqrt(gexValues.length))
    }
  }

  /**
   * Find gamma flip point (zero gamma strike)
   */
  private findGammaFlip(flow: FlowMetrics[]): number {
    // Find where cumulative GEX crosses zero
    let cumGex = 0
    let prevStrike = 0
    
    for (const f of flow) {
      cumGex += f.gex
      
      if (prevStrike && cumGex > 0 && f.gex < 0) {
        // Linear interpolation for zero crossing
        const ratio = Math.abs(cumGex - f.gex) / (Math.abs(cumGex - f.gex) + Math.abs(cumGex))
        return prevStrike + (f.strike - prevStrike) * ratio
      }
      
      prevStrike = f.strike
    }
    
    // If no crossing found, return spot as default
    return flow[Math.floor(flow.length / 2)]?.strike || 0
  }

  /**
   * Assess data quality
   */
  private assessDataQuality(chain: Contract[]): { data_quality: number; chain_depth: number } {
    const strikesWithOI = new Set(chain.map(c => c.strike)).size
    const totalOI = chain.reduce((sum, c) => sum + (c.open_interest || 0), 0)
    
    // Quality based on OI coverage and strike depth
    const oiQuality = Math.min(1, totalOI / 100000)  // Normalize to typical SPY OI
    const depthQuality = Math.min(1, strikesWithOI / 50)  // 50 strikes is good coverage
    
    return {
      data_quality: (oiQuality + depthQuality) / 2,
      chain_depth: strikesWithOI
    }
  }

  /**
   * Get IV percentile from chain
   */
  private getIVPercentile(chain: Contract[]): number {
    const ivs = chain.map(c => c.iv).filter(iv => iv && iv > 0) as number[]
    if (ivs.length === 0) return 0.5
    
    // Simple percentile rank (could be enhanced with historical IV)
    const sorted = ivs.sort((a, b) => a - b)
    const median = sorted[Math.floor(sorted.length / 2)]
    
    // Map to percentile (simplified - would need historical data for true percentile)
    if (median < 10) return 0.1
    if (median < 15) return 0.3
    if (median < 20) return 0.5
    if (median < 25) return 0.7
    if (median < 30) return 0.85
    return 0.95
  }

  /**
   * Helper: Get default ATR for timeframe
   */
  private getDefaultATR(tf: string, spot: number): number {
    const defaults: Record<string, number> = {
      '1m': spot * 0.001,
      '5m': spot * 0.002,
      '15m': spot * 0.003,
      '30m': spot * 0.004,
      '1h': spot * 0.005,
      '4h': spot * 0.008,
      '1d': spot * 0.015
    }
    return defaults[tf] || spot * 0.005
  }

  /**
   * Helper: Get ATR floor for timeframe
   */
  private getATRFloor(tf: string, spot: number): number {
    const floors: Record<string, number> = {
      '1m': 0.0005,
      '5m': 0.001,
      '15m': 0.0015,
      '30m': 0.002,
      '1h': 0.0025,
      '4h': 0.004,
      '1d': 0.0075
    }
    return (floors[tf] || 0.0025) * spot
  }

  /**
   * Statistical helpers
   */
  private mean(values: number[]): number {
    if (values.length === 0) return 0
    return values.reduce((sum, v) => sum + v, 0) / values.length
  }

  private std(values: number[]): number {
    if (values.length < 2) return 0
    const m = this.mean(values)
    const variance = values.reduce((sum, v) => sum + Math.pow(v - m, 2), 0) / (values.length - 1)
    return Math.sqrt(variance)
  }
}

// Singleton instance
export const optionsFlowAnalyzer = new OptionsFlowAnalyzer()