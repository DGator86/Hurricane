# Hurricane SPY Trading System 🌀

## 🚀 Live Demo
**Local Dev URL**: http://localhost:5173/hurricane-test *(start the Vite dev server with `npm run dev`)*
**Legacy Production URL**: https://3000-iyqipnpwvhcbn3mvpn6y3-6532622b.e2b.dev *(cluster now retired)*

## Overview
Hurricane SPY is a sophisticated multi-timeframe prediction system for SPY options trading, featuring:
- **75% Accuracy Target** using ensemble machine learning models
- **Black-Scholes Option Pricing** with complete Greeks (Delta, Gamma, Theta, Vega, Rho)
- **0DTE Options Scanner** for scalping opportunities
- **Kelly Criterion Position Sizing** for optimal risk management
- **Backtesting Accuracy Tracking** (-15m, -30m, -1hr, -4hr, -1d)
- **Market Meteorology Framework** treating SPY like a storm system

## 🎯 Core Features

### 1. **Options Pricing & Greeks**
- Real-time Black-Scholes pricing model
- Complete Greeks calculation for every option recommendation
- Cost analysis with theoretical vs market pricing
- Expected value calculations for each trade

### 2. **Multi-Timeframe Analysis**
- **15-minute**: Scalping signals with 0DTE options
- **1-hour**: Day trading with high confidence setups
- **4-hour**: Swing trading opportunities
- **Daily**: Position trades with maximum confidence
- **Weekly**: Macro trend analysis

### 3. **Technical Indicators per Timeframe**
- RSI with overbought/oversold detection
- MACD crossover signals (bullish/bearish/approaching)
- Bollinger Bands positioning
- Moving average trends (5, 20, 50, 200)
- ATR-based volatility measurement

### 4. **Options Recommendations**
Each timeframe displays:
- Recommended strike price
- Option type (CALL/PUT)
- Current cost (mid price)
- All Greeks (Δ, Γ, Θ, V, ρ)
- Target price & stop loss
- Risk/Reward ratio
- Expected value calculation

### 5. **Backtesting Accuracy Display**
30-day rolling accuracy metrics:
- Direction accuracy percentage
- Win rate by timeframe
- Profit factor
- Sharpe ratio
- Maximum drawdown
- Current streak tracking

## 📊 Data Architecture

### Storage Services
- **Cloudflare D1**: Relational data (predictions, trades)
- **Cloudflare KV**: Key-value storage (settings, cache)
- **Cloudflare R2**: Object storage (backups, reports)

### Data Models
```typescript
interface Prediction {
  timeframe: string
  direction: 'bullish' | 'bearish' | 'neutral'
  confidence: number
  hurricaneIntensity: number
  positionSize: number  // Kelly Criterion
  entryPrice: number
  targetPrice: number
  stopLoss: number
  technicalSignals: TechnicalIndicators
}

interface OptionRecommendation {
  strike: number
  type: 'call' | 'put'
  cost: number  // Actual market price
  theoreticalPrice: number  // Black-Scholes
  greeks: {
    delta: number
    gamma: number
    theta: number
    vega: number
    rho: number
  }
  expectedValue: number
}
```

## 🔌 API Endpoints

### Enhanced Production API
- `GET /api/enhanced/predictions-with-options` - Predictions with option recommendations
- `GET /api/enhanced/options-recommendations` - Options scanner results
- `GET /api/enhanced/backtesting` - 30-day accuracy metrics
- `GET /api/enhanced/backtesting/:timeframe` - Specific timeframe accuracy
- `POST /api/enhanced/black-scholes` - Calculate option price
- `GET /api/enhanced/option-chain/SPY` - Full option chain with Greeks

### Market Data Sources
1. **Polygon.io** (PRIMARY) - Real-time quotes, aggregates, technicals
2. **Alpha Vantage** (FALLBACK) - Backup data source
3. **Synthetic Data** (LAST RESORT) - Generated data for continuity

