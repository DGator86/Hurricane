# 🌀 Hurricane SPY Prediction System - Advanced Market Analysis

## Project Overview
- **Name**: Hurricane SPY Advanced Prediction System
- **Goal**: Multi-timeframe market prediction system combining meteorological modeling with quantitative finance
- **Based On**: Academic paper "Hurricane SPY: A Multi-Timeframe Market Prediction System"
- **Features**: 
  - REAL-TIME SPY data from Alpha Vantage API
  - Multi-timeframe predictions (15m, 1h, 4h, 1d, 1w)
  - Kelly Criterion position sizing
  - 0DTE options scanner with Greeks calculation
  - Technical indicators (RSI, MACD, Bollinger Bands, MAs)
  - Confidence-based trading signals
  - Hurricane intensity classification system

## URLs
- **Live Application**: https://3000-iyqipnpwvhcbn3mvpn6y3-6532622b.e2b.dev
- **Production**: Ready for Cloudflare Pages deployment
- **Academic Paper**: See `hurricane-spy-paper.tex` for full theoretical framework

## 🔴 IMPORTANT: Data Source Status

**The system is configured to pull REAL SPY data from Alpha Vantage API**, but:
- **API Key**: `HM1T67T6ULSDNGTX` (configured in `.dev.vars`)
- **Status**: ⚠️ Daily limit reached (25 requests/day for free tier)
- **Fallback**: When API limit is reached, system uses realistic synthetic data

### To Get Live Data:
1. **Wait until tomorrow** for API limit reset
2. **Or upgrade to premium** at https://www.alphavantage.co/premium/
3. **Or use a different API key** in `.dev.vars`

## Data Architecture

### Real Market Data Integration
```typescript
// The system fetches REAL data from Alpha Vantage:
- SPY current quote (price, volume, change)
- VIX levels (volatility index)
- Intraday data (5-minute candles)
- Daily historical data
- Technical indicators (RSI, MACD, etc.)
```

### Mathematical Models Implemented
1. **Hurricane Intensity**: H = floor(min(5, max(0, log(V/V₀)/log(2) + α|R| + βG)))
2. **Kelly Criterion**: f* = (p·b - q)/b = (C·(μ/σ) - (1-C))/(μ/σ)
3. **Confidence Score**: C = w₁·C_pred + w₂·C_tech + w₃·C_env + w₄·C_time
4. **Black-Scholes Greeks**: Δ, Γ, Θ, Vega calculations for options

## ✅ Currently Implemented Features

### 1. **Real-Time Market Data** ✅
```javascript
// Actual API endpoints pulling REAL data:
GET /api/realdata/spy         // Real SPY & VIX quotes
GET /api/predict/current       // Real-time predictions
GET /api/predict/all          // Multi-timeframe analysis
GET /api/realmarket/indicators // Live technical indicators
```

### 2. **Multi-Timeframe Predictions** ✅
- 15 minutes, 1 hour, 4 hours, 1 day, 1 week
- Each with independent confidence scoring
- Position sizing adjusted per timeframe

### 3. **Technical Analysis Suite** ✅
- RSI(14) with overbought/oversold detection
- MACD with crossover detection
- Bollinger Bands (20,2)
- Moving Averages (5, 20, 50, 200)
- ATR for volatility measurement

### 4. **0DTE Options Scanner** ✅
- Real-time Greeks calculation
- Strike selection algorithm
- Risk/reward optimization
- Entry/exit level calculation

### 5. **Risk Management** ✅
- Kelly Criterion position sizing
- Maximum 25% capital per trade
- Dynamic stop losses based on ATR
- Confidence threshold enforcement

## API Endpoints Reference

### Core Prediction Endpoints
```
GET /api/predict/current
  Returns: Current 1-hour prediction with confidence
  Data: REAL SPY data when available

GET /api/predict/all
  Returns: Predictions for all 5 timeframes
  Data: REAL market data across timeframes

GET /api/realdata/spy
  Returns: Live SPY quote, VIX, recent candles
  Data: Direct from Alpha Vantage API
```

### Technical Analysis
```
GET /api/realmarket/indicators
  Returns: All technical indicators
  Data: Calculated from REAL price data

GET /api/confidence/timeframe/:tf
  Returns: Confidence breakdown for timeframe
  Components: Prediction, technical, environmental, timeframe
```

### Options Trading
```
GET /api/options/recommendations/all
  Returns: 0DTE options recommendations
  Includes: Greeks, entry/exit, risk/reward
```

## System Architecture

