/**
 * Health checks to catch pipeline bugs immediately
 * Prevents "copy-paste with vibes" syndrome
 */

export interface HealthCheckResult {
  passed: boolean
  message: string
  severity: 'info' | 'warning' | 'error' | 'critical'
  data?: any
}

export class PredictionHealthChecker {
  private recentPredictions: any[] = []
  private readonly maxHistory = 100
  
  /**
   * Check if all timeframes have identical predictions (pipeline bug)
   */
  checkTimeframeCollapse(predictions: Record<string, any>): HealthCheckResult {
    const timeframes = Object.keys(predictions)
    if (timeframes.length < 2) {
      return {
        passed: true,
        message: 'Not enough timeframes to check',
        severity: 'info'
      }
    }
    
    // Create fingerprints for each prediction
    const fingerprints = new Set()
    
    for (const tf of timeframes) {
      const pred = predictions[tf]
      // Create a fingerprint from key metrics
      const fingerprint = JSON.stringify({
        direction: pred.direction,
        confidence: Math.round(pred.confidence * 1000),
        expectedMove: Math.round(pred.expectedMove * 1000),
        rsi: Math.round(pred.features?.rsi14 || 0),
        macd: Math.round(pred.features?.macd * 1000 || 0)
      })
      fingerprints.add(fingerprint)
    }
    
    // If all fingerprints are identical, we have a problem
    if (fingerprints.size === 1) {
      return {
        passed: false,
        message: `CRITICAL: All ${timeframes.length} timeframes have identical predictions - pipeline bug detected!`,
        severity: 'critical',
        data: { timeframes, uniqueFingerprints: 1 }
      }
    }
    
    // Warn if too similar
    const similarityRatio = fingerprints.size / timeframes.length
    if (similarityRatio < 0.5) {
      return {
        passed: false,
        message: `WARNING: Only ${fingerprints.size} unique predictions across ${timeframes.length} timeframes`,
        severity: 'warning',
        data: { timeframes, uniqueFingerprints: fingerprints.size, similarityRatio }
      }
    }
    
    return {
      passed: true,
      message: `Timeframe diversity OK: ${fingerprints.size} unique predictions across ${timeframes.length} timeframes`,
      severity: 'info'
    }
  }
  
  /**
   * Check for unidirectional bias (100% bullish or bearish)
   */
  checkDirectionalBias(predictions: Record<string, any>): HealthCheckResult {
    const directions = Object.values(predictions).map(p => p.direction)
    
    const bullish = directions.filter(d => d === 'BUY' || d === 'STRONG_BUY').length
    const bearish = directions.filter(d => d === 'SELL' || d === 'STRONG_SELL').length
    const neutral = directions.filter(d => d === 'NEUTRAL').length
    const total = directions.length
    
    if (total === 0) {
      return {
        passed: true,
        message: 'No predictions to check',
        severity: 'info'
      }
    }
    
    const bullishPct = bullish / total
    const bearishPct = bearish / total
    const neutralPct = neutral / total
    
    // Critical: 100% one direction
    if (bullishPct === 1 || bearishPct === 1) {
      return {
        passed: false,
        message: `CRITICAL: 100% ${bullishPct === 1 ? 'BULLISH' : 'BEARISH'} bias detected!`,
        severity: 'critical',
        data: { bullish, bearish, neutral, total }
      }
    }
    
    // Warning: >80% one direction
    if (bullishPct > 0.8 || bearishPct > 0.8) {
      return {
        passed: false,
        message: `WARNING: Strong ${bullishPct > 0.8 ? 'BULLISH' : 'BEARISH'} bias (${Math.max(bullishPct, bearishPct) * 100}%)`,
        severity: 'warning',
        data: { bullish, bearish, neutral, total }
      }
    }
    
    // Warning: >60% neutral
    if (neutralPct > 0.6) {
      return {
        passed: false,
        message: `WARNING: Too many NEUTRAL signals (${neutralPct * 100}%)`,
        severity: 'warning',
        data: { bullish, bearish, neutral, total }
      }
    }
    
    return {
      passed: true,
      message: `Directional balance OK: ${bullish}B/${bearish}S/${neutral}N`,
      severity: 'info'
    }
  }
  
