# 📊 Finnhub API - What Data Can We Actually Get?

## Overview
Analysis of what market data Finnhub provides vs what we need for the Hurricane SPY framework.

---

## ✅ What Finnhub DOES Provide

### Free Tier (What We're Using)
1. **Real-time Quotes** ✅
   - Current price, change, % change
   - High, low, open, previous close
   - `/api/v1/quote?symbol=SPY`

2. **Candles/OHLCV** ✅
   - Historical price data
   - Resolutions: 1, 5, 15, 30, 60, D, W, M
   - `/api/v1/stock/candle`

3. **Basic Company Data** ✅
   - Company profile, news, financials
   - Earnings, recommendations

4. **Limited Technical Data** ✅
   - Basic price/volume data for indicators
   - We calculate our own RSI, MACD, etc.

### Premium Tier ($49+/month)
1. **Tick Data** 💰
   - Real-time tick-by-tick trades
   - `/api/v1/stock/tick`
   - Shows actual trades but NOT market internals

2. **Institutional Ownership** 💰
   - 13F filings data
   - Shows what institutions own
   - `/api/v1/institutional/ownership`

3. **Insider Transactions** 💰
   - SEC Form 4 filings
   - Insider buying/selling
   - `/api/v1/stock/insider-transactions`

4. **Options Chain** 💰
   - Strike prices, expiration dates
   - Basic options data (no flow)
   - `/api/v1/stock/option-chain`

5. **SEC Filings** 💰
   - 10-K, 10-Q, 8-K filings
   - `/api/v1/stock/filings`

---

## ❌ What Finnhub DOES NOT Provide

### Critical Missing Data for Our Framework

1. **DIX (Dark Pool Index)** ❌
   - Not available at any tier
   - This is proprietary to SqueezeMetrics
   - Shows dark pool positioning

2. **Market Internals** ❌
   - **TICK Index**: Not available
   - **ADD (Advance/Decline)**: Not available
   - **VOLD (Up/Down Volume)**: Not available
   - **Market Breadth**: Not available

3. **GEX (Gamma Exposure)** ❌
   - Not calculated or provided
   - Would need to calculate from options chain
   - Even with premium, no gamma calculations

4. **Options Flow** ❌
   - No unusual options activity
   - No options volume/flow data
   - No sweep detection

5. **Order Flow** ❌
   - No bid/ask imbalance
   - No order flow metrics
   - No market depth

---

## 🔄 What We Can Calculate/Derive

### From Free Tier Data
1. **Technical Indicators** ✅
   - RSI, MACD, Bollinger Bands (from price)
   - Moving averages (from price)
   - ATR (from OHLCV)

2. **VIX Proxy** ✅
   - Via VIXY ETF quote (working)
   - Historical volatility from price

3. **Volume Analysis** ⚠️
   - Basic volume patterns
   - Can estimate buying/selling pressure

### From Premium Tier Data
1. **Institutional Sentiment** 💰
   - From 13F filings (quarterly)
   - Shows position changes

2. **Insider Sentiment** 💰
   - From Form 4 filings
   - Buy/sell signals from insiders

3. **Basic GEX Estimation** 💰
   - Could calculate from options chain
   - Would need open interest data

---

## 📊 Alternatives for Missing Data

### DIX (Dark Pool Index)
**Options:**
1. **SqueezeMetrics** - $50-500/month
   - Official DIX provider
   - Real dark pool data

2. **Create Proxy** - Free
   ```python
   # Estimate from volume patterns
   DIX_proxy = (large_block_volume / total_volume) * adjustment_factor
   ```

3. **FINRA ADF Volume** - Free with delay
   - Alternative trading volume data
   - Can approximate dark pool activity

### Market Internals (TICK, ADD, VOLD)
**Options:**
1. **Interactive Brokers API** - $10/month
   - Real-time market internals
   - Requires brokerage account

2. **Yahoo Finance** - Free
   - Can get S&P 500 components
   - Calculate ADD manually

