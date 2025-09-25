# 🌀 SPY Hurricane Tracker - Market Storm Analysis System

## Project Overview
- **Name**: SPY Hurricane Tracker
- **Goal**: Track S&P 500 (SPY) volatility using weather/hurricane metaphors for market conditions
- **Concept**: Treats market volatility like meteorological storms, providing intuitive visualization of market turbulence
- **Features**: 
  - Real-time SPY and VIX tracking with hurricane-style categorization
  - Storm intensity visualization with animated hurricane eye
  - Market pressure systems and volatility radar
  - Historical storm tracking and pattern analysis
  - Weather-inspired metrics (wind speed, pressure, temperature)

## URLs
- **Live Application**: https://3000-iyqipnpwvhcbn3mvpn6y3-6532622b.e2b.dev
- **Production**: Will be available after Cloudflare Pages deployment
- **GitHub**: Not yet configured

## 🌪️ Storm Categories

| Category | VIX Range | Description | Wind Speed | Market Condition |
|----------|-----------|-------------|------------|------------------|
| **Calm Seas** | 0-12 | Smooth sailing | 0-10 mph | Low volatility, stable markets |
| **Light Breeze** | 12-15 | Minor turbulence | 10-25 mph | Normal market fluctuations |
| **Tropical Depression** | 15-20 | Moderate volatility | 25-40 mph | Increased uncertainty |
| **Tropical Storm** | 20-25 | High volatility | 40-75 mph | Caution advised |
| **Category 1 Hurricane** | 25-30 | Dangerous conditions | 75-95 mph | Significant market stress |
| **Category 2 Hurricane** | 30-40 | Extreme volatility | 95-110 mph | Severe market turmoil |
| **Category 5 Hurricane** | 40+ | CATASTROPHIC | 157+ mph | Market crash conditions |

## Data Architecture
- **Primary Data**: SPY (S&P 500 ETF) real-time and historical prices
- **Volatility Index**: VIX (CBOE Volatility Index) - "Fear Gauge"
- **Data Source**: Alpha Vantage Financial API
- **Update Frequency**: Auto-refresh every 60 seconds
- **Storage**: No persistent storage (real-time API analysis)

## ✅ Currently Implemented Features

### 1. **Real-Time Market Hurricane Tracking**
   - Live SPY price and change monitoring
   - VIX level tracking with storm categorization
   - Volume surge detection
   - Automatic storm alerts for dangerous conditions

### 2. **Hurricane Eye Visualization**
   - Animated hurricane eye with intensity percentage
   - Dynamic color coding based on storm level
   - Pulsing effects that intensify with volatility

### 3. **Market Radar System**
   - 6-axis radar chart showing:
     - Volatility levels
     - Volume metrics
     - Momentum indicators
     - Fear index
     - Put/Call ratios (simulated)
     - Market breadth (simulated)

### 4. **Dual-Axis Volatility Chart**
   - SPY price tracking (blue line)
   - VIX fear index (red line)
   - 20-day historical comparison

### 5. **Market Pressure Systems**
   - Buy pressure percentage
   - Sell pressure percentage
   - Market equilibrium indicator

### 6. **Weather-Inspired Metrics**
   - **Market Temperature**: Based on price momentum (°F)
   - **Wind Speed**: Derived from VIX levels (mph)
   - **Atmospheric Pressure**: Inverse of volatility (mb)
   - **Visibility**: Based on volume clarity (miles)

### 7. **Storm Timeline**
   - Historical significant moves (>2% changes)
   - Date, magnitude, and direction tracking
   - Visual indicators for storm severity

### 8. **Interactive Controls**
   - Scan Market Conditions button
   - Historical Storms viewer (placeholder)
   - Storm Forecast predictor (placeholder)

## API Endpoints

### Functional URIs

