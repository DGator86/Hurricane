/**
 * Prediction Health Monitoring - Per-timeframe health scoring
 * Auto-corrects confidence when predictions start lying
 */

export interface PredictionSample {
  z: number                    // Standardized residual
  realizedSigma: number        // Actual volatility
  predictedSigma: number       // Predicted volatility
  dirCorrect: boolean          // Directional accuracy
}

export interface CoverageHit {
  p50: boolean
  p80: boolean
  p95: boolean
}

export interface HealthMetrics {
  score: number               // 0-1 overall health
  n: number                   // Sample count
  p50Coverage: number         // Actual p50 coverage
  p80Coverage: number         // Actual p80 coverage
  p95Coverage: number         // Actual p95 coverage
  zMean: number              // Mean of standardized residuals
  zStd: number               // Std of standardized residuals
  dispersionError: number    // Log dispersion ratio error
  directionalAccuracy: number // Win rate
  calibrationError: number   // Overall calibration error
  sharpness: number         // Prediction sharpness (lower is sharper)
}

/**
 * Per-timeframe health tracker using Welford's online algorithm
 */
export class TFHealth {
  private n = 0
  private mZ = 0          // Mean z (Welford)
  private sZ = 0          // Sum of squares for variance
  private sumLogRhoAbs = 0
  private covP50 = 0
  private covP80 = 0
  private covP95 = 0
  private dirWins = 0
  
  // EWMA decay for faster adaptation
  private readonly DECAY = 0.99  // Half-life ~69 samples
  private readonly MIN_SAMPLES = 30  // Minimum samples for reliable health
  
  // Health parameters (tunable)
  private readonly ALPHA_COVERAGE = 2.0
  private readonly ALPHA_ZSCORE = 2.0
  private readonly ALPHA_DISPERSION = 2.0
  private readonly BETA_DIRECTION = 1.0
  
  /**
   * Add new prediction outcome sample
   */
  add(sample: PredictionSample, hit: CoverageHit): void {
    // Apply EWMA decay to existing stats
    if (this.n > 0 && this.DECAY < 1) {
      this.n *= this.DECAY
      this.covP50 *= this.DECAY
      this.covP80 *= this.DECAY
      this.covP95 *= this.DECAY
      this.dirWins *= this.DECAY
      this.sumLogRhoAbs *= this.DECAY
    }
    
    this.n++
    
    // Update coverage
    this.covP50 += hit.p50 ? 1 : 0
    this.covP80 += hit.p80 ? 1 : 0
    this.covP95 += hit.p95 ? 1 : 0
    
    // Update z statistics (Welford's method)
    const prevM = this.mZ
    this.mZ += (sample.z - this.mZ) / this.n
    this.sZ += (sample.z - prevM) * (sample.z - this.mZ)
    
    // Update dispersion ratio
    const rho = Math.max(1e-9, sample.realizedSigma) / Math.max(1e-9, sample.predictedSigma)
    this.sumLogRhoAbs += Math.abs(Math.log(rho))
    
    // Update directional accuracy
    this.dirWins += sample.dirCorrect ? 1 : 0
  }
  
  /**
   * Calculate health score (0-1)
   */
  healthScore(): number {
    if (this.n < this.MIN_SAMPLES) {
      return 0.6  // Warm-up floor
    }
    
    const metrics = this.getMetrics()
    
    // Coverage error (want p80 ≈ 0.80)
    const E80 = Math.abs(metrics.p80Coverage - 0.80)
    const termCal = Math.exp(-this.ALPHA_COVERAGE * E80)
    
    // Z-score sanity (want mean≈0, std≈1)
    const zError = Math.abs(metrics.zMean) + Math.abs(metrics.zStd - 1)
    const termZ = Math.exp(-this.ALPHA_ZSCORE * zError)
    
    // Dispersion error
    const termDisp = Math.exp(-this.ALPHA_DISPERSION * metrics.dispersionError)
    
    // Directional skill (>0.5 is edge)
    const termDir = Math.max(0, Math.min(1, 0.5 + this.BETA_DIRECTION * (metrics.directionalAccuracy - 0.5)))
    
    // Combined health
    const H = termCal * termZ * termDisp * termDir
    
    return Math.max(0, Math.min(1, H))
  }
  
