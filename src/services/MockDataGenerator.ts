/**
 * Mock Data Generator for Hurricane SPY System
 * Provides realistic data for testing without live APIs
 */

export class MockDataGenerator {
  /**
   * Generate mock options chain
   */
  static generateOptionsChain(spot: number = 505): any[] {
    const chain = []
    const strikes = []
    
    // Generate strikes around spot
    for (let strike = Math.floor(spot * 0.9); strike <= Math.ceil(spot * 1.1); strike += 1) {
      strikes.push(strike)
    }
    
    // Create options for each strike
    for (const strike of strikes) {
      const moneyness = (strike - spot) / spot
      const otm = Math.abs(moneyness)
      
      // Calls
      chain.push({
        type: 'call',
        strike,
        expiry: '2024-01-19',
        open_interest: Math.max(10, Math.floor(5000 * Math.exp(-otm * 20))),
        delta: Math.max(0.01, Math.min(0.99, 0.5 + moneyness * 2)),
        gamma: Math.max(0, 0.05 * Math.exp(-Math.pow(moneyness * 10, 2))),
        iv: 0.15 + otm * 0.3,
        bid: Math.max(0, spot - strike + 2),
        ask: Math.max(0, spot - strike + 2.5)
      })
      
      // Puts
      chain.push({
        type: 'put',
        strike,
        expiry: '2024-01-19',
        open_interest: Math.max(10, Math.floor(4000 * Math.exp(-otm * 20))),
        delta: -Math.max(0.01, Math.min(0.99, 0.5 - moneyness * 2)),
        gamma: Math.max(0, 0.05 * Math.exp(-Math.pow(moneyness * 10, 2))),
        iv: 0.15 + otm * 0.3,
        bid: Math.max(0, strike - spot + 2),
        ask: Math.max(0, strike - spot + 2.5)
      })
    }
    
    return chain
  }
  
  /**
   * Generate Hurricane predictions for all timeframes
   */
  static generatePredictions(spot: number = 505): any {
    const timeframes = ['1m', '5m', '15m', '30m', '1h', '4h', '1d']
    const perTF: any[] = []
    
    for (const tf of timeframes) {
      const bias = Math.random() > 0.5 ? 1 : -1
      const confidence = 0.5 + Math.random() * 0.4  // 50-90%
      const atr = this.getATRForTimeframe(tf, spot)
      
      perTF.push({
        tf,
        side: bias > 0 ? 'CALL' : 'PUT',
        confidence,
        regime: this.getRandomRegime(),
        signal: bias * (0.3 + Math.random() * 0.7),
        entryPx: spot,
        targets: {
          target: spot + bias * atr * this.getMultiplier(tf)
        },
        stop: spot - bias * atr,
        size: Math.min(0.25, confidence * 0.3),  // Kelly sizing
        rMultiple: {
          reward: atr * this.getMultiplier(tf),
          risk: atr,
          rr: this.getMultiplier(tf)
        },
        option: {
          strike: Math.round(spot + bias * 2),
          dte: tf === '1m' || tf === '5m' ? 0 : 1
        }
      })
    }
    
    // Add some high confidence trades
    const highConfidenceIndices = [2, 4]  // 15m and 1h
    highConfidenceIndices.forEach(i => {
      if (perTF[i]) {
        perTF[i].confidence = 0.75 + Math.random() * 0.2  // 75-95%
      }
    })
    
    return {
      symbol: 'SPY',
      asof: new Date().toISOString(),
      perTF,
      final: {
        side: perTF[3].side,  // Use 30m as final
        confidence: perTF[3].confidence,
        shouldTrade: perTF[3].confidence > 0.75
      },
      health: {
        overall: true,
        summary: '✅ All systems operational',
        checks: []
      }
    }
  }
  
  /**
   * Generate market regime data
   */
  static generateRegimeData(spot: number = 505): any {
    return {
      regime: this.getRandomRegime(),
      volatility: 15 + Math.random() * 10,
      trend: Math.random() > 0.5 ? 'Bullish' : 'Bearish',
      sentiment: Math.random() > 0.3 ? 'Neutral' : Math.random() > 0.5 ? 'Bullish' : 'Bearish',
      vix: 15 + Math.random() * 10,
      spy: spot,
      indicators: {
        rsi: 30 + Math.random() * 40,
        macd: (Math.random() - 0.5) * 0.5,
        atr: 2 + Math.random() * 3,
        volumeRatio: 0.8 + Math.random() * 0.6,
        adx: 20 + Math.random() * 30
      }
    }
  }
  
