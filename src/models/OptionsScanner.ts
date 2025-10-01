// Enhanced Options Scanner with Black-Scholes Integration and Real Pricing

import { BlackScholes, type OptionPrice, type OptionGreeks } from './BlackScholes'

export type PredictionDirection =
  | 'bullish'
  | 'bearish'
  | 'neutral'
  | 'BUY'
  | 'SELL'
  | 'STRONG_BUY'
  | 'STRONG_SELL'
  | 'NEUTRAL'

export interface OptionContract {
  symbol: string
  strike: number
  expiration: Date
  type: 'call' | 'put'
  bid: number
  ask: number
  mid: number
  last: number
  volume: number
  openInterest: number
  impliedVolatility: number
  // Greeks and pricing from Black-Scholes
  theoreticalPrice?: number
  greeks?: OptionGreeks
}

export interface OptionRecommendation {
  timeframe: string
  type: 'call' | 'put'
  strike: number
  expiration: string
  expirationDate: Date
  daysToExpiry: number
  // Pricing
  cost: number  // Actual option cost (mid price)
  theoreticalPrice: number  // Black-Scholes price
  priceDifference: number  // Market vs theoretical
  // Greeks
  delta: number
  gamma: number
  theta: number  // Daily theta decay
  vega: number
  rho: number
  // Trading levels
  entry: number
  target: number
  stopLoss: number
  riskRewardRatio: number
  // Analytics
  confidence: number
  score: number
  liquidity: number
  // Expected profit/loss
  expectedProfit: number
  expectedLoss: number
  expectedValue: number
}

export interface ScannerConfig {
  maxDaysToExpiry: number  // Maximum days to expiration (0 for 0DTE)
  minDelta: number  // Minimum absolute delta
  maxDelta: number  // Maximum absolute delta
  minVolume: number  // Minimum volume
  minOpenInterest: number  // Minimum open interest
  targetDelta?: number  // Target delta for ATM/OTM selection
  riskFreeRate: number  // Risk-free rate for Black-Scholes
}

export class EnhancedOptionsScanner {
  private blackScholes: BlackScholes
  
  constructor(private config: ScannerConfig = {
    maxDaysToExpiry: 1,  // 0DTE and 1DTE
    minDelta: 0.25,
    maxDelta: 0.55,
    minVolume: 100,
    minOpenInterest: 100,
    targetDelta: 0.40,  // Slightly OTM for scalping
    riskFreeRate: 0.05  // 5% risk-free rate
  }) {
    this.blackScholes = new BlackScholes()
  }

  /**
   * Find best option contract for given prediction
   */
  async findBestOption(
    spotPrice: number,
    prediction: {
      direction: PredictionDirection
      expectedReturn: number
      confidence: number
      timeframe: string
    },
    optionChain: OptionContract[]
  ): Promise<OptionRecommendation | null> {
    const normalizedDirection = EnhancedOptionsScanner.normalizeDirection(
      prediction.direction
    )

    if (normalizedDirection === 'neutral') return null

    const isCall = normalizedDirection === 'bullish'
    
    // Filter option chain
    const filteredOptions = this.filterOptions(optionChain, isCall)
    
    // Score and rank options
    const scoredOptions = filteredOptions.map(option => {
      const daysToExpiry = this.calculateDaysToExpiry(option.expiration)
      const timeToExpiry = daysToExpiry / 365
      
      // Calculate Black-Scholes price and Greeks
      const bsResult = isCall 
        ? this.blackScholes.calculateCall(
            spotPrice,
            option.strike,
            timeToExpiry,
            this.config.riskFreeRate,
            option.impliedVolatility
          )
        : this.blackScholes.calculatePut(
            spotPrice,
            option.strike,
            timeToExpiry,
            this.config.riskFreeRate,
            option.impliedVolatility
          )
      
      // Score the option
      const score = this.scoreOption(
        bsResult.greeks,
        option,
        prediction,
        spotPrice
      )
      
      // Calculate trading levels
      const tradingLevels = this.calculateTradingLevels(
        option.mid,
        bsResult.greeks.delta,
        prediction.expectedReturn,
        prediction.confidence
      )
      
      // Create recommendation
      const recommendation: OptionRecommendation = {
        timeframe: prediction.timeframe,
        type: isCall ? 'call' : 'put',
        strike: option.strike,
        expiration: option.expiration.toISOString().split('T')[0],
        expirationDate: option.expiration,
        daysToExpiry,
        // Pricing
        cost: option.mid,
        theoreticalPrice: bsResult.price,
        priceDifference: option.mid - bsResult.price,
        // Greeks
        delta: bsResult.greeks.delta,
        gamma: bsResult.greeks.gamma,
        theta: bsResult.greeks.theta,
        vega: bsResult.greeks.vega,
        rho: bsResult.greeks.rho,
        // Trading levels
        entry: tradingLevels.entry,
        target: tradingLevels.target,
        stopLoss: tradingLevels.stopLoss,
        riskRewardRatio: tradingLevels.riskRewardRatio,
        // Analytics
        confidence: prediction.confidence,
        score,
        liquidity: this.calculateLiquidity(option),
        // Expected P&L
        expectedProfit: tradingLevels.target - tradingLevels.entry,
        expectedLoss: tradingLevels.entry - tradingLevels.stopLoss,
        expectedValue: (tradingLevels.target - tradingLevels.entry) * prediction.confidence - 
                       (tradingLevels.entry - tradingLevels.stopLoss) * (1 - prediction.confidence)
      }
      
      return recommendation
    })
    
    // Sort by score and return best option
    scoredOptions.sort((a, b) => b.score - a.score)
    return scoredOptions[0] || null
  }

