/**
 * Mock Hurricane API Routes for Testing
 * Returns realistic data for dashboard testing
 */

import { Hono } from 'hono'
import { MockDataGenerator } from '../services/MockDataGenerator'

const api = new Hono()

// Get mock predictions
api.get('/predict', async (c) => {
  const symbol = c.req.query('symbol') || 'SPY'
  const spot = 505 + (Math.random() - 0.5) * 10
  
  const predictions = MockDataGenerator.generatePredictions(spot)
  
  return c.json(predictions)
})

// Get mock regime data
api.get('/regime', async (c) => {
  const symbol = c.req.query('symbol') || 'SPY'
  const spot = 505 + (Math.random() - 0.5) * 10
  
  const regime = MockDataGenerator.generateRegimeData(spot)
  
  return c.json(regime)
})

// Get mock health data
api.get('/health', async (c) => {
  const metrics = MockDataGenerator.generateHealthMetrics()
  
  return c.json({
    overall: true,
    avgHealth: 0.75,
    metrics,
    warnings: [],
    summary: '✅ All systems healthy (75%)'
  })
})

export default api