  /**
   * Generate health metrics
   */
  static generateHealthMetrics(): any {
    const timeframes = ['1m', '5m', '15m', '30m', '1h', '4h', '1d']
    const metrics: any = {}
    
    for (const tf of timeframes) {
      const score = 0.5 + Math.random() * 0.4  // 50-90% health
      metrics[tf] = {
        score,
        n: 50 + Math.floor(Math.random() * 200),
        p50Coverage: 0.45 + Math.random() * 0.1,
        p80Coverage: 0.75 + Math.random() * 0.1,
        p95Coverage: 0.92 + Math.random() * 0.06,
        zMean: (Math.random() - 0.5) * 0.3,
        zStd: 0.9 + Math.random() * 0.2,
        dispersionError: Math.random() * 0.2,
        directionalAccuracy: 0.45 + Math.random() * 0.2,
        calibrationError: Math.random() * 0.15,
        sharpness: 0.8 + Math.random() * 0.4
      }
    }
    
    return metrics
  }
  
  /**
   * Generate flow analysis with DEX/GEX
   */
  static generateFlowAnalysis(spot: number = 505): any {
    const chain = this.generateOptionsChain(spot)
    
    // Calculate mock DEX/GEX
    const flowByStrike: any[] = []
    const strikes = [...new Set(chain.map(c => c.strike))].sort((a, b) => a - b)
    
    for (const strike of strikes) {
      const contracts = chain.filter(c => c.strike === strike)
      let dex = 0
      let gex = 0
      
      for (const c of contracts) {
        const sign = c.type === 'call' ? 1 : -1
        dex += c.delta * c.open_interest * 100 * sign
        gex += c.gamma * c.open_interest * (spot ** 2) * 100 * sign / 100
      }
      
      flowByStrike.push([strike, dex, gex])
    }
    
    // Find magnets (peaks in GEX)
    const magnets: any[] = []
    for (let i = 1; i < flowByStrike.length - 1; i++) {
      const prev = flowByStrike[i - 1][2]
      const curr = flowByStrike[i][2]
      const next = flowByStrike[i + 1][2]
      
      if (Math.abs(curr) > Math.abs(prev) && Math.abs(curr) > Math.abs(next)) {
        magnets.push({
          strike: flowByStrike[i][0],
          type: curr < 0 ? 'attractor' : 'repellent',
          strength: Math.min(1, Math.abs(curr) / 1e9),
          distance: Math.abs(flowByStrike[i][0] - spot) / spot
        })
      }
    }
    
    // Sort and limit magnets
    magnets.sort((a, b) => b.strength - a.strength)
    
    return {
      spot,
      asof: new Date(),
      dex: {
        by_strike: flowByStrike.map(f => [f[0], f[1]]),
        total: flowByStrike.reduce((sum, f) => sum + f[1], 0),
        zscore: (Math.random() - 0.5) * 2
      },
      gex: {
        by_strike: flowByStrike.map(f => [f[0], f[2]]),
        total: flowByStrike.reduce((sum, f) => sum + f[2], 0),
        zscore: (Math.random() - 0.5) * 2,
        gamma_flip: spot + (Math.random() - 0.5) * 5
      },
      magnets: magnets.slice(0, 6),
      vol_zones: this.generateVolZones(spot),
      levels: {
        support: [
          { level: spot - 3, score: 0.8, type: 'options_wall', confluence: 0.8 },
          { level: spot - 5, score: 0.7, type: 'swing', confluence: 0.7 }
        ],
        resistance: [
          { level: spot + 2, score: 0.85, type: 'options_wall', confluence: 0.85 },
          { level: spot + 4, score: 0.75, type: 'technical', confluence: 0.75 }
        ]
      },
      confidence: {
        data_quality: 0.8,
        chain_depth: strikes.length
      }
    }
  }
  
  /**
   * Generate volatility zones
   */
  static generateVolZones(spot: number): any[] {
    const timeframes = ['1m', '5m', '15m', '30m', '1h', '4h', '1d']
    const zones: any[] = []
    
    for (const tf of timeframes) {
      const width = this.getATRForTimeframe(tf, spot)
      zones.push({
        tf,
        low: spot - width,
        high: spot + width,
        ivScale: 1 + Math.random() * 0.4
      })
    }
    
    return zones
  }
  
  /**
   * Helper: Get ATR for timeframe
   */
  private static getATRForTimeframe(tf: string, spot: number): number {
    const multipliers: any = {
      '1m': 0.001,
      '5m': 0.002,
      '15m': 0.003,
      '30m': 0.004,
      '1h': 0.005,
      '4h': 0.008,
      '1d': 0.015
    }
    return spot * (multipliers[tf] || 0.005)
  }
  
  /**
   * Helper: Get multiplier for timeframe
   */
  private static getMultiplier(tf: string): number {
    const multipliers: any = {
      '1m': 1.5,
      '5m': 2.0,
      '15m': 2.5,
      '30m': 3.0,
      '1h': 3.5,
      '4h': 4.0,
      '1d': 5.0
    }
    return multipliers[tf] || 2.5
  }
  
  /**
   * Helper: Get random regime
   */
  private static getRandomRegime(): string {
    const regimes = ['Trend', 'Range', 'VolExp', 'Flux']
    return regimes[Math.floor(Math.random() * regimes.length)]
  }
}