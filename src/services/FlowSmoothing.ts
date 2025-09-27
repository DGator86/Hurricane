/**
 * Options Flow Smoothing - EWMA and Kalman filtering for DEX/GEX stability
 */

export interface FlowDataPoint {
  timestamp: Date;
  dex: number;
  gex: number;
  spot: number;
}

export interface SmoothedFlow {
  raw: FlowDataPoint;
  smoothed: FlowDataPoint;
  trend: 'INCREASING' | 'DECREASING' | 'STABLE';
  volatility: number; // Measure of recent jumpiness
}

/**
 * Exponentially Weighted Moving Average filter
 */
export class EWMAFilter {
  private alpha: number; // Smoothing factor (0 < alpha < 1)
  private value: number | null = null;
  
  constructor(alpha: number = 0.3) {
    this.alpha = alpha;
  }
  
  update(newValue: number): number {
    if (this.value === null) {
      this.value = newValue;
    } else {
      this.value = this.alpha * newValue + (1 - this.alpha) * this.value;
    }
    return this.value;
  }
  
  getValue(): number | null {
    return this.value;
  }
  
  reset(): void {
    this.value = null;
  }
}

/**
 * Simple Kalman filter for 1D time series
 */
export class KalmanFilter {
  private x: number = 0; // State estimate
  private P: number = 1; // Error covariance
  private Q: number; // Process noise covariance
  private R: number; // Measurement noise covariance
  private initialized = false;
  
  constructor(processNoise: number = 0.01, measurementNoise: number = 0.1) {
    this.Q = processNoise;
    this.R = measurementNoise;
  }
  
  update(measurement: number): number {
    if (!this.initialized) {
      this.x = measurement;
      this.initialized = true;
      return this.x;
    }
    
    // Predict
    const xPred = this.x;
    const PPred = this.P + this.Q;
    
    // Update
    const K = PPred / (PPred + this.R); // Kalman gain
    this.x = xPred + K * (measurement - xPred);
    this.P = (1 - K) * PPred;
    
    return this.x;
  }
  
  getValue(): number {
    return this.x;
  }
  
  reset(): void {
    this.x = 0;
    this.P = 1;
    this.initialized = false;
  }
}

/**
 * Flow smoothing manager
 */
export class FlowSmoothingManager {
  private dexEWMA: EWMAFilter;
  private gexEWMA: EWMAFilter;
  private dexKalman: KalmanFilter;
  private gexKalman: KalmanFilter;
  private history: FlowDataPoint[] = [];
  private readonly MAX_HISTORY = 100;
  
  constructor() {
    // EWMA with moderate smoothing
    this.dexEWMA = new EWMAFilter(0.3);
    this.gexEWMA = new EWMAFilter(0.3);
    
    // Kalman with balanced noise parameters
    this.dexKalman = new KalmanFilter(0.01, 0.1);
    this.gexKalman = new KalmanFilter(0.01, 0.1);
  }
  
  /**
   * Process new flow data point
   */
  processFlow(data: FlowDataPoint): SmoothedFlow {
    // Add to history
    this.history.push(data);
    if (this.history.length > this.MAX_HISTORY) {
      this.history.shift();
    }
    
    // Apply smoothing
    const smoothedDexEWMA = this.dexEWMA.update(data.dex);
    const smoothedGexEWMA = this.gexEWMA.update(data.gex);
    const smoothedDexKalman = this.dexKalman.update(data.dex);
    const smoothedGexKalman = this.gexKalman.update(data.gex);
    
    // Use average of EWMA and Kalman for final smoothed value
    const smoothedDex = (smoothedDexEWMA + smoothedDexKalman) / 2;
    const smoothedGex = (smoothedGexEWMA + smoothedGexKalman) / 2;
    
    // Calculate trend
    const trend = this.calculateTrend(smoothedDex, smoothedGex);
    
    // Calculate volatility
    const volatility = this.calculateVolatility();
    
    return {
      raw: data,
      smoothed: {
        timestamp: data.timestamp,
        dex: smoothedDex,
        gex: smoothedGex,
        spot: data.spot
      },
      trend,
      volatility
    };
  }
  