  /**
   * Scan all timeframes and find best options
   */
  async scanAllTimeframes(
    spotPrice: number,
    predictions: Map<string, any>,
    optionChain: OptionContract[]
  ): Promise<Map<string, OptionRecommendation>> {
    const recommendations = new Map<string, OptionRecommendation>()
    
    for (const [timeframe, prediction] of predictions) {
      const recommendation = await this.findBestOption(
        spotPrice,
        { ...prediction, timeframe },
        optionChain
      )
      
      if (recommendation) {
        recommendations.set(timeframe, recommendation)
      }
    }
    
    return recommendations
  }

  /**
   * Filter option chain based on scanner config
   */
  private filterOptions(options: OptionContract[], isCall: boolean): OptionContract[] {
    return options.filter(option => {
      // Type filter
      if ((isCall && option.type !== 'call') || (!isCall && option.type !== 'put')) {
        return false
      }
      
      // Days to expiry filter
      const daysToExpiry = this.calculateDaysToExpiry(option.expiration)
      if (daysToExpiry > this.config.maxDaysToExpiry) {
        return false
      }
      
      // Liquidity filters
      if (option.volume < this.config.minVolume || 
          option.openInterest < this.config.minOpenInterest) {
        return false
      }
      
      // Valid pricing
      if (option.bid <= 0 || option.ask <= 0 || option.mid <= 0) {
        return false
      }
      
      return true
    })
  }

  /**
   * Score option based on Greeks and market conditions
   */
  private scoreOption(
    greeks: OptionGreeks,
    option: OptionContract,
    prediction: any,
    spotPrice: number
  ): number {
    let score = 0
    
    // Delta score (prefer target delta)
    const deltaDiff = Math.abs(Math.abs(greeks.delta) - (this.config.targetDelta || 0.40))
    score += (1 - deltaDiff) * 30  // 30% weight
    
    // Gamma score (higher is better for scalping)
    score += Math.min(greeks.gamma * 100, 20)  // 20% weight, capped
    
    // Theta penalty (less decay is better)
    score -= Math.abs(greeks.theta) * 10  // 10% weight penalty
    
    // Vega consideration (lower is better for short-term)
    score -= greeks.vega * 5  // 5% weight penalty
    
    // Liquidity score
    const liquidity = this.calculateLiquidity(option)
    score += liquidity * 20  // 20% weight
    
    // Confidence boost
    score += prediction.confidence * 15  // 15% weight
    
    // Price efficiency (prefer options trading close to theoretical value)
    const priceDiff = Math.abs(option.mid - greeks.delta * spotPrice) / option.mid
    score += (1 - Math.min(priceDiff, 1)) * 10  // 10% weight
    
    return Math.max(0, score)
  }