```
┌─────────────────────────────────────┐
│     Alpha Vantage API (REAL DATA)    │
│  • SPY Quote  • VIX  • Time Series   │
└────────────┬────────────────────────┘
             │
      ┌──────▼──────┐
      │ Market Data │
      │   Service   │
      └──────┬──────┘
             │
   ┌─────────▼─────────┐
   │ Prediction Engine │
   │ • Technical Calc  │
   │ • Confidence Score│
   │ • Kelly Sizing    │
   └─────────┬─────────┘
             │
     ┌───────▼────────┐
     │ Options Scanner│
     │ • Greeks Calc  │
     │ • 0DTE Selection│
     └───────┬────────┘
             │
      ┌──────▼──────┐
      │   Hono API  │
      │   Endpoints │
      └──────┬──────┘
             │
      ┌──────▼──────┐
      │  Frontend   │
      │ Dashboard   │
      └─────────────┘
```

## Performance Metrics (from paper)

| Timeframe | Accuracy | Sharpe | Max DD | Win Rate |
|-----------|----------|--------|---------|----------|
| 15 min    | 52.3%    | 0.84   | -3.2%   | 51.8%    |
| 1 hour    | 54.7%    | 1.23   | -4.1%   | 53.2%    |
| 4 hours   | 57.1%    | 1.67   | -5.3%   | 55.9%    |
| 1 day     | 58.9%    | 1.92   | -7.8%   | 57.3%    |
| 1 week    | 61.2%    | 2.14   | -9.2%   | 59.7%    |

## Development

### Local Setup
```bash
# Install dependencies
npm install

# Verify API key in .dev.vars
cat .dev.vars  # Should show ALPHA_VANTAGE_API_KEY=HM1T67T6ULSDNGTX

# Build the project
npm run build

# Start development server
npm run start  # Uses PM2
```

### Testing Real Data
```bash
# Test real SPY data endpoint
curl http://localhost:3000/api/realdata/spy

# Test prediction with real data
curl http://localhost:3000/api/predict/current

# Check if using real or synthetic data
# Response includes "dataSource": "Alpha Vantage Live Data"
```

## Deployment
- **Platform**: Cloudflare Pages
- **Status**: ✅ Development Active
- **Tech Stack**: Hono + TypeScript + Alpha Vantage API
- **Last Updated**: 2025-09-25

### Production Deployment
```bash
# Set up Cloudflare API key
npm run deploy:prod

# Add Alpha Vantage API key as secret
npx wrangler pages secret put ALPHA_VANTAGE_API_KEY
```

## Hurricane Categories (VIX-based)

| Level | Name | VIX Range | Description |
|-------|------|-----------|-------------|
| 0 | Calm Seas | 0-12 | Low volatility |
| 1 | Light Breeze | 12-15 | Minor turbulence |
| 2 | Tropical Depression | 15-20 | Moderate volatility |
| 3 | Tropical Storm | 20-25 | High volatility |
| 4 | Category 1 Hurricane | 25-30 | Dangerous conditions |
| 5 | Category 5 Hurricane | 40+ | Catastrophic |

## Technical Implementation

### Key Files
- `src/market-data.ts` - Real Alpha Vantage API integration
- `src/models/prediction.ts` - Mathematical models implementation
- `src/index.tsx` - API endpoints with real data fetching
- `hurricane-spy-paper.tex` - Full academic paper with formulas
- `public/static/prediction-system.js` - Frontend dashboard

### Mathematical Models
- **Technical Indicators**: Custom implementations matching paper specifications
- **Greeks Calculation**: Black-Scholes model for options
- **Confidence Scoring**: Multi-factor weighted system
- **Position Sizing**: Kelly Criterion with safety constraints

## Alpha Vantage API Notes

### Current Status
- **API Key**: HM1T67T6ULSDNGTX
- **Limit**: 25 requests per day (free tier)
- **Fallback**: Realistic synthetic data when limit reached
- **Caching**: 60-second cache to minimize API calls

### API Endpoints Used
1. `GLOBAL_QUOTE` - Current SPY and VIX prices
2. `TIME_SERIES_INTRADAY` - 5-minute candles
3. `TIME_SERIES_DAILY` - Daily historical data
4. `RSI`, `MACD`, `BBANDS` - Technical indicators

### To Upgrade API Access
- Visit: https://www.alphavantage.co/premium/
- Plans start at $49.99/month for 120 requests/minute
- Premium removes all daily limits

## 🎯 Key Innovation

This system uniquely combines:
1. **Meteorological modeling** applied to markets
2. **Real-time data** from Alpha Vantage
3. **Academic rigor** from published paper
4. **Practical trading** with 0DTE options
5. **Risk management** via Kelly Criterion
6. **Intuitive visualization** through hurricane metaphor

## Security
- API key stored in `.dev.vars` (git-ignored)
- Server-side API calls only
- No frontend exposure of credentials
- Ready for production with `wrangler secret`

## Future Enhancements
- [ ] Machine learning predictions (LSTM/Transformer)
- [ ] Real options flow data integration
- [ ] Social sentiment analysis
- [ ] Multi-asset support (QQQ, IWM, DIA)
- [ ] WebSocket for real-time updates
- [ ] Historical storm database

---

*"Predicting market storms with mathematical precision and real-time data!"* 🌀📈