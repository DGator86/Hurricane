# QuantConnect Algorithm - Hurricane SPY Integration
# This algorithm connects to your Hurricane prediction system

from AlgorithmImports import *
import requests
import json
from datetime import datetime, timedelta

class HurricaneSPYAlgorithm(QCAlgorithm):
    def Initialize(self):
        """Initialize the algorithm with Hurricane integration"""
        self.SetStartDate(2024, 1, 1)
        self.SetEndDate(2024, 12, 31)
        self.SetCash(100000)
        
        # Hurricane API Configuration
        self.hurricane_api_url = "https://3000-iyqipnpwvhcbn3mvpn6y3-6532622b.e2b.dev"
        
        # Add SPY for trading
        self.spy = self.AddEquity("SPY", Resolution.Minute)
        self.spy.SetDataNormalizationMode(DataNormalizationMode.Raw)
        
        # Add options
        self.option = self.AddOption("SPY", Resolution.Minute)
        self.option.SetFilter(-10, +10, timedelta(0), timedelta(7))
        
        # Schedule prediction checks
        self.Schedule.On(
            self.DateRules.EveryDay("SPY"),
            self.TimeRules.Every(timedelta(minutes=15)),
            self.CheckHurricanePredictions
        )
        
        # State tracking
        self.current_position = None
        self.last_prediction = None
        self.confidence_threshold = 0.75  # Only trade on high confidence
        
    def CheckHurricanePredictions(self):
        """Fetch predictions from Hurricane API and make trading decisions"""
        try:
            # Get predictions with options recommendations
            response = self.FetchHurricaneData("/api/enhanced/predictions-with-options")
            
            if response:
                # Parse predictions for different timeframes
                predictions = response.get("predictions", {})
                options = response.get("options", {})
                
                # Get 1-hour prediction (good balance of accuracy and frequency)
                hourly = predictions.get("1h", {})
                hourly_option = options.get("1h", {})
                
                if hourly.get("confidence", 0) >= self.confidence_threshold:
                    self.ExecuteTrade(hourly, hourly_option)
                else:
                    self.Debug(f"Low confidence: {hourly.get('confidence', 0):.2%}")
                    
        except Exception as e:
            self.Error(f"Failed to fetch Hurricane predictions: {e}")
    
    def FetchHurricaneData(self, endpoint):
        """Fetch data from Hurricane API"""
        try:
            url = f"{self.hurricane_api_url}{endpoint}"
            # In real implementation, you'd make actual HTTP request
            # For QuantConnect, you might need to use self.Download()
            
            # Simulated response for demonstration
            return {
                "predictions": {
                    "1h": {
                        "direction": "BUY",
                        "confidence": 0.78,
                        "targetPrice": 455.50,
                        "stopLoss": 453.00,
                        "kellySize": 0.15
                    }
                },
                "options": {
                    "1h": {
                        "type": "call",
                        "strike": 455,
                        "expiration": "2024-01-15",
                        "cost": 2.35,
                        "delta": 0.42,
                        "gamma": 0.012,
                        "theta": -0.85
                    }
                }
            }
        except:
            return None
    
    def ExecuteTrade(self, prediction, option_rec):
        """Execute trade based on Hurricane prediction"""
        current_price = self.Securities["SPY"].Price
        
        # Calculate position size using Kelly Criterion
        kelly_size = prediction.get("kellySize", 0.1)
        position_value = self.Portfolio.TotalPortfolioValue * kelly_size
        
        if prediction["direction"] == "BUY":
            if option_rec and option_rec["type"] == "call":
                # Trade call options
                self.TradeCallOption(option_rec, position_value)
            else:
                # Trade shares
                shares = int(position_value / current_price)
                self.MarketOrder("SPY", shares)
                self.StopMarketOrder("SPY", -shares, prediction["stopLoss"])
                
        elif prediction["direction"] == "SELL":
            if option_rec and option_rec["type"] == "put":
                # Trade put options
                self.TradePutOption(option_rec, position_value)
            else:
                # Short shares
                shares = int(position_value / current_price)
                self.MarketOrder("SPY", -shares)
                self.StopMarketOrder("SPY", shares, prediction["stopLoss"])
                
        self.last_prediction = prediction
        self.Debug(f"Executed {prediction['direction']} with {prediction['confidence']:.2%} confidence")
    
    def TradeCallOption(self, option_rec, position_value):
        """Trade call options based on recommendation"""
        option_chain = self.OptionChainProvider.GetOptionContractList(self.spy.Symbol, self.Time)
        
        # Find the recommended option
        target_strike = option_rec["strike"]
        target_expiry = datetime.strptime(option_rec["expiration"], "%Y-%m-%d")
        
        calls = [x for x in option_chain if x.Right == OptionRight.Call 
                 and abs(x.Strike - target_strike) < 1
                 and abs((x.Expiry - target_expiry).days) <= 1]
        
        if calls:
            selected_call = sorted(calls, key=lambda x: abs(x.Strike - target_strike))[0]
            
            # Calculate number of contracts
            contracts = int(position_value / (option_rec["cost"] * 100))
            
            if contracts > 0:
                self.AddOptionContract(selected_call)
                self.MarketOrder(selected_call, contracts)
                self.Debug(f"Bought {contracts} call contracts at strike {selected_call.Strike}")
    
    def TradePutOption(self, option_rec, position_value):
        """Trade put options based on recommendation"""
        # Similar to TradeCallOption but for puts
        pass
    
    def OnData(self, data):
        """Handle incoming data"""
        # Monitor positions and check for exit conditions
        if self.Portfolio.Invested and self.last_prediction:
            current_price = self.Securities["SPY"].Price
            
            # Check if target or stop hit
            if current_price >= self.last_prediction["targetPrice"]:
                self.Liquidate("SPY")
                self.Debug(f"Target hit at {current_price}")
            elif current_price <= self.last_prediction["stopLoss"]:
                self.Liquidate("SPY")
                self.Debug(f"Stop loss hit at {current_price}")
    
    def OnEndOfAlgorithm(self):
        """Algorithm termination"""
        self.Debug(f"Final Portfolio Value: {self.Portfolio.TotalPortfolioValue}")


