/**
 * Black-Scholes Option Pricing Model
 * Calculates option prices and Greeks
 */

export interface OptionGreeks {
  delta: number
  gamma: number
  theta: number
  vega: number
  rho: number
}

export interface OptionPrice {
  price: number
  intrinsicValue: number
  timeValue: number
  greeks: OptionGreeks
}

export class BlackScholes {
  /**
   * Cumulative standard normal distribution
   */
  private N(x: number): number {
    const a1 = 0.254829592
    const a2 = -0.284496736
    const a3 = 1.421413741
    const a4 = -1.453152027
    const a5 = 1.061405429
    const p = 0.3275911
    
    const sign = x < 0 ? -1 : 1
    x = Math.abs(x) / Math.sqrt(2.0)
    
    const t = 1.0 / (1.0 + p * x)
    const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x)
    
    return 0.5 * (1.0 + sign * y)
  }
  
  /**
   * Standard normal probability density function
   */
  private phi(x: number): number {
    return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI)
  }
  
  /**
   * Calculate d1 and d2 for Black-Scholes
   */
  private calculateD1D2(
    S: number,  // Spot price
    K: number,  // Strike price
    r: number,  // Risk-free rate
    T: number,  // Time to expiry (years)
    σ: number   // Volatility
  ): { d1: number; d2: number } {
    const d1 = (Math.log(S / K) + (r + 0.5 * σ * σ) * T) / (σ * Math.sqrt(T))
    const d2 = d1 - σ * Math.sqrt(T)
    return { d1, d2 }
  }
  
  /**
   * Calculate call option price and Greeks
   */
  calculateCall(
    S: number,     // Spot price
    K: number,     // Strike price
    r: number,     // Risk-free rate (annual)
    T: number,     // Time to expiry (years)
    σ: number,     // Volatility (annual)
    q: number = 0  // Dividend yield
  ): OptionPrice {
    // Handle edge cases
    if (T <= 0) {
      const intrinsic = Math.max(0, S - K)
      return {
        price: intrinsic,
        intrinsicValue: intrinsic,
        timeValue: 0,
        greeks: {
          delta: intrinsic > 0 ? 1 : 0,
          gamma: 0,
          theta: 0,
          vega: 0,
          rho: 0
        }
      }
    }
    
    const { d1, d2 } = this.calculateD1D2(S, K, r - q, T, σ)
    const sqrtT = Math.sqrt(T)
    
    // Call price
    const price = S * Math.exp(-q * T) * this.N(d1) - K * Math.exp(-r * T) * this.N(d2)
    
    // Greeks
    const delta = Math.exp(-q * T) * this.N(d1)
    const gamma = Math.exp(-q * T) * this.phi(d1) / (S * σ * sqrtT)
    const theta = -(S * this.phi(d1) * σ * Math.exp(-q * T)) / (2 * sqrtT) 
                  - r * K * Math.exp(-r * T) * this.N(d2)
                  + q * S * Math.exp(-q * T) * this.N(d1)
    const vega = S * Math.exp(-q * T) * this.phi(d1) * sqrtT / 100 // Divide by 100 for 1% vega
    const rho = K * T * Math.exp(-r * T) * this.N(d2) / 100 // Divide by 100 for 1% rho
    
    const intrinsicValue = Math.max(0, S - K)
    const timeValue = price - intrinsicValue
    
    return {
      price: Math.max(0, price),
      intrinsicValue,
      timeValue: Math.max(0, timeValue),
      greeks: {
        delta,
        gamma,
        theta: theta / 365, // Convert to daily theta
        vega,
        rho
      }
    }
  }
  
  /**
   * Calculate put option price and Greeks
   */
  calculatePut(
    S: number,     // Spot price
    K: number,     // Strike price
    r: number,     // Risk-free rate (annual)
    T: number,     // Time to expiry (years)
    σ: number,     // Volatility (annual)
    q: number = 0  // Dividend yield
  ): OptionPrice {
    // Handle edge cases
    if (T <= 0) {
      const intrinsic = Math.max(0, K - S)
      return {
        price: intrinsic,
        intrinsicValue: intrinsic,
        timeValue: 0,
        greeks: {
          delta: intrinsic > 0 ? -1 : 0,
          gamma: 0,
          theta: 0,
          vega: 0,
          rho: 0
        }
      }
    }
    
    const { d1, d2 } = this.calculateD1D2(S, K, r - q, T, σ)
    const sqrtT = Math.sqrt(T)
    
    // Put price
    const price = K * Math.exp(-r * T) * this.N(-d2) - S * Math.exp(-q * T) * this.N(-d1)
    
    // Greeks
    const delta = -Math.exp(-q * T) * this.N(-d1)
    const gamma = Math.exp(-q * T) * this.phi(d1) / (S * σ * sqrtT)
    const theta = -(S * this.phi(d1) * σ * Math.exp(-q * T)) / (2 * sqrtT)
                  + r * K * Math.exp(-r * T) * this.N(-d2)
                  - q * S * Math.exp(-q * T) * this.N(-d1)
    const vega = S * Math.exp(-q * T) * this.phi(d1) * sqrtT / 100
    const rho = -K * T * Math.exp(-r * T) * this.N(-d2) / 100
    
    const intrinsicValue = Math.max(0, K - S)
    const timeValue = price - intrinsicValue
    
    return {
      price: Math.max(0, price),
      intrinsicValue,
      timeValue: Math.max(0, timeValue),
      greeks: {
        delta,
        gamma,
        theta: theta / 365, // Convert to daily theta
        vega,
        rho
      }
    }
  }
  
  /**
   * Calculate implied volatility using Newton-Raphson
   */
  calculateImpliedVolatility(
    optionPrice: number,
    S: number,
    K: number,
    r: number,
    T: number,
    isCall: boolean,
    q: number = 0
  ): number {
    // Initial guess using Brenner-Subrahmanyam approximation
    let σ = Math.sqrt(2 * Math.PI / T) * (optionPrice / S)
    
    // Bounds
    const minVol = 0.001
    const maxVol = 5
    
    // Newton-Raphson iteration
    const maxIterations = 100
    const tolerance = 0.00001
    
    for (let i = 0; i < maxIterations; i++) {
      σ = Math.max(minVol, Math.min(maxVol, σ))
      
      const option = isCall ? this.calculateCall(S, K, r, T, σ, q) : this.calculatePut(S, K, r, T, σ, q)
      const diff = option.price - optionPrice
      
      if (Math.abs(diff) < tolerance) {
        return σ
      }
      
      // Vega for Newton-Raphson
      const vega = option.greeks.vega * 100 // Convert back from percentage
      
      if (Math.abs(vega) < 0.00001) {
        break // Vega too small, can't converge
      }
      
      σ = σ - diff / vega
    }
    
    return σ
  }
  
  /**
   * Get option chain prices for multiple strikes
   */
  getOptionChain(
    S: number,
    strikes: number[],
    r: number,
    T: number,
    σ: number,
    q: number = 0
  ): Array<{
    strike: number
    call: OptionPrice
    put: OptionPrice
  }> {
    return strikes.map(K => ({
      strike: K,
      call: this.calculateCall(S, K, r, T, σ, q),
      put: this.calculatePut(S, K, r, T, σ, q)
    }))
  }
  
  /**
   * Find optimal strike for target delta
   */
  findStrikeForDelta(
    S: number,
    targetDelta: number,
    r: number,
    T: number,
    σ: number,
    isCall: boolean,
    q: number = 0
  ): number {
    // Binary search for strike with target delta
    let lowStrike = S * 0.5
    let highStrike = S * 1.5
    const tolerance = 0.01
    
    for (let i = 0; i < 20; i++) {
      const midStrike = (lowStrike + highStrike) / 2
      const option = isCall ? 
        this.calculateCall(S, midStrike, r, T, σ, q) :
        this.calculatePut(S, midStrike, r, T, σ, q)
      
      const delta = Math.abs(option.greeks.delta)
      
      if (Math.abs(delta - targetDelta) < tolerance) {
        return Math.round(midStrike) // Round to nearest dollar
      }
      
      if (delta > targetDelta) {
        if (isCall) {
          lowStrike = midStrike
        } else {
          highStrike = midStrike
        }
      } else {
        if (isCall) {
          highStrike = midStrike
        } else {
          lowStrike = midStrike
        }
      }
    }
    
    return Math.round((lowStrike + highStrike) / 2)
  }
}