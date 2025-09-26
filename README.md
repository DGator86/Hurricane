# Hurricane SPY Prediction System

## Project Overview
- **Name**: Hurricane SPY Trading System
- **Goal**: Achieve 75%+ accuracy in SPY price predictions using ensemble methods
- **Current Accuracy**: ~27% (needs improvement toward 75% goal)
- **Features**: Multi-timeframe predictions, Kelly criterion position sizing, technical analysis, options flow analysis

## URLs
- **Local Development**: http://localhost:3000
- **API Endpoint**: http://localhost:3000/api/hurricane/prediction
- **GitHub**: https://github.com/DGator86/Hurricane.git

## Latest Updates (September 26, 2025)

### ✅ FIXED: ATR Calculation Issues
- **Problem**: ATR targets were only $0.03 from entry, preventing proper R-multiple calculations
- **Solution**: 
  - Implemented timeframe-specific ATR calculations
  - Added minimum ATR percentages (0.05% to 0.75%)
  - Increased target multipliers (1.5x to 5x ATR)
  - Now using 1 ATR for stop loss (standard risk management)
- **Result**: Targets now properly spaced ($0.82 to $29.62 depending on timeframe)

### ✅ IMPROVED: Signal Diversity
- Added RSI neutral zones (40-60 range) for more nuanced signals
- Enhanced time-based patterns for intraday trading
- Implemented regime-specific directional bias
- Adjusted signal thresholds for better diversity

### 📊 Current Performance Metrics
- **Confidence Levels**: 20-50% (improved from 0-15%)
- **Risk:Reward Ratios**: 
  - 1m: 1.5:1 (scalping)
  - 1h: 3.0:1 (day trading)
  - 1d: 5.0:1 (swing trading)
- **Direction Accuracy**: Still showing mostly NEUTRAL (needs adjustment)

## Data Architecture
- **Primary Data**: Yahoo Finance (FREE intraday data)
- **Fallback Data**: Polygon.io API
- **Storage**: In-memory caching with TTL
- **Technical Indicators**: RSI, MACD, Bollinger Bands, ADX, ATR, Stochastic, OBV, VWAP
- **Options Metrics**: GEX, DIX, Put/Call Ratio (currently estimated)

## Features Implemented
- ✅ Yahoo Finance integration for free intraday data
- ✅ Multi-timeframe analysis (1m, 5m, 15m, 1h, 4h, 1d)
- ✅ 100+ feature extraction system
- ✅ Technical indicator suite with crossover detection
- ✅ Kelly criterion position sizing
- ✅ Confidence scoring system
- ✅ ATR-based target and stop calculations
- ✅ Risk:Reward ratio calculations
- ✅ Market regime detection
- ✅ Warning system for extreme conditions

## Features Not Yet Implemented
- ❌ Actual options flow data (using estimates)
- ❌ Machine learning model training
- ❌ Historical backtesting validation
- ❌ 0DTE options scanner
- ❌ Real-time WebSocket updates
- ❌ Database persistence (using Cloudflare D1)

## Recommended Next Steps
1. **Improve Signal Strength**: Adjust thresholds to generate more BUY/SELL signals instead of NEUTRAL
2. **Integrate Real Options Data**: Connect to CBOE or other options data provider
3. **Backtest Validation**: Run comprehensive backtesting to validate predictions
4. **ML Model Training**: Train on collected predictions to optimize weights
5. **Add Database**: Implement Cloudflare D1 for persistent storage
6. **Deploy to Production**: Deploy to Cloudflare Pages for live trading

## API Endpoints
- `GET /api/hurricane/prediction` - Get comprehensive predictions with all timeframes
- `GET /api/predict/current` - Legacy prediction endpoint
- `GET /api/realdata/spy` - Get real SPY data from Yahoo Finance
- `GET /api/backtest/:days` - Run backtesting for specified days
- `GET /api/accuracy/:days/report` - Get accuracy report

## User Guide
1. **Start the service**: `pm2 start ecosystem.config.cjs`
2. **Access dashboard**: http://localhost:3000
3. **Get predictions**: `curl http://localhost:3000/api/hurricane/prediction`
4. **View logs**: `pm2 logs webapp --nostream`

## Deployment
- **Platform**: Cloudflare Pages
- **Status**: Development (Local)
- **Tech Stack**: Hono + TypeScript + TailwindCSS
- **Runtime**: Cloudflare Workers
- **Last Updated**: September 26, 2025

## Technical Details

### Hurricane Feature Extraction (100+ features)
- Price metrics (OHLCV, changes)
- Moving averages (SMA, EMA - multiple periods)
- Momentum indicators (RSI, MACD, Stochastic)
- Volatility metrics (ATR, Bollinger Bands)
- Volume analysis (OBV, volume ratios)
- Options flow (GEX, DIX, Put/Call ratio)
- Market internals (VIX, breadth)
- Support/Resistance levels
- Fibonacci retracements
- Time-based features

### Prediction Model
- Multi-factor weighted signal system
- 30% Momentum, 25% Trend, 20% Volume, 15% Volatility, 15% Options
- Regime-based adjustments
- Confidence boosting based on signal agreement
- Kelly criterion for position sizing

### Known Issues
- **Low Confidence**: Most predictions showing 20-50% confidence
- **Direction Bias**: Too many NEUTRAL signals, need more directional strength
- **Options Data**: Using estimated values, need real options flow
- **API Limits**: Twelve Data limit exhausted (3224/800 calls)