class HurricaneBacktestingAlgorithm(QCAlgorithm):
    """Version for backtesting with historical Hurricane predictions"""
    
    def Initialize(self):
        self.SetStartDate(2024, 1, 1)
        self.SetEndDate(2024, 12, 31)
        self.SetCash(100000)
        
        # Load historical predictions
        self.historical_predictions = {}
        
        # SPY with options
        self.spy = self.AddEquity("SPY", Resolution.Minute)
        self.option = self.AddOption("SPY", Resolution.Minute)
        
        # Track performance
        self.trades = []
        self.accuracy_tracker = {
            "15m": [],
            "30m": [],
            "1h": [],
            "4h": [],
            "1d": []
        }
        
    def OnData(self, data):
        """Process data with historical Hurricane predictions"""
        # Check if we have a prediction for this timestamp
        current_time = self.Time
        
        # In real implementation, you'd load actual historical predictions
        # from your Hurricane system's database
        prediction = self.GetHistoricalPrediction(current_time)
        
        if prediction and prediction["confidence"] > 0.75:
            self.ExecuteHistoricalTrade(prediction, data)
    
    def GetHistoricalPrediction(self, timestamp):
        """Get historical prediction for backtesting"""
        # This would connect to your Hurricane database
        # or load from a CSV export of predictions
        pass
    
    def ExecuteHistoricalTrade(self, prediction, data):
        """Execute trade and track for accuracy"""
        entry_price = self.Securities["SPY"].Price
        
        # Record prediction
        self.accuracy_tracker[prediction["timeframe"]].append({
            "timestamp": self.Time,
            "prediction": prediction,
            "entry_price": entry_price
        })
        
        # Execute trade logic
        # ... trade execution code ...
    
    def OnEndOfAlgorithm(self):
        """Calculate final accuracy metrics"""
        for timeframe, predictions in self.accuracy_tracker.items():
            correct = sum(1 for p in predictions if p.get("correct", False))
            total = len(predictions)
            
            if total > 0:
                accuracy = correct / total
                self.Debug(f"{timeframe} Accuracy: {accuracy:.2%} ({correct}/{total})")