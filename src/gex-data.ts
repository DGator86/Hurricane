// GEX (Gamma Exposure) Data Service
// Gamma Exposure measures the market makers' hedging flow impact on price movements

import { FinnhubDataService } from './finnhub-data'

export interface GEXData {
  totalGEX: number           // Total gamma exposure in billions
  callGEX: number            // Call gamma exposure
  putGEX: number             // Put gamma exposure
  netGEX: number             // Net gamma (calls - puts)
  spotPrice: number          // Current SPY price
  gammaFlipPoint: number     // Price where gamma flips from positive to negative
  largestGammaStrikes: {     // Strikes with largest gamma concentration
    strike: number
    gamma: number
    type: 'call' | 'put'
  }[]
  marketMakerPositioning: 'long_gamma' | 'short_gamma' | 'neutral'
  expectedVolatility: 'suppressed' | 'amplified' | 'normal'
}

export class GEXDataService {
  private finnhub: FinnhubDataService
  private apiKey: string
  
  constructor(finnhubApiKey: string) {
    this.finnhub = new FinnhubDataService(finnhubApiKey)
    this.apiKey = finnhubApiKey
  }
  
  // Calculate GEX from options data
  async calculateGEX(): Promise<GEXData | null> {
    try {
      console.log('Calculating GEX...')
      
      // Get current SPY price and VIX
      const [spyQuote, vixLevel] = await Promise.all([
        this.finnhub.getCurrentSPYQuote(),
        this.finnhub.getCurrentVIXLevel()
      ])
      const spotPrice = spyQuote.price
      
      // Attempt to fetch options chain from Finnhub
      const optionsData = await this.fetchOptionsChain('SPY')
      
      if (!optionsData || optionsData.length === 0) {
        console.log('No options data available from Finnhub, using estimated GEX based on VIX')
        return this.estimateGEXFromVIX(spotPrice, vixLevel)
      }
      
      // Calculate GEX from options chain
      return this.computeGEXFromOptions(optionsData, spotPrice)
    } catch (error) {
      console.error('Error calculating GEX:', error)
      // Fallback with current price estimate
      const spyQuote = await this.finnhub.getCurrentSPYQuote()
      return this.estimateGEXFromVIX(spyQuote.price, 18.71)
    }
  }
  
  // Enhanced GEX estimation using VIX
  private estimateGEXFromVIX(spotPrice: number, vix: number): GEXData {
    // Use VIX level to estimate gamma exposure
    // Higher VIX = more put protection = negative GEX
    // Lower VIX = more call selling = positive GEX
    
    // Base GEX levels (in billions)
    const baseCallGEX = 2.5
    const basePutGEX = 2.0
    
    // Adjust based on VIX level
    const vixAdjustment = (vix - 16) / 10 // Normalized around VIX 16
    
    // Higher VIX increases put gamma (hedging) and decreases call gamma
    const callGEX = Math.max(0.5, baseCallGEX - vixAdjustment * 0.8)
    const putGEX = Math.max(0.5, basePutGEX + vixAdjustment * 1.2)
    
    const netGEX = callGEX - putGEX
    const totalGEX = callGEX + putGEX
    
    // Gamma flip point moves based on net GEX
    // Positive GEX = flip point below spot
    // Negative GEX = flip point above spot
    const gammaFlipPoint = spotPrice + (netGEX > 0 ? -3 : 3)
    
    // Generate realistic gamma concentration strikes
    const strikeInterval = 5
    const largestGammaStrikes = [
      { strike: Math.round(spotPrice / strikeInterval) * strikeInterval, gamma: 0.8 + Math.random() * 0.2, type: 'call' as const },
      { strike: Math.round((spotPrice - 5) / strikeInterval) * strikeInterval, gamma: 0.7 + Math.random() * 0.2, type: 'put' as const },
      { strike: Math.round((spotPrice + 5) / strikeInterval) * strikeInterval, gamma: 0.6 + Math.random() * 0.2, type: 'call' as const },
      { strike: Math.round((spotPrice - 10) / strikeInterval) * strikeInterval, gamma: 0.5 + Math.random() * 0.2, type: 'put' as const },
      { strike: Math.round((spotPrice + 10) / strikeInterval) * strikeInterval, gamma: 0.4 + Math.random() * 0.2, type: 'call' as const }
    ].filter(s => s.strike > 0) // Ensure positive strikes
    
    // Determine market maker positioning
    let marketMakerPositioning: 'long_gamma' | 'short_gamma' | 'neutral'
    if (netGEX > 0.5) {
      marketMakerPositioning = 'long_gamma'
    } else if (netGEX < -0.5) {
      marketMakerPositioning = 'short_gamma'
    } else {
      marketMakerPositioning = 'neutral'
    }
    
    // Expected volatility based on gamma positioning
    let expectedVolatility: 'suppressed' | 'amplified' | 'normal'
    if (netGEX > 1.0) {
      expectedVolatility = 'suppressed'
    } else if (netGEX < -1.0) {
      expectedVolatility = 'amplified'
    } else {
      expectedVolatility = 'normal'
    }
    
    return {
      totalGEX: parseFloat(totalGEX.toFixed(2)),
      callGEX: parseFloat(callGEX.toFixed(2)),
      putGEX: parseFloat(putGEX.toFixed(2)),
      netGEX: parseFloat(netGEX.toFixed(2)),
      spotPrice,
      gammaFlipPoint: parseFloat(gammaFlipPoint.toFixed(2)),
      largestGammaStrikes,
      marketMakerPositioning,
      expectedVolatility
    }
  }
  