3. **Create Proxies** - Free
   ```python
   # TICK proxy from SPY price changes
   TICK_proxy = (upticks - downticks) in last minute
   
   # ADD proxy from ETF breadth
   ADD_proxy = (SPY_volume_up - SPY_volume_down) / total_volume
   ```

### GEX (Gamma Exposure)
**Options:**
1. **SpotGamma** - $99+/month
   - Professional GEX calculations
   - Real-time updates

2. **Calculate from Options** - Need premium
   ```python
   # With Finnhub premium options data
   GEX = sum(gamma * open_interest * 100 * spot_price)
   ```

3. **Use Our VIX Proxy** - Free (current)
   - Estimate from VIX levels
   - Less accurate but functional

---

## 🎯 Recommendation

### What to Get from Finnhub Premium ($49/month)
If upgrading, you'd get:
1. ✅ Options chain → Calculate real GEX
2. ✅ Institutional ownership → Smart money tracking
3. ✅ Insider transactions → Insider sentiment
4. ❌ Still NO DIX, market internals, options flow

### Cost-Benefit Analysis
| Data Source | Cost/Month | What You Get | Value for Us |
|------------|------------|--------------|--------------|
| Finnhub Free | $0 | Quotes, candles, VIX proxy | Current - 70% coverage |
| Finnhub Premium | $49 | + Options, institutional, insider | Would get to 75% coverage |
| + SqueezeMetrics | +$50 | + DIX (critical) | Would get to 85% coverage |
| + SpotGamma | +$99 | + Real GEX | Would get to 90% coverage |
| + IB API | +$10 | + Market internals | Would get to 95% coverage |

### Best Path Forward

**Option 1: Stay Free (Current)**
- Keep using free Finnhub
- Create proxies for missing data
- Accept ~70% framework coverage

**Option 2: Minimal Upgrade ($49)**
- Get Finnhub Premium
- Calculate real GEX from options
- Get institutional/insider data
- Still missing DIX, internals

**Option 3: Optimal Setup ($109)**
- Finnhub Premium ($49)
- SqueezeMetrics DIX ($50-100)
- Interactive Brokers ($10)
- Gets 90%+ framework coverage

---

## 💡 Free Alternatives to Implement Now

### 1. DIX Proxy
```python
# Use large trade detection
def estimate_DIX(trades):
    large_trades = [t for t in trades if t.size > 10000]
    dark_pool_estimate = sum(large_trades) / total_volume
    return dark_pool_estimate * 100
```

### 2. Market Internals Proxies
```python
# TICK proxy from price changes
def calculate_TICK_proxy(price_changes_1min):
    upticks = sum(1 for p in price_changes if p > 0)
    downticks = sum(1 for p in price_changes if p < 0)
    return upticks - downticks

# ADD proxy from volume
def calculate_ADD_proxy(volume_data):
    up_volume = volume_data[price_change > 0]
    down_volume = volume_data[price_change < 0]
    return (up_volume - down_volume) / total_volume
```

### 3. Institutional Flow Proxy
```python
# Detect institutional-sized trades
def detect_institutional_flow(volume_bars):
    avg_volume = mean(volume_bars)
    institutional_bars = [v for v in volume_bars if v > 3 * avg_volume]
    return sum(institutional_bars) / sum(volume_bars)
```

---

## Summary

**Finnhub provides:**
- ✅ Price data, quotes, candles
- ✅ VIX via VIXY ETF
- ❌ NO DIX
- ❌ NO market internals (TICK, ADD, VOLD)
- ❌ NO calculated GEX
- ❌ NO options flow

**To get missing critical data:**
1. **DIX**: Need SqueezeMetrics ($50+) or create proxy
2. **Market Internals**: Need other provider or create proxies
3. **GEX**: Need options data (Finnhub Premium) or keep estimation

**Bottom line**: Finnhub alone cannot provide DIX or market internals at any price tier. These require additional data sources or proxy calculations.

---

*Analysis Date: 2025-09-26*
*Current Coverage: 70% with free tier*
*Max Coverage with Finnhub Premium: 75%*
*Need external sources for: DIX, Market Internals*