  /**
   * Check feature variance (detect stale/stuck data)
   */
  checkFeatureVariance(predictions: Record<string, any>): HealthCheckResult {
    const features: Record<string, number[]> = {}
    
    // Collect features across timeframes
    for (const pred of Object.values(predictions)) {
      if (!pred.features) continue
      
      for (const [key, value] of Object.entries(pred.features)) {
        if (typeof value === 'number') {
          if (!features[key]) features[key] = []
          features[key].push(value)
        }
      }
    }
    
    // Check variance for each feature
    const lowVarianceFeatures: string[] = []
    const stuckFeatures: string[] = []
    
    for (const [feature, values] of Object.entries(features)) {
      if (values.length < 2) continue
      
      const mean = values.reduce((a, b) => a + b, 0) / values.length
      const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length
      const std = Math.sqrt(variance)
      const cv = mean !== 0 ? std / Math.abs(mean) : 0  // Coefficient of variation
      
      // Check if all values are identical (stuck)
      if (new Set(values.map(v => v.toFixed(6))).size === 1) {
        stuckFeatures.push(feature)
      }
      // Check if variance is too low (relative to mean)
      else if (cv < 0.01 && feature !== 'momentum_score') {  // Some features naturally have low variance
        lowVarianceFeatures.push(feature)
      }
    }
    
    if (stuckFeatures.length > 0) {
      return {
        passed: false,
        message: `CRITICAL: Features stuck with no variance: ${stuckFeatures.join(', ')}`,
        severity: 'critical',
        data: { stuckFeatures }
      }
    }
    
    if (lowVarianceFeatures.length > 3) {
      return {
        passed: false,
        message: `WARNING: Multiple features with low variance: ${lowVarianceFeatures.join(', ')}`,
        severity: 'warning',
        data: { lowVarianceFeatures }
      }
    }
    
    return {
      passed: true,
      message: 'Feature variance within normal range',
      severity: 'info'
    }
  }
  
  /**
   * Check historical bias over time
   */
  checkHistoricalBias(): HealthCheckResult {
    if (this.recentPredictions.length < 20) {
      return {
        passed: true,
        message: `Need more history (${this.recentPredictions.length}/20)`,
        severity: 'info'
      }
    }
    
    const recentDirections = this.recentPredictions.slice(-50).map(p => {
      const dirs = Object.values(p.predictions || {}).map((pred: any) => pred.direction)
      const bullish = dirs.filter(d => d === 'BUY' || d === 'STRONG_BUY').length
      const bearish = dirs.filter(d => d === 'SELL' || d === 'STRONG_SELL').length
      return bullish > bearish ? 'BULL' : bearish > bullish ? 'BEAR' : 'NEUTRAL'
    })
    
    const bullCount = recentDirections.filter(d => d === 'BULL').length
    const bearCount = recentDirections.filter(d => d === 'BEAR').length
    const total = recentDirections.length
    
    const bullPct = bullCount / total
    const bearPct = bearCount / total
    
    if (bullPct > 0.8 || bearPct > 0.8) {
      return {
        passed: false,
        message: `WARNING: Historical bias detected - ${Math.max(bullPct, bearPct) * 100}% ${bullPct > bearPct ? 'BULLISH' : 'BEARISH'} over last ${total} predictions`,
        severity: 'warning',
        data: { bullCount, bearCount, total }
      }
    }
    
    return {
      passed: true,
      message: `Historical balance OK: ${bullCount}B/${bearCount}S over last ${total}`,
      severity: 'info'
    }
  }
  