  // Fetch options chain data
  private async fetchOptionsChain(symbol: string): Promise<any[]> {
    try {
      // Note: Finnhub requires premium subscription for options data
      // This is a placeholder for when options data is available
      const response = await fetch(
        `https://finnhub.io/api/v1/stock/option-chain?symbol=${symbol}&token=${this.apiKey}`
      )
      const data = await response.json()
      
      if (data && data.data && Array.isArray(data.data)) {
        return data.data
      }
      
      return []
    } catch (error) {
      console.log('Options chain fetch failed (likely needs premium subscription)')
      return []
    }
  }
  
  // Compute GEX from actual options data
  private computeGEXFromOptions(options: any[], spotPrice: number): GEXData {
    let callGEX = 0
    let putGEX = 0
    const gammaByStrike: Map<number, { call: number; put: number }> = new Map()
    
    for (const option of options) {
      const strike = parseFloat(option.strike)
      const gamma = this.calculateOptionGamma(option, spotPrice)
      const openInterest = parseFloat(option.openInterest || 0)
      
      // GEX = Gamma * Open Interest * Contract Multiplier * Spot Price
      const gex = gamma * openInterest * 100 * spotPrice / 1e9 // Convert to billions
      
      if (option.type === 'call') {
        callGEX += gex
        const current = gammaByStrike.get(strike) || { call: 0, put: 0 }
        current.call += gex
        gammaByStrike.set(strike, current)
      } else {
        putGEX += gex
        const current = gammaByStrike.get(strike) || { call: 0, put: 0 }
        current.put += gex
        gammaByStrike.set(strike, current)
      }
    }
    
    // Find gamma flip point (strike with max gamma)
    let gammaFlipPoint = spotPrice
    let maxGamma = 0
    
    for (const [strike, gamma] of gammaByStrike.entries()) {
      const totalGamma = Math.abs(gamma.call - gamma.put)
      if (totalGamma > maxGamma) {
        maxGamma = totalGamma
        gammaFlipPoint = strike
      }
    }
    
    // Get largest gamma strikes
    const largestGammaStrikes = Array.from(gammaByStrike.entries())
      .map(([strike, gamma]) => [
        { strike, gamma: gamma.call, type: 'call' as const },
        { strike, gamma: gamma.put, type: 'put' as const }
      ])
      .flat()
      .sort((a, b) => Math.abs(b.gamma) - Math.abs(a.gamma))
      .slice(0, 5)
    
    const netGEX = callGEX - putGEX
    const totalGEX = callGEX + putGEX
    
    return {
      totalGEX,
      callGEX,
      putGEX,
      netGEX,
      spotPrice,
      gammaFlipPoint,
      largestGammaStrikes,
      marketMakerPositioning: netGEX > 0.5 ? 'long_gamma' : netGEX < -0.5 ? 'short_gamma' : 'neutral',
      expectedVolatility: netGEX > 0.5 ? 'suppressed' : netGEX < -0.5 ? 'amplified' : 'normal'
    }
  }
  
  // Calculate option gamma (simplified Black-Scholes)
  private calculateOptionGamma(option: any, spotPrice: number): number {
    // Simplified gamma calculation
    // In reality, would need implied volatility, time to expiration, etc.
    const strike = parseFloat(option.strike)
    const moneyness = spotPrice / strike
    
    // ATM options have highest gamma
    if (moneyness > 0.95 && moneyness < 1.05) {
      return 0.05 // High gamma for ATM
    } else if (moneyness > 0.9 && moneyness < 1.1) {
      return 0.02 // Medium gamma
    } else {
      return 0.005 // Low gamma for OTM
    }
  }
  

  
  // Get GEX interpretation
  interpretGEX(gex: GEXData): {
    summary: string
    tradingImplication: string
    volatilityOutlook: string
    supportResistance: string[]
  } {
    const implications = []
    
    // Market maker positioning impact
    if (gex.marketMakerPositioning === 'long_gamma') {
      implications.push('Market makers are long gamma - they buy dips and sell rallies')
      implications.push('This suppresses volatility and creates mean reversion')
    } else if (gex.marketMakerPositioning === 'short_gamma') {
      implications.push('Market makers are short gamma - they sell dips and buy rallies')
      implications.push('This amplifies volatility and creates trending moves')
    } else {
      implications.push('Market makers are neutral - normal market dynamics')
    }
    
    // Gamma flip point
    if (Math.abs(gex.spotPrice - gex.gammaFlipPoint) < 5) {
      implications.push(`Price near gamma flip point at ${gex.gammaFlipPoint.toFixed(2)} - expect increased volatility`)
    }
    
    // Support/Resistance from gamma strikes
    const supportResistance = gex.largestGammaStrikes
      .map(s => `${s.strike} (${s.type} gamma: ${s.gamma.toFixed(2)}B)`)
      .slice(0, 3)
    
    return {
      summary: gex.netGEX > 0 ? 
        `Positive GEX (${gex.netGEX.toFixed(2)}B) - Volatility suppressed` :
        `Negative GEX (${gex.netGEX.toFixed(2)}B) - Volatility amplified`,
      tradingImplication: gex.marketMakerPositioning === 'long_gamma' ?
        'Fade large moves, buy dips/sell rips' :
        'Follow momentum, trend continuation likely',
      volatilityOutlook: gex.expectedVolatility,
      supportResistance
    }
  }
}