  /**
   * Calculate trend direction
   */
  private calculateTrend(currentDex: number, currentGex: number): 'INCREASING' | 'DECREASING' | 'STABLE' {
    if (this.history.length < 5) {
      return 'STABLE';
    }
    
    // Look at last 5 smoothed values
    const recentHistory = this.history.slice(-5);
    const avgDex = recentHistory.reduce((sum, p) => sum + p.dex, 0) / recentHistory.length;
    const avgGex = recentHistory.reduce((sum, p) => sum + p.gex, 0) / recentHistory.length;
    
    const dexChange = (currentDex - avgDex) / Math.abs(avgDex + 0.001);
    const gexChange = (currentGex - avgGex) / Math.abs(avgGex + 0.001);
    
    // Combine DEX and GEX trends
    const combinedChange = (dexChange + gexChange) / 2;
    
    if (combinedChange > 0.1) {
      return 'INCREASING';
    } else if (combinedChange < -0.1) {
      return 'DECREASING';
    }
    return 'STABLE';
  }
  
  /**
   * Calculate recent volatility
   */
  private calculateVolatility(): number {
    if (this.history.length < 10) {
      return 0;
    }
    
    const recent = this.history.slice(-10);
    
    // Calculate standard deviation of DEX changes
    const dexChanges: number[] = [];
    for (let i = 1; i < recent.length; i++) {
      dexChanges.push(Math.abs(recent[i].dex - recent[i - 1].dex));
    }
    
    const avgChange = dexChanges.reduce((sum, c) => sum + c, 0) / dexChanges.length;
    const variance = dexChanges.reduce((sum, c) => sum + Math.pow(c - avgChange, 2), 0) / dexChanges.length;
    const stdDev = Math.sqrt(variance);
    
    // Normalize to 0-1 scale (assuming max reasonable stdDev of 2)
    return Math.min(1, stdDev / 2);
  }
  
  /**
   * Get smoothing statistics
   */
  getStatistics(): {
    ewma: { dex: number | null; gex: number | null };
    kalman: { dex: number; gex: number };
    historySize: number;
  } {
    return {
      ewma: {
        dex: this.dexEWMA.getValue(),
        gex: this.gexEWMA.getValue()
      },
      kalman: {
        dex: this.dexKalman.getValue(),
        gex: this.gexKalman.getValue()
      },
      historySize: this.history.length
    };
  }
  
  /**
   * Reset all filters
   */
  reset(): void {
    this.dexEWMA.reset();
    this.gexEWMA.reset();
    this.dexKalman.reset();
    this.gexKalman.reset();
    this.history = [];
  }
}

/**
 * Adaptive smoothing based on market conditions
 */
export class AdaptiveFlowSmoother {
  private managers: Map<string, FlowSmoothingManager> = new Map();
  
  /**
   * Get or create smoother for a symbol
   */
  getSmoother(symbol: string): FlowSmoothingManager {
    if (!this.managers.has(symbol)) {
      this.managers.set(symbol, new FlowSmoothingManager());
    }
    return this.managers.get(symbol)!;
  }
  
  /**
   * Process flow with adaptive parameters based on VIX
   */
  processAdaptive(
    symbol: string,
    data: FlowDataPoint,
    vix: number
  ): SmoothedFlow {
    const smoother = this.getSmoother(symbol);
    
    // In high VIX environments, we might want different smoothing
    // For now, use standard smoothing
    const result = smoother.processFlow(data);
    
    // Adjust based on VIX if needed
    if (vix > 30) {
      // High volatility - trust smoothed values more
      result.smoothed.dex = result.smoothed.dex * 0.8 + result.raw.dex * 0.2;
      result.smoothed.gex = result.smoothed.gex * 0.8 + result.raw.gex * 0.2;
    }
    
    return result;
  }
}