  /**
   * Check confidence calibration
   */
  checkConfidenceCalibration(predictions: Record<string, any>): HealthCheckResult {
    const confidences = Object.values(predictions).map(p => p.confidence).filter(c => c !== undefined)
    
    if (confidences.length === 0) {
      return {
        passed: true,
        message: 'No confidence values to check',
        severity: 'info'
      }
    }
    
    const avgConfidence = confidences.reduce((a, b) => a + b, 0) / confidences.length
    const allSame = new Set(confidences.map(c => c.toFixed(3))).size === 1
    
    if (allSame) {
      return {
        passed: false,
        message: 'CRITICAL: All timeframes have identical confidence - calculation bug!',
        severity: 'critical',
        data: { confidence: confidences[0] }
      }
    }
    
    if (avgConfidence > 0.9) {
      return {
        passed: false,
        message: `WARNING: Overconfident predictions (avg ${(avgConfidence * 100).toFixed(1)}%)`,
        severity: 'warning'
      }
    }
    
    if (avgConfidence < 0.2) {
      return {
        passed: false,
        message: `WARNING: Underconfident predictions (avg ${(avgConfidence * 100).toFixed(1)}%)`,
        severity: 'warning'
      }
    }
    
    return {
      passed: true,
      message: `Confidence levels OK: ${(avgConfidence * 100).toFixed(1)}% average`,
      severity: 'info'
    }
  }
  
  /**
   * Run all health checks
   */
  runFullHealthCheck(predictions: Record<string, any>): {
    overall: boolean
    checks: HealthCheckResult[]
    summary: string
  } {
    // Store for historical analysis
    this.recentPredictions.push({ timestamp: Date.now(), predictions })
    if (this.recentPredictions.length > this.maxHistory) {
      this.recentPredictions.shift()
    }
    
    const checks: HealthCheckResult[] = [
      this.checkTimeframeCollapse(predictions),
      this.checkDirectionalBias(predictions),
      this.checkFeatureVariance(predictions),
      this.checkConfidenceCalibration(predictions),
      this.checkHistoricalBias()
    ]
    
    const critical = checks.filter(c => c.severity === 'critical')
    const warnings = checks.filter(c => c.severity === 'warning')
    const passed = critical.length === 0
    
    let summary = ''
    if (!passed) {
      summary = `❌ FAILED: ${critical.length} critical issues, ${warnings.length} warnings`
    } else if (warnings.length > 0) {
      summary = `⚠️  PASSED with ${warnings.length} warnings`
    } else {
      summary = '✅ All health checks passed'
    }
    
    return {
      overall: passed,
      checks,
      summary
    }
  }
  
  /**
   * Get health status as HTML for dashboard
   */
  getHealthStatusHTML(predictions: Record<string, any>): string {
    const result = this.runFullHealthCheck(predictions)
    
    const criticalIssues = result.checks.filter(c => c.severity === 'critical')
    const warnings = result.checks.filter(c => c.severity === 'warning')
    
    let html = '<div class="health-status">'
    
    if (criticalIssues.length > 0) {
      html += '<div class="alert alert-danger">'
      html += '<strong>🚨 CRITICAL ISSUES DETECTED:</strong><ul>'
      criticalIssues.forEach(issue => {
        html += `<li>${issue.message}</li>`
      })
      html += '</ul></div>'
    }
    
    if (warnings.length > 0) {
      html += '<div class="alert alert-warning">'
      html += '<strong>⚠️ Warnings:</strong><ul>'
      warnings.forEach(warning => {
        html += `<li>${warning.message}</li>`
      })
      html += '</ul></div>'
    }
    
    if (criticalIssues.length === 0 && warnings.length === 0) {
      html += '<div class="alert alert-success">'
      html += '✅ All systems operational'
      html += '</div>'
    }
    
    html += '</div>'
    
    return html
  }
}

// Singleton instance
export const healthChecker = new PredictionHealthChecker()