1. **GET /** 
   - Main hurricane tracker dashboard

2. **GET /api/spy/current**
   - Returns current SPY and VIX quotes
   - Response: `{ spy: {...}, vix: {...} }`

3. **GET /api/spy/intraday**
   - 5-minute interval data for SPY
   - Used for detailed storm tracking

4. **GET /api/spy/daily**
   - Daily historical data for trend analysis
   - Powers the volatility chart

5. **GET /api/spy/volatility**
   - Bollinger Bands volatility analysis
   - Technical volatility indicators

6. **GET /api/market/indicators**
   - RSI and MACD indicators
   - Response: `{ rsi: {...}, macd: {...} }`

## User Guide

### Understanding the Hurricane Tracker

1. **Storm Categories**: The system automatically categorizes market conditions based on VIX levels
2. **Hurricane Eye**: The center visualization shows storm intensity as a percentage
3. **Color Coding**: 
   - Green = Safe conditions
   - Yellow = Caution
   - Orange = Elevated risk
   - Red = Dangerous
   - Purple = Catastrophic

### Reading the Radar
- Each axis represents a different market metric
- The red area shows current conditions
- The green circle represents the "safe zone"
- Expansion beyond the safe zone indicates increasing storm conditions

### Weather Metrics Interpretation
- **Temperature > 80°F**: Market is heating up (high momentum)
- **Wind Speed > 40 mph**: Entering storm conditions
- **Pressure < 1000 mb**: Low pressure system (high volatility)
- **Visibility < 5 mi**: Unclear market conditions

### Alert System
- Automatic alerts trigger for Category 3+ storms (VIX > 20)
- Alert banner appears at top with storm details
- Hurricane eye animation speeds up with intensity

## Technical Stack
- **Backend**: Hono Framework on Cloudflare Workers
- **Frontend**: Vanilla JavaScript with Chart.js
- **Styling**: TailwindCSS with custom animations
- **API**: Alpha Vantage Financial Data API
- **Runtime**: Cloudflare Pages/Workers
- **Real-time Updates**: 60-second auto-refresh cycle

## Development

### Local Setup
```bash
# Install dependencies
npm install

# Create .dev.vars file with your API key
echo "ALPHA_VANTAGE_API_KEY=your_key_here" > .dev.vars

# Build the project
npm run build

# Start development server
npm run start  # Uses PM2
```

### Available Scripts
- `npm run build` - Build for production
- `npm run start` - Start with PM2
- `npm run restart` - Restart application
- `npm run logs` - View application logs
- `npm run deploy` - Deploy to Cloudflare Pages

## Deployment
- **Platform**: Cloudflare Pages
- **Status**: ✅ Active (Development)
- **Tech Stack**: Hono + TypeScript + TailwindCSS + Chart.js
- **Last Updated**: 2025-09-25

### Production Deployment
1. Set up Cloudflare API key in Deploy tab
2. Run `npm run deploy:prod`
3. Add Alpha Vantage API key: `npx wrangler pages secret put ALPHA_VANTAGE_API_KEY`

## 🚀 Features Not Yet Implemented
- [ ] Real RSI and MACD integration for storm prediction
- [ ] Actual Put/Call ratio data
- [ ] Market breadth indicators
- [ ] Historical storm database with major market events
- [ ] Storm prediction ML model
- [ ] Options flow analysis
- [ ] Sector rotation hurricane paths
- [ ] Multi-asset storm tracking (QQQ, IWM, DIA)
- [ ] Storm alerts via webhook/email
- [ ] Dark pools activity as "underground pressure"

## Recommended Next Steps
1. **Integrate real Put/Call ratios** from CBOE data
2. **Add sector rotation visualization** as hurricane paths
3. **Implement storm prediction** using technical indicators
4. **Create historical storm database** of major market events
5. **Add sound effects** for different storm levels
6. **Implement data persistence** with Cloudflare D1 for storm history
7. **Add portfolio impact calculator** for storm damage assessment
8. **Create API for storm alerts** to external services

## Innovation Highlights
- **Unique Visualization**: First-of-its-kind hurricane metaphor for market volatility
- **Intuitive Interface**: Complex market data presented in weather terms everyone understands
- **Real-time Analysis**: Automatic categorization and alert system
- **Educational Value**: Makes market volatility accessible to non-traders
- **Psychological Insight**: VIX as "fear gauge" visualized as storm intensity

## Alpha Vantage API Notes
- Free tier: 25 requests per day
- The tracker makes ~5 API calls per refresh
- Consider caching for production deployment
- Upgrade API tier for more frequent updates

## Security
- API key stored securely in environment variables
- All API calls made server-side through Hono
- No sensitive data exposed to frontend

---

*"When the markets get stormy, track them like a hurricane!"* 🌀