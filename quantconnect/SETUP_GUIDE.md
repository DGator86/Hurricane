# 🚀 QuantConnect Integration Guide for Hurricane SPY

## Overview
This guide shows how to connect your QuantConnect account to the Hurricane SPY prediction system for automated trading and backtesting.

## 📡 API Endpoints

Your Hurricane system provides these endpoints for QuantConnect:

### Base URL
```
https://3000-iyqipnpwvhcbn3mvpn6y3-6532622b.e2b.dev/api/quantconnect
```

### Available Endpoints

#### 1. Get Current Predictions
```python
GET /api/quantconnect/predictions/current
```
Returns all timeframe predictions with option recommendations.

#### 2. Get Specific Timeframe
```python
GET /api/quantconnect/predictions/1h
```
Timeframes: 1m, 5m, 15m, 1h, 4h, 1d

#### 3. Submit Trade Execution
```python
POST /api/quantconnect/trades/execute
```

#### 4. Update Trade Result
```python
POST /api/quantconnect/trades/{trade_id}/result
```

#### 5. Get Historical Predictions
```python
GET /api/quantconnect/historical/2024-01-15
```

## 🔧 QuantConnect Setup

### Step 1: Create New Algorithm
1. Log into QuantConnect
2. Create new algorithm
3. Select Python as language
4. Name it "HurricaneSPY"

### Step 2: Add the Integration Code

```python
# HurricaneSPY.py
from AlgorithmImports import *
import requests
import json

class HurricaneSPYAlgorithm(QCAlgorithm):
    def Initialize(self):
        self.SetStartDate(2024, 1, 1)
        self.SetCash(100000)
        
        # Hurricane API
        self.api_base = "https://3000-iyqipnpwvhcbn3mvpn6y3-6532622b.e2b.dev"
        
        # Add SPY
        self.spy = self.AddEquity("SPY", Resolution.Minute)
        
        # Schedule checks every 15 minutes
        self.Schedule.On(
            self.DateRules.EveryDay("SPY"),
            self.TimeRules.Every(timedelta(minutes=15)),
            self.CheckPredictions
        )
        
        self.confidence_threshold = 0.75
        
    def CheckPredictions(self):
        """Get predictions from Hurricane API"""
        try:
            # Fetch predictions
            url = f"{self.api_base}/api/quantconnect/predictions/current"
            content = self.Download(url)
            data = json.loads(content)
            
            # Get 1-hour prediction
            hourly = data["timeframes"]["1h"]
            
            if hourly["confidence"] >= self.confidence_threshold:
                self.ExecuteTrade(hourly)
                
        except Exception as e:
            self.Debug(f"Error: {e}")
    
    def ExecuteTrade(self, prediction):
        """Execute trade based on prediction"""
        spot_price = self.Securities["SPY"].Price
        kelly_size = prediction["kelly_size"]
        position_value = self.Portfolio.TotalPortfolioValue * kelly_size
        
        if prediction["direction"] == 1:  # BUY
            shares = int(position_value / spot_price)
            self.MarketOrder("SPY", shares)
            self.StopMarketOrder("SPY", -shares, prediction["stop_loss"])
            self.Debug(f"BUY {shares} @ {spot_price}")
            
        elif prediction["direction"] == -1:  # SELL
            shares = int(position_value / spot_price)
            self.MarketOrder("SPY", -shares)
            self.StopMarketOrder("SPY", shares, prediction["stop_loss"])
            self.Debug(f"SELL {shares} @ {spot_price}")
```

### Step 3: For Options Trading

```python
class HurricaneOptionsAlgorithm(QCAlgorithm):
    def Initialize(self):
        self.SetStartDate(2024, 1, 1)
        self.SetCash(100000)
        
        # API setup
        self.api_base = "https://3000-iyqipnpwvhcbn3mvpn6y3-6532622b.e2b.dev"
        
        # Add SPY with options
        self.spy = self.AddEquity("SPY", Resolution.Minute)
        self.AddOption("SPY", Resolution.Minute)
        
        # Options filter for 0-2 DTE
        self.option_filter = lambda x: x.IncludeWeeklys()\
            .Strikes(-5, 5)\
            .Expiration(0, 2)
        
        self.spy.SetOptionFilter(self.option_filter)
        
    def OnData(self, data):
        """Process option chains with Hurricane recommendations"""
        if not data.OptionChains:
            return
            
        # Get predictions
        try:
            url = f"{self.api_base}/api/quantconnect/predictions/1h"
            content = self.Download(url)
            pred_data = json.loads(content)
            
            prediction = pred_data["prediction"]
            
            if prediction["confidence"] >= 0.75 and prediction["option"]:
                self.TradeOption(data, prediction["option"])
                
        except:
            pass
    
    def TradeOption(self, data, option_rec):
        """Execute option trade"""
        chain = data.OptionChains.get(self.spy.Symbol)
        if not chain:
            return
            
        # Filter for recommended option
        target_strike = option_rec["strike"]
        option_type = OptionRight.Call if option_rec["type"] == "call" else OptionRight.Put
        
        contracts = [x for x in chain 
                    if x.Right == option_type 
                    and abs(x.Strike - target_strike) < 1
                    and x.Expiry.date() <= self.Time.date() + timedelta(days=option_rec["expiry_days"])]
        
        if contracts:
            selected = sorted(contracts, key=lambda x: abs(x.Strike - target_strike))[0]
            
            # Calculate position size
            contracts_to_buy = int((self.Portfolio.Cash * 0.1) / (selected.AskPrice * 100))
            
            if contracts_to_buy > 0:
                self.MarketOrder(selected.Symbol, contracts_to_buy)
                self.Debug(f"Bought {contracts_to_buy} {option_type} @ ${selected.Strike}")
```