  /**
   * Get detailed metrics
   */
  getMetrics(): HealthMetrics {
    const score = this.healthScore()
    
    if (this.n < 1) {
      return {
        score: 0.6,
        n: 0,
        p50Coverage: 0.5,
        p80Coverage: 0.8,
        p95Coverage: 0.95,
        zMean: 0,
        zStd: 1,
        dispersionError: 0,
        directionalAccuracy: 0.5,
        calibrationError: 0,
        sharpness: 1
      }
    }
    
    const p50 = this.covP50 / this.n
    const p80 = this.covP80 / this.n
    const p95 = this.covP95 / this.n
    
    const muZ = this.mZ
    const varZ = this.n > 1 ? this.sZ / (this.n - 1) : 1
    const sZ = Math.sqrt(Math.max(1e-9, varZ))
    
    const dispError = this.sumLogRhoAbs / this.n
    const dirAcc = this.dirWins / this.n
    
    // Calibration error (weighted sum of coverage errors)
    const calError = 0.2 * Math.abs(p50 - 0.50) + 
                     0.5 * Math.abs(p80 - 0.80) + 
                     0.3 * Math.abs(p95 - 0.95)
    
    // Sharpness (lower is better - tighter predictions)
    const sharpness = sZ  // Could enhance with cone width analysis
    
    return {
      score,
      n: Math.floor(this.n),
      p50Coverage: Math.round(p50 * 1000) / 1000,
      p80Coverage: Math.round(p80 * 1000) / 1000,
      p95Coverage: Math.round(p95 * 1000) / 1000,
      zMean: Math.round(muZ * 1000) / 1000,
      zStd: Math.round(sZ * 1000) / 1000,
      dispersionError: Math.round(dispError * 1000) / 1000,
      directionalAccuracy: Math.round(dirAcc * 1000) / 1000,
      calibrationError: Math.round(calError * 1000) / 1000,
      sharpness: Math.round(sharpness * 1000) / 1000
    }
  }
  
  /**
   * Serialize for persistence
   */
  serialize(): any {
    return {
      n: this.n,
      mZ: this.mZ,
      sZ: this.sZ,
      sumLogRhoAbs: this.sumLogRhoAbs,
      covP50: this.covP50,
      covP80: this.covP80,
      covP95: this.covP95,
      dirWins: this.dirWins
    }
  }
  
  /**
   * Deserialize from persistence
   */
  static from(data: any): TFHealth {
    const health = new TFHealth()
    Object.assign(health, data)
    return health
  }
}

/**
 * Health manager for all timeframes
 */
export class PredictionHealthManager {
  private healthByTF: Map<string, TFHealth> = new Map()
  private readonly TIMEFRAMES = ['1m', '5m', '15m', '30m', '1h', '4h', '1d']
  
  constructor() {
    // Initialize health trackers for each timeframe
    for (const tf of this.TIMEFRAMES) {
      this.healthByTF.set(tf, new TFHealth())
    }
  }
  
