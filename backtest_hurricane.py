#!/usr/bin/env python3
"""
Hurricane SPY Backtesting Harness
Tests prediction accuracy, cone calibration, and R-multiple performance
"""

import json
import csv
import os
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple
import requests
from pathlib import Path

# Configuration
API_BASE_URL = "http://localhost:3000"  # Adjust if deployed
PREDICTIONS_DIR = Path("predictions_yahoo")  # Using Yahoo Finance enhanced predictions
SPY_DATA_FILE = Path("spy_data.csv")
OUTPUT_DIR = Path("backtest_results")

class HurricaneBacktest:
    def __init__(self, mode: str = "offline"):
        """
        Initialize backtester
        mode: "offline" (use JSON files) or "api" (fetch from API with ?asof param)
        """
        self.mode = mode
        self.spy_data = {}
        self.predictions = {}
        self.trades = []
        self.results = {
            "total_trades": 0,
            "winning_trades": 0,
            "losing_trades": 0,
            "total_r_multiple": 0,
            "avg_r_multiple": 0,
            "by_timeframe": {},
            "by_regime": {},
            "cone_calibration": {
                "within_10pct": 0,
                "within_25pct": 0,
                "within_50pct": 0,
                "outside_50pct": 0
            }
        }
        
        # Create output directory
        OUTPUT_DIR.mkdir(exist_ok=True)
    
    def load_spy_data(self):
        """Load SPY historical data from CSV"""
        if not SPY_DATA_FILE.exists():
            print(f"Creating template SPY data file: {SPY_DATA_FILE}")
            self.create_spy_template()
            return
        
        with open(SPY_DATA_FILE, 'r') as f:
            reader = csv.DictReader(f)
            for row in reader:
                date = row['Date']
                self.spy_data[date] = {
                    'open': float(row['Open']),
                    'high': float(row['High']),
                    'low': float(row['Low']),
                    'close': float(row['Close']),
                    'volume': int(float(row['Volume']))
                }
    
    def create_spy_template(self):
        """Create template SPY data CSV"""
        with open(SPY_DATA_FILE, 'w', newline='') as f:
            writer = csv.writer(f)
            writer.writerow(['Date', 'Open', 'High', 'Low', 'Close', 'Volume'])
            
            # Generate sample data for past 30 days
            base_price = 580.0
            date = datetime.now() - timedelta(days=30)
            
            for i in range(30):
                open_price = base_price + (i % 5) - 2
                close_price = open_price + ((i % 3) - 1) * 0.5
                high_price = max(open_price, close_price) + 0.5
                low_price = min(open_price, close_price) - 0.5
                volume = 50000000 + (i % 10) * 1000000
                
                writer.writerow([
                    date.strftime('%Y-%m-%d'),
                    f"{open_price:.2f}",
                    f"{high_price:.2f}",
                    f"{low_price:.2f}",
                    f"{close_price:.2f}",
                    volume
                ])
                
                date += timedelta(days=1)
                base_price += ((i % 7) - 3) * 0.25
    
    def load_predictions(self):
        """Load predictions from JSON files or API"""
        if self.mode == "offline":
            self.load_offline_predictions()
        else:
            self.load_api_predictions()
    
    def load_offline_predictions(self):
        """Load predictions from JSON files"""
        if not PREDICTIONS_DIR.exists():
            print(f"Creating predictions directory with example: {PREDICTIONS_DIR}")
            PREDICTIONS_DIR.mkdir(exist_ok=True)
            self.create_prediction_example()
            return
        
        for file_path in PREDICTIONS_DIR.glob("*.json"):
            date = file_path.stem  # filename without extension
            with open(file_path, 'r') as f:
                self.predictions[date] = json.load(f)
    
    def create_prediction_example(self):
        """Create example prediction JSON"""
        example_date = (datetime.now() - timedelta(days=1)).strftime('%Y-%m-%d')
        example_path = PREDICTIONS_DIR / f"{example_date}.json"
        
        example_prediction = {
            "timestamp": f"{example_date}T09:30:00Z",
            "current_price": 580.50,
            "regime": "TREND",
            "confidence": {
                "overall": 0.75,
                "1m": 0.80,
                "5m": 0.72,
                "15m": 0.68,
                "1h": 0.70,
                "4h": 0.65,
                "1d": 0.62
            },
            "predictions": {
                "1m": {
                    "direction": "BULLISH",
                    "target": 580.75,
                    "stop_loss": 580.25,
                    "cone_upper": 580.85,
                    "cone_lower": 580.15,
                    "confidence": 0.80
                },
                "5m": {
                    "direction": "BULLISH",
                    "target": 581.00,
                    "stop_loss": 580.00,
                    "cone_upper": 581.50,
                    "cone_lower": 579.50,
                    "confidence": 0.72
                },
                "15m": {
                    "direction": "NEUTRAL",
                    "target": 580.50,
                    "stop_loss": 579.50,
                    "cone_upper": 582.00,
                    "cone_lower": 579.00,
                    "confidence": 0.68
                },
                "1h": {
                    "direction": "BULLISH",
                    "target": 582.00,
                    "stop_loss": 579.00,
                    "cone_upper": 583.50,
                    "cone_lower": 578.50,
                    "confidence": 0.70
                },
                "4h": {
                    "direction": "BEARISH",
                    "target": 578.00,
                    "stop_loss": 582.00,
                    "cone_upper": 583.00,
                    "cone_lower": 577.00,
                    "confidence": 0.65
                },
                "1d": {
                    "direction": "BEARISH",
                    "target": 575.00,
                    "stop_loss": 583.00,
                    "cone_upper": 585.00,
                    "cone_lower": 573.00,
                    "confidence": 0.62
                }
            },
            "option_recommendation": {
                "type": "CALL",
                "strike": 581,
                "expiry": example_date,
                "entry_price": 0.85,
                "target_price": 1.50,
                "stop_loss": 0.40,
                "confidence": 0.75,
                "greeks": {
                    "delta": 0.45,
                    "gamma": 0.08,
                    "theta": -0.35,
                    "vega": 0.12
                }
            },
            "kelly_size": 0.15,
            "flow_metrics": {
                "gex": -125000000,
                "dix": 0.42,
                "vanna": 85000000,
                "charm": -2500000
            }
        }
        
        with open(example_path, 'w') as f:
            json.dump(example_prediction, f, indent=2)
        
        print(f"Created example prediction: {example_path}")
    
    def load_api_predictions(self):
        """Load predictions from API using ?asof parameter"""
        for date_str in self.spy_data.keys():
            try:
                response = requests.get(
                    f"{API_BASE_URL}/api/meteorology/predict",
                    params={"asof": date_str}
                )
                if response.status_code == 200:
                    self.predictions[date_str] = self.parse_api_prediction(response.json())
                else:
                    print(f"Failed to fetch prediction for {date_str}: {response.status_code}")
            except Exception as e:
                print(f"Error fetching prediction for {date_str}: {e}")
    
    def parse_api_prediction(self, api_response: Dict) -> Dict:
        """
        Parse API response to match expected prediction format
        Adjust this based on actual API schema
        """
        # Map API response to expected format
        parsed = {
            "timestamp": api_response.get("timestamp"),
            "current_price": api_response.get("currentPrice"),
            "regime": api_response.get("regime", {}).get("state"),
            "confidence": {},
            "predictions": {},
            "option_recommendation": None,
            "kelly_size": 0.1,
            "flow_metrics": {}
        }
        
        # Extract timeframe predictions
        for tf in ["1m", "5m", "15m", "1h", "4h", "1d"]:
            tf_data = api_response.get("forecasts", {}).get(tf, {})
            if tf_data:
                parsed["predictions"][tf] = {
                    "direction": tf_data.get("direction", "NEUTRAL"),
                    "target": tf_data.get("target", 0),
                    "stop_loss": tf_data.get("stopLoss", 0),
                    "cone_upper": tf_data.get("upperBound", 0),
                    "cone_lower": tf_data.get("lowerBound", 0),
                    "confidence": tf_data.get("confidence", 0.5)
                }
                parsed["confidence"][tf] = tf_data.get("confidence", 0.5)
        
        # Extract option recommendation
        opt_rec = api_response.get("optionTrade")
        if opt_rec:
            parsed["option_recommendation"] = {
                "type": opt_rec.get("side", "CALL"),
                "strike": opt_rec.get("strike"),
                "expiry": opt_rec.get("expiry"),
                "entry_price": opt_rec.get("premium"),
                "target_price": opt_rec.get("targetPremium"),
                "stop_loss": opt_rec.get("stopLoss"),
                "confidence": opt_rec.get("confidence", 0.5),
                "greeks": opt_rec.get("greeks", {})
            }
        
        # Extract flow metrics
        flow = api_response.get("flowMetrics", {})
        parsed["flow_metrics"] = {
            "gex": flow.get("gex", 0),
            "dix": flow.get("dix", 0.5),
            "vanna": flow.get("vanna", 0),
            "charm": flow.get("charm", 0)
        }
        
        # Kelly sizing
        parsed["kelly_size"] = api_response.get("kellySizing", 0.1)
        
        # Overall confidence
        parsed["confidence"]["overall"] = api_response.get("confidence", {}).get("overall", 0.5)
        
        return parsed
    
    def evaluate_prediction(self, date: str, timeframe: str, prediction: Dict) -> Dict:
        """Evaluate a single prediction against actual data"""
        if date not in self.spy_data:
            return None
        
        actual = self.spy_data[date]
        pred = prediction["predictions"].get(timeframe)
        
        if not pred:
            return None
        
        # Calculate actual move
        # Handle both camelCase and snake_case keys
        entry_price = prediction.get("currentPrice") or prediction.get("current_price", 0)
        
        # For different timeframes, use appropriate actual price
        # This is simplified - in reality would need intraday data
        if timeframe in ["1m", "5m", "15m"]:
            actual_price = actual["high"] if pred["direction"] == "BULLISH" else actual["low"]
        else:
            actual_price = actual["close"]
        
        actual_move = actual_price - entry_price
        predicted_direction = 1 if pred["direction"] == "BULLISH" else -1 if pred["direction"] == "BEARISH" else 0
        
        # Check if direction was correct
        direction_correct = (actual_move > 0 and predicted_direction > 0) or \
                          (actual_move < 0 and predicted_direction < 0)
        
        # Calculate R-multiple
        if predicted_direction != 0:
            risk = abs(entry_price - pred["stop_loss"])
            reward = abs(actual_move)
            r_multiple = reward / risk if risk > 0 else 0
            
            # If direction was wrong, R-multiple is negative
            if not direction_correct:
                r_multiple = -min(1.0, r_multiple)  # Cap loss at -1R
        else:
            r_multiple = 0
        
        # Check cone calibration
        within_cone = pred["cone_lower"] <= actual_price <= pred["cone_upper"]
        cone_width = pred["cone_upper"] - pred["cone_lower"]
        price_percentile = (actual_price - pred["cone_lower"]) / cone_width if cone_width > 0 else 0.5
        
        return {
            "date": date,
            "timeframe": timeframe,
            "regime": prediction.get("regime", {}).get("state") or prediction.get("regime", {}).get("current") or "UNKNOWN",
            "direction_predicted": pred["direction"],
            "direction_correct": direction_correct,
            "entry_price": entry_price,
            "target": pred["target"],
            "stop_loss": pred["stop_loss"],
            "actual_price": actual_price,
            "r_multiple": r_multiple,
            "within_cone": within_cone,
            "cone_percentile": price_percentile,
            "confidence": pred["confidence"]
        }
    
    def run_backtest(self):
        """Run the complete backtest"""
        print("Loading SPY data...")
        self.load_spy_data()
        
        print("Loading predictions...")
        self.load_predictions()
        
        print(f"Running backtest on {len(self.predictions)} predictions...")
        
        # Evaluate each prediction
        for date, prediction in self.predictions.items():
            for timeframe in ["1m", "5m", "15m", "1h", "4h", "1d"]:
                result = self.evaluate_prediction(date, timeframe, prediction)
                if result:
                    self.trades.append(result)
                    self.update_statistics(result)
        
        # Calculate final statistics
        self.finalize_statistics()
        
        # Save results
        self.save_results()
        
        print(f"Backtest complete. Results saved to {OUTPUT_DIR}")
    
    def update_statistics(self, trade: Dict):
        """Update running statistics"""
        self.results["total_trades"] += 1
        
        if trade["direction_correct"]:
            self.results["winning_trades"] += 1
        else:
            self.results["losing_trades"] += 1
        
        self.results["total_r_multiple"] += trade["r_multiple"]
        
        # Update by timeframe
        tf = trade["timeframe"]
        if tf not in self.results["by_timeframe"]:
            self.results["by_timeframe"][tf] = {
                "trades": 0,
                "wins": 0,
                "total_r": 0,
                "within_cone": 0
            }
        
        self.results["by_timeframe"][tf]["trades"] += 1
        if trade["direction_correct"]:
            self.results["by_timeframe"][tf]["wins"] += 1
        self.results["by_timeframe"][tf]["total_r"] += trade["r_multiple"]
        if trade["within_cone"]:
            self.results["by_timeframe"][tf]["within_cone"] += 1
        
        # Update by regime
        regime = trade["regime"]
        if regime not in self.results["by_regime"]:
            self.results["by_regime"][regime] = {
                "trades": 0,
                "wins": 0,
                "total_r": 0
            }
        
        self.results["by_regime"][regime]["trades"] += 1
        if trade["direction_correct"]:
            self.results["by_regime"][regime]["wins"] += 1
        self.results["by_regime"][regime]["total_r"] += trade["r_multiple"]
        
        # Update cone calibration
        percentile = trade["cone_percentile"]
        if 0.4 <= percentile <= 0.6:
            self.results["cone_calibration"]["within_10pct"] += 1
        if 0.25 <= percentile <= 0.75:
            self.results["cone_calibration"]["within_25pct"] += 1
        if 0.0 <= percentile <= 1.0:
            self.results["cone_calibration"]["within_50pct"] += 1
        else:
            self.results["cone_calibration"]["outside_50pct"] += 1
    
    def finalize_statistics(self):
        """Calculate final statistics"""
        if self.results["total_trades"] > 0:
            self.results["avg_r_multiple"] = self.results["total_r_multiple"] / self.results["total_trades"]
            self.results["win_rate"] = self.results["winning_trades"] / self.results["total_trades"]
            
            # Calculate stats by timeframe
            for tf, stats in self.results["by_timeframe"].items():
                if stats["trades"] > 0:
                    stats["win_rate"] = stats["wins"] / stats["trades"]
                    stats["avg_r"] = stats["total_r"] / stats["trades"]
                    stats["cone_accuracy"] = stats["within_cone"] / stats["trades"]
            
            # Calculate stats by regime
            for regime, stats in self.results["by_regime"].items():
                if stats["trades"] > 0:
                    stats["win_rate"] = stats["wins"] / stats["trades"]
                    stats["avg_r"] = stats["total_r"] / stats["trades"]
            
            # Normalize cone calibration
            total_cone_checks = sum(self.results["cone_calibration"].values())
            if total_cone_checks > 0:
                for key in self.results["cone_calibration"]:
                    self.results["cone_calibration"][key] /= total_cone_checks
    
    def save_results(self):
        """Save backtest results to files"""
        # Save summary JSON
        summary_path = OUTPUT_DIR / "backtest_summary.json"
        with open(summary_path, 'w') as f:
            json.dump(self.results, f, indent=2)
        
        # Save trade log CSV
        trade_log_path = OUTPUT_DIR / "trade_log.csv"
        with open(trade_log_path, 'w', newline='') as f:
            if self.trades:
                writer = csv.DictWriter(f, fieldnames=self.trades[0].keys())
                writer.writeheader()
                writer.writerows(self.trades)
        
        # Save regime summary CSV
        regime_summary_path = OUTPUT_DIR / "by_regime_summary.csv"
        with open(regime_summary_path, 'w', newline='') as f:
            writer = csv.writer(f)
            writer.writerow(["Regime", "Trades", "Wins", "Win Rate", "Avg R-Multiple"])
            for regime, stats in self.results["by_regime"].items():
                writer.writerow([
                    regime,
                    stats["trades"],
                    stats["wins"],
                    f"{stats.get('win_rate', 0):.2%}",
                    f"{stats.get('avg_r', 0):.3f}"
                ])
        
        print(f"\n=== Backtest Results ===")
        print(f"Total Trades: {self.results['total_trades']}")
        print(f"Win Rate: {self.results.get('win_rate', 0):.2%}")
        print(f"Avg R-Multiple: {self.results.get('avg_r_multiple', 0):.3f}")
        print(f"\nResults saved to {OUTPUT_DIR}/")

def main():
    """Main entry point"""
    import sys
    
    mode = "offline"  # Default mode
    if len(sys.argv) > 1:
        mode = sys.argv[1]
    
    print(f"Running Hurricane SPY Backtest in {mode} mode...")
    
    backtester = HurricaneBacktest(mode=mode)
    backtester.run_backtest()

if __name__ == "__main__":
    main()