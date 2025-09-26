/**
 * Polygon.io Market Data API
 * Alternative real market data provider
 */

import { Hono } from 'hono'
import { EnhancedMarketDataGenerator } from '../models/EnhancedMarketData'
import type { CloudflareBindings } from '../types'

interface Env {
  POLYGON_API_KEY?: string
}

const polygonMarketApi = new Hono<{ Bindings: CloudflareBindings & Env }>()

/**
 * Get current market data from Polygon.io
 */
polygonMarketApi.get('/current', async (c) => {
  try {
    // Use Polygon API key from environment
    const polygonKey = c.env.POLYGON_API_KEY || 'Jm_fqc_gtSTSXG78P67dpBpO3LX_4P6D'
    const generator = new EnhancedMarketDataGenerator(polygonKey)
    
    const data = await generator.generateCurrentData()
    
    return c.json({
      success: true,
      data,
      dataSource: data.dataSource,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Failed to fetch Polygon market data:', error)
    
    // Fallback to synthetic
    const generator = new EnhancedMarketDataGenerator()
    const data = await generator.generateCurrentData()
    
    return c.json({
      success: true,
      data,
      dataSource: 'synthetic (Polygon error)',
      error: error.message,
      timestamp: new Date().toISOString()
    })
  }
})

/**
 * Get technical indicators for a timeframe
 */
polygonMarketApi.get('/indicators/:timeframe', async (c) => {
  try {
    const timeframe = c.req.param('timeframe') as '15m' | '1h' | '4h' | '1d' | '1w'
    
    if (!['15m', '1h', '4h', '1d', '1w'].includes(timeframe)) {
      return c.json({
        success: false,
        error: 'Invalid timeframe'
      }, 400)
    }
    
    const polygonKey = c.env.POLYGON_API_KEY || 'Jm_fqc_gtSTSXG78P67dpBpO3LX_4P6D'
    const generator = new EnhancedMarketDataGenerator(polygonKey)
    
    const indicators = await generator.getTechnicalIndicators(timeframe)
    
    return c.json({
      success: true,
      timeframe,
      indicators,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Failed to fetch indicators:', error)
    return c.json({
      success: false,
      error: 'Failed to fetch technical indicators'
    }, 500)
  }
})

/**
 * Get historical candles
 */
polygonMarketApi.get('/candles/:timeframe', async (c) => {
  try {
    const timeframe = c.req.param('timeframe') as '15m' | '1h' | '4h' | '1d' | '1w'
    const limit = parseInt(c.req.query('limit') || '100')
    
    if (!['15m', '1h', '4h', '1d', '1w'].includes(timeframe)) {
      return c.json({
        success: false,
        error: 'Invalid timeframe'
      }, 400)
    }
    
    const polygonKey = c.env.POLYGON_API_KEY || 'Jm_fqc_gtSTSXG78P67dpBpO3LX_4P6D'
    const generator = new EnhancedMarketDataGenerator(polygonKey)
    
    const candles = await generator.getHistoricalCandles(timeframe, limit)
    
    return c.json({
      success: true,
      timeframe,
      candles,
      count: candles.length,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Failed to fetch candles:', error)
    return c.json({
      success: false,
      error: 'Failed to fetch historical data'
    }, 500)
  }
})

/**
 * Test Polygon.io connection
 */
polygonMarketApi.get('/test', async (c) => {
  try {
    const polygonKey = c.env.POLYGON_API_KEY || 'Jm_fqc_gtSTSXG78P67dpBpO3LX_4P6D'
    
    if (!polygonKey) {
      return c.json({
        success: false,
        message: 'No Polygon API key configured'
      })
    }
    
    // Try a simple API call
    const testUrl = `https://api.polygon.io/v3/quotes/SPY?apiKey=${polygonKey}`
    const response = await fetch(testUrl)
    
    if (response.ok) {
      return c.json({
        success: true,
        message: 'Polygon.io API is working',
        provider: 'polygon.io',
        keyStatus: 'valid'
      })
    } else {
      const errorText = await response.text()
      return c.json({
        success: false,
        message: 'Polygon.io API error',
        error: errorText,
        statusCode: response.status
      })
    }
  } catch (error) {
    return c.json({
      success: false,
      message: 'Failed to test Polygon.io',
      error: error.message
    })
  }
})

export { polygonMarketApi }