  /**
   * Calculate trading levels for option
   */
  private calculateTradingLevels(
    optionPrice: number,
    delta: number,
    expectedMove: number,
    confidence: number
  ): {
    entry: number
    target: number
    stopLoss: number
    riskRewardRatio: number
  } {
    // Entry with slippage
    const slippage = 0.02  // 2% slippage
    const entry = optionPrice * (1 + slippage)
    
    // Target based on expected move and delta
    const expectedOptionMove = Math.abs(expectedMove * delta * 2)  // 2x leverage for options
    const target = entry * (1 + expectedOptionMove)
    
    // Dynamic stop loss based on confidence
    const stopLossPercent = 0.3 - (confidence - 0.5) * 0.2  // 20-40% stop loss
    const stopLoss = entry * (1 - stopLossPercent)
    
    // Risk-reward ratio
    const riskRewardRatio = (target - entry) / (entry - stopLoss)
    
    return {
      entry: Number(entry.toFixed(2)),
      target: Number(target.toFixed(2)),
      stopLoss: Number(stopLoss.toFixed(2)),
      riskRewardRatio: Number(riskRewardRatio.toFixed(2))
    }
  }

  /**
   * Calculate liquidity score for option
   */
  private calculateLiquidity(option: OptionContract): number {
    // Normalize volume and OI
    const volumeScore = Math.min(option.volume / 1000, 1)
    const oiScore = Math.min(option.openInterest / 5000, 1)
    
    // Bid-ask spread tightness
    const spread = option.ask - option.bid
    const spreadPercent = spread / option.mid
    const spreadScore = Math.max(0, 1 - spreadPercent * 10)
    
    // Combined liquidity score
    return (volumeScore * 0.4 + oiScore * 0.4 + spreadScore * 0.2)
  }

  /**
   * Calculate days to expiry
   */
  private calculateDaysToExpiry(expiration: Date): number {
    const now = new Date()
    const diffTime = expiration.getTime() - now.getTime()
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    return Math.max(0, diffDays)
  }

  /**
   * Generate synthetic option chain for testing
   */
  static generateSyntheticOptionChain(
    spotPrice: number,
    expirationDays: number[] = [0, 1, 2]
  ): OptionContract[] {
    const options: OptionContract[] = []
    const strikes = this.generateStrikes(spotPrice)
    
    for (const days of expirationDays) {
      const expiration = new Date()
      expiration.setDate(expiration.getDate() + days)
      
      for (const strike of strikes) {
        // Generate both calls and puts
        for (const type of ['call', 'put'] as const) {
          const moneyness = type === 'call' 
            ? (spotPrice - strike) / strike 
            : (strike - spotPrice) / strike
          
          // Base IV with skew
          const baseIV = 0.15 + Math.abs(moneyness) * 0.5
          const iv = baseIV * (1 + Math.random() * 0.2 - 0.1)
          
          // Calculate theoretical price
          const bs = new BlackScholes()
          const timeToExpiry = days / 365
          const theoretical = type === 'call'
            ? bs.calculateCall(spotPrice, strike, timeToExpiry, 0.05, iv)
            : bs.calculatePut(spotPrice, strike, timeToExpiry, 0.05, iv)
          
          // Add market noise
          const marketNoise = 1 + (Math.random() * 0.1 - 0.05)
          const mid = theoretical.price * marketNoise
          const spread = mid * 0.02  // 2% spread
          
          options.push({
            symbol: `SPY${expiration.getMonth()}${expiration.getDate()}${type[0].toUpperCase()}${strike}`,
            strike,
            expiration,
            type,
            bid: mid - spread / 2,
            ask: mid + spread / 2,
            mid,
            last: mid * (1 + Math.random() * 0.02 - 0.01),
            volume: Math.floor(Math.random() * 10000),
            openInterest: Math.floor(Math.random() * 50000),
            impliedVolatility: iv
          })
        }
      }
    }
    
    return options
  }

  /**
   * Generate strike prices around spot
   */
  private static generateStrikes(spotPrice: number): number[] {
    const strikes: number[] = []
    const strikeInterval = 1  // $1 intervals for SPY
    const numStrikes = 21  // 10 above, 10 below, 1 ATM
    
    const atmStrike = Math.round(spotPrice)
    for (let i = -10; i <= 10; i++) {
      strikes.push(atmStrike + i * strikeInterval)
    }
    
    return strikes
  }

  static normalizeDirection(direction: PredictionDirection): 'bullish' | 'bearish' | 'neutral' {
    switch (direction) {
      case 'STRONG_BUY':
      case 'BUY':
      case 'bullish':
        return 'bullish'
      case 'STRONG_SELL':
      case 'SELL':
      case 'bearish':
        return 'bearish'
      case 'NEUTRAL':
      case 'neutral':
      default:
        return 'neutral'
    }
  }
}

// Export for use in application
export default EnhancedOptionsScanner