## 📊 Backtesting with Historical Data

```python
class HurricaneBacktest(QCAlgorithm):
    def Initialize(self):
        self.SetStartDate(2023, 1, 1)
        self.SetEndDate(2024, 1, 1)
        self.SetCash(100000)
        
        self.spy = self.AddEquity("SPY", Resolution.Minute)
        
        # Track accuracy
        self.predictions_made = 0
        self.correct_predictions = 0
        
    def OnData(self, data):
        # Get historical prediction for this date
        date_str = self.Time.strftime("%Y-%m-%d")
        
        try:
            url = f"{self.api_base}/api/quantconnect/historical/{date_str}"
            content = self.Download(url)
            historical = json.loads(content)
            
            # Trade based on historical prediction
            # Track accuracy...
            
        except:
            pass
    
    def OnEndOfAlgorithm(self):
        accuracy = self.correct_predictions / self.predictions_made if self.predictions_made > 0 else 0
        self.Debug(f"Backtest Accuracy: {accuracy:.2%}")
        
        # Submit results to Hurricane
        results = {
            "backtest_id": str(self.Time),
            "start_date": self.StartDate.strftime("%Y-%m-%d"),
            "end_date": self.EndDate.strftime("%Y-%m-%d"),
            "initial_capital": 100000,
            "final_capital": self.Portfolio.TotalPortfolioValue,
            "total_return": (self.Portfolio.TotalPortfolioValue / 100000) - 1,
            "total_trades": self.predictions_made,
            "win_rate": accuracy
        }
        
        # In practice, you'd POST this to the API
        self.Debug(f"Results: {results}")
```

## 🔑 Authentication (Optional)

If you want to secure your API, add a token:

```python
class SecureHurricaneAlgorithm(QCAlgorithm):
    def Initialize(self):
        # ... initialization code ...
        self.api_token = "your-secret-token"  # Store in QuantConnect's project settings
        
    def FetchWithAuth(self, endpoint):
        """Fetch with authentication header"""
        headers = {
            "Authorization": f"Bearer {self.api_token}",
            "X-QC-Token": "quantconnect-client"
        }
        # QuantConnect's Download method doesn't support headers directly
        # You might need to use self.Download with query params instead
        url = f"{self.api_base}{endpoint}?token={self.api_token}"
        return self.Download(url)
```

## 📈 Real-Time Trading Setup

1. **Paper Trading First**
   - Test with paper trading account
   - Verify predictions are being received
   - Check trade execution logic

2. **Monitor Initial Trades**
   - Start with small position sizes (1-2% Kelly)
   - Monitor for first 10 trades
   - Verify stop losses are working

3. **Scale Up Gradually**
   - Increase to recommended Kelly sizes
   - Add more timeframes
   - Enable options trading

## 🔍 Debugging

### Test API Connection
```python
# In Initialize()
test_url = f"{self.api_base}/api/quantconnect/health"
try:
    response = self.Download(test_url)
    self.Debug(f"API Connected: {response}")
except Exception as e:
    self.Debug(f"API Error: {e}")
```

### Log Predictions
```python
def CheckPredictions(self):
    # ... fetch predictions ...
    self.Debug(f"Prediction: {json.dumps(data, indent=2)}")
```

## 📊 Performance Tracking

The Hurricane system tracks all trades submitted by QuantConnect:

1. **View Live Trades**
   ```
   GET /api/quantconnect/trades/history
   ```

2. **Get Performance Metrics**
   ```
   GET /api/quantconnect/performance
   ```

3. **Submit Trade Results**
   ```python
   # After trade closes
   result_data = {
       "exit_price": exit_price,
       "profit_loss": pnl,
       "hit_target": hit_target,
       "hit_stop_loss": hit_stop
   }
   # POST to /api/quantconnect/trades/{trade_id}/result
   ```

## ⚠️ Important Notes

1. **API Rate Limits**: Don't call more than once per minute per timeframe
2. **Market Hours**: Predictions are most accurate during market hours
3. **Options Data**: 0DTE options are only available on trading days
4. **Backtesting**: Historical predictions use synthetic data for dates before system launch
5. **Risk Management**: Always use stop losses and position sizing

## 🆘 Support

- **Dashboard**: https://3000-iyqipnpwvhcbn3mvpn6y3-6532622b.e2b.dev
- **GitHub**: https://github.com/DGator86/Hurricane
- **API Health**: https://3000-iyqipnpwvhcbn3mvpn6y3-6532622b.e2b.dev/api/quantconnect/health

## Next Steps

1. Copy the algorithm code to QuantConnect
2. Run backtest for validation
3. Deploy to paper trading
4. Monitor performance
5. Scale to live trading

Good luck with your trading! 🚀