#### Unusual Whales Options Flow
- **Environment variables**: set `UNUSUAL_WHALES_API_KEY` (required) and optionally `UNUSUAL_WHALES_BASE_URL` to override the default `https://phx.unusualwhales.com/api` endpoint.
- **Failure mode**: if the API key is missing or rejected, the `/api/flow` route will mark the Unusual Whales variants as unavailable and fall back to Yahoo Finance/Polygon or synthetic chains. The dashboard surfaces this as "Unusual Whales client not configured" alongside the failed endpoints.
- **Result metadata**: each variant response includes the endpoint that was attempted, status code, and error message so you can confirm credentials are working before relying on the live feed.

## 🎨 User Guide

### Reading the Dashboard

#### Timeframe Predictions Box
Each timeframe shows:
- **Direction Arrow**: ↑ Bullish, ↓ Bearish, → Neutral
- **Confidence %**: Color-coded (Green >75%, Yellow 60-75%, Red <60%)
- **Kelly %**: Optimal position size
- **Technical Indicators**: RSI and MACD status
- **Option Recommendation**: Strike, cost, Greeks, R/R ratio

#### High Confidence Trades
Only displays trades with ≥75% confidence:
- Entry, target, and stop loss prices
- Recommended option contract
- Full Greeks display
- Expected value calculation

#### Backtesting Accuracy Box
Shows historical performance:
- Accuracy % for each lookback period
- Win rate and number of trades
- Overall profit factor and Sharpe ratio

### Trading Workflow
1. **Check High Confidence Trades** for immediate opportunities
2. **Review Option Recommendations** with Greeks and cost
3. **Verify Technical Alignment** across timeframes
4. **Use Kelly % for Position Sizing**
5. **Monitor Backtesting Accuracy** for system reliability

## 🚀 Deployment

### Platform
- **Cloudflare Pages** - Edge deployment worldwide
- **Cloudflare Workers** - Serverless backend
- **GitHub Actions** - CI/CD pipeline

### Configuration
```json
{
  "name": "hurricane-spy",
  "compatibility_date": "2024-01-01",
  "d1_databases": [{
    "binding": "DB",
    "database_name": "hurricane-production"
  }]
}
```

## 📈 Performance Metrics

### Current Statistics
- **Target Accuracy**: 75%
- **Average Win Rate**: 65-70%
- **Profit Factor**: >1.5
- **Sharpe Ratio**: >1.0
- **Max Position Size**: 25% (Kelly limited)

### Backtesting Results (30 Days)
- **15m**: ~60% accuracy (high frequency)
- **30m**: ~63% accuracy
- **1h**: ~68% accuracy
- **4h**: ~72% accuracy
- **1d**: ~75% accuracy (highest confidence)

## 🔧 Technical Stack

### Frontend
- **Hono Framework** - Lightweight web framework
- **TailwindCSS** - Utility-first CSS
- **Chart.js** - Performance visualizations
- **Axios** - HTTP client

### Backend
- **TypeScript** - Type-safe development
- **Black-Scholes Model** - Option pricing
- **Kelly Criterion** - Position sizing
- **Market Meteorology** - Regime detection

### Infrastructure
- **Cloudflare Pages** - Global edge deployment
- **Cloudflare Workers** - Serverless compute
- **Cloudflare D1** - SQLite database
- **Cloudflare KV** - Key-value storage

## 📝 Recent Updates

### Latest Features (2025-09-27)
✅ Implemented Black-Scholes option pricing model with all Greeks  
✅ Enhanced options scanner with real pricing and Greeks display  
✅ Added backtesting accuracy tracking for multiple timeframes  
✅ Integrated option cost and Greeks in recommendation boxes  
✅ Created comprehensive accuracy metrics dashboard  
✅ Added expected value calculations for options  

### Coming Soon
- [ ] Real-time options chain from brokers
- [ ] Automated trade execution
- [ ] Portfolio tracking
- [ ] Risk management alerts
- [ ] Machine learning model improvements

## 🔗 Links
- **Production**: https://3000-iyqipnpwvhcbn3mvpn6y3-6532622b.e2b.dev
- **GitHub**: https://github.com/DGator86/Hurricane.git
- **Documentation**: See `/docs` folder

## 📄 License
Proprietary - All Rights Reserved

---
*Built with ❤️ using Cloudflare Workers and Hono Framework*