  /**
   * Update health for a timeframe when outcome is known
   */
  updateHealth(
    tf: string,
    predicted: {
      median: number
      p50: [number, number]
      p80: [number, number]
      p95: [number, number]
      sigma?: number
    },
    realized: {
      nextClose: number
      realizedSigma: number
    },
    trade: {
      side: 'CALL' | 'PUT' | 'NONE'
      entry: number
    }
  ): void {
    const health = this.healthByTF.get(tf)
    if (!health) return
    
    // Calculate residual and standardized residual
    const r = realized.nextClose - predicted.median
    const sigmaHat = predicted.sigma ?? ((predicted.p80[1] - predicted.p80[0]) / (2 * 0.8416))
    const z = r / Math.max(1e-9, sigmaHat)
    
    // Clip pathological z to prevent poisoning
    const zClipped = Math.max(-6, Math.min(6, z))
    
    // Check coverage hits
    const hit: CoverageHit = {
      p50: realized.nextClose >= predicted.p50[0] && realized.nextClose <= predicted.p50[1],
      p80: realized.nextClose >= predicted.p80[0] && realized.nextClose <= predicted.p80[1],
      p95: realized.nextClose >= predicted.p95[0] && realized.nextClose <= predicted.p95[1]
    }
    
    // Check directional accuracy
    const dirCorrect = trade.side === 'CALL' ? 
                       (realized.nextClose > trade.entry) :
                       trade.side === 'PUT' ? 
                       (realized.nextClose < trade.entry) : 
                       false
    
    // Add sample to health tracker
    health.add(
      {
        z: zClipped,
        realizedSigma: Math.max(1e-9, realized.realizedSigma),
        predictedSigma: Math.max(1e-9, sigmaHat),
        dirCorrect
      },
      hit
    )
  }
  
  /**
   * Apply health adjustment to confidence
   */
  adjustConfidence(tf: string, baseConfidence: number): number {
    const health = this.healthByTF.get(tf)
    if (!health) return baseConfidence
    
    const H = health.healthScore()
    
    // Bounded influence: never kill confidence completely
    // But poor health can reduce it significantly
    const adjustedConfidence = baseConfidence * (0.6 + 0.4 * H)
    
    return Math.max(0.1, Math.min(0.95, adjustedConfidence))
  }
  
  /**
   * Get health metrics for all timeframes
   */
  getAllMetrics(): Record<string, HealthMetrics> {
    const metrics: Record<string, HealthMetrics> = {}
    
    for (const [tf, health] of this.healthByTF) {
      metrics[tf] = health.getMetrics()
    }
    
    return metrics
  }
  
  /**
   * Get health score for a specific timeframe
   */
  getHealthScore(tf: string): number {
    const health = this.healthByTF.get(tf)
    return health ? health.healthScore() : 0.6
  }
  
  /**
   * Check if a timeframe is healthy enough to trade
   */
  isHealthy(tf: string, threshold: number = 0.5): boolean {
    return this.getHealthScore(tf) >= threshold
  }
  
  /**
   * Serialize all health data for persistence
   */
  serialize(): Record<string, any> {
    const data: Record<string, any> = {}
    
    for (const [tf, health] of this.healthByTF) {
      data[tf] = health.serialize()
    }
    
    return data
  }
  
  /**
   * Load health data from persistence
   */
  load(data: Record<string, any>): void {
    for (const [tf, healthData] of Object.entries(data)) {
      if (this.healthByTF.has(tf)) {
        this.healthByTF.set(tf, TFHealth.from(healthData))
      }
    }
  }
  
  /**
   * Get warning messages for unhealthy timeframes
   */
  getWarnings(): string[] {
    const warnings: string[] = []
    
    for (const [tf, health] of this.healthByTF) {
      const metrics = health.getMetrics()
      
      if (metrics.score < 0.5 && metrics.n >= 30) {
        warnings.push(`${tf}: Health degraded (${(metrics.score * 100).toFixed(0)}%)`)
      }
      
      if (Math.abs(metrics.p80Coverage - 0.80) > 0.15 && metrics.n >= 30) {
        warnings.push(`${tf}: P80 calibration off (${(metrics.p80Coverage * 100).toFixed(0)}% vs 80%)`)
      }
      
      if (metrics.directionalAccuracy < 0.45 && metrics.n >= 30) {
        warnings.push(`${tf}: Poor directional accuracy (${(metrics.directionalAccuracy * 100).toFixed(0)}%)`)
      }
      
      if (Math.abs(metrics.zMean) > 0.5 || Math.abs(metrics.zStd - 1) > 0.5) {
        warnings.push(`${tf}: Residuals not normal (μ=${metrics.zMean.toFixed(2)}, σ=${metrics.zStd.toFixed(2)})`)
      }
    }
    
    return warnings
  }
}

// Singleton instance
export const predictionHealthManager = new PredictionHealthManager()