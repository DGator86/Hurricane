#!/usr/bin/env python3
"""
Hurricane SPY Backtesting Harness
Tests prediction accuracy, cone calibration, and R-multiple performance
"""

import json
import csv
import os
from datetime import datetime, timedelta, date as date_class
from typing import Dict, List, Optional, Tuple
import requests
from pathlib import Path

from unusual_whales_client import UnusualWhalesClient

# Configuration
API_BASE_URL = os.getenv("HURRICANE_API_BASE", "http://localhost:3000")
PREDICTIONS_DIR = Path("predictions_unusual_whales")  # Using Unusual Whales enhanced predictions
SPY_DATA_FILE = Path("spy_data.csv")
OUTPUT_DIR = Path("backtest_results")

class HurricaneBacktest:
    def __init__(
        self,
        mode: str = "offline",
        start_date: Optional[date_class] = None,
        end_date: Optional[date_class] = None,
        months: int = 3,
    ):
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
        
        # Date window configuration
        self.start_date = start_date
        self.end_date = end_date
        self.months = max(1, months)

        # API clients
        self.unusual_whales_client = UnusualWhalesClient()

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

        self._apply_date_filters()
    
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

    def _apply_date_filters(self):
        """Filter loaded predictions to the configured date window"""
        if not self.predictions:
            return

        all_dates = sorted(self.predictions.keys())
        parsed_dates = [datetime.strptime(d, "%Y-%m-%d").date() for d in all_dates]

        requested_start = self.start_date
        requested_end = self.end_date

        # Determine default end date as the latest available prediction
        if not self.end_date:
            self.end_date = parsed_dates[-1]
            requested_end = self.end_date

        # Determine default start date based on requested number of months
        if not self.start_date:
            approx_days = int(self.months * 30)
            self.start_date = self.end_date - timedelta(days=approx_days)
            requested_start = self.start_date

        # Clamp the window to available data
        earliest = parsed_dates[0]
        latest = parsed_dates[-1]
        clamped_start = max(self.start_date, earliest)
        clamped_end = min(self.end_date, latest)

        # Ensure start <= end
        if clamped_start > clamped_end:
            print("No predictions available within the specified date range.")
            self.predictions = {}
            return

        before_count = len(self.predictions)
        self.start_date = clamped_start
        self.end_date = clamped_end

        # Filter the predictions
        filtered: Dict[str, Dict] = {}
        for date_str in all_dates:
            current_date = datetime.strptime(date_str, "%Y-%m-%d").date()
            if self.start_date <= current_date <= self.end_date:
                filtered[date_str] = self.predictions[date_str]

        self.predictions = filtered

        after_count = len(self.predictions)

        # Notify if the requested window was wider than available data
        if (
            (requested_start and self.start_date > requested_start)
            or (requested_end and self.end_date < requested_end)
        ):
            missing_start = None
            missing_end = None
            if requested_start and self.start_date > requested_start:
                missing_start = (self.start_date - requested_start).days
            if requested_end and self.end_date < requested_end:
                missing_end = (requested_end - self.end_date).days

            parts = []
            if missing_start:
                parts.append(f"{missing_start} days at the start")
            if missing_end:
                parts.append(f"{missing_end} days at the end")
            missing_msg = ", ".join(parts) if parts else "some dates"

            print(
                "Limited prediction history: requested window"
                f" {requested_start or 'n/a'} → {requested_end or 'n/a'}"
                f" but only {self.start_date} → {self.end_date} exists"
                f" ({before_count - after_count} files excluded, {missing_msg})."
            )
    
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
        dates = sorted(self.spy_data.keys())
        if not dates:
            return

        if self.unusual_whales_client.is_configured:
            for date_str in dates:
                try:
                    payload = self.unusual_whales_client.fetch_enhanced_prediction("SPY", asof=date_str)
                    self.predictions[date_str] = self.parse_api_prediction(payload)
                except Exception as e:
                    print(f"Error fetching Unusual Whales prediction for {date_str}: {e}")
        else:
            print(
                "UNUSUAL_WHALES_API_TOKEN not set; falling back to local API at "
                f"{API_BASE_URL}"
            )
            for date_str in dates:
                try:
                    response = requests.get(
                        f"{API_BASE_URL}/api/meteorology/predict",
                        params={"asof": date_str},
                        timeout=15,
                    )
                    response.raise_for_status()
                    self.predictions[date_str] = self.parse_api_prediction(response.json())
                except Exception as e:
                    print(f"Error fetching fallback prediction for {date_str}: {e}")
    
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
        forecast_root = api_response.get("forecasts") or api_response.get("predictions") or {}

        for tf in ["1m", "5m", "15m", "1h", "4h", "1d"]:
            tf_data = forecast_root.get(tf, {})
            if tf_data:
                parsed["predictions"][tf] = {
                    "direction": tf_data.get("direction", "NEUTRAL"),
                    "target": tf_data.get("target", 0),
                    "stop_loss": tf_data.get("stopLoss", 0),
                    "cone_upper": tf_data.get("upperBound", 0),
                    "cone_lower": tf_data.get("lowerBound", 0),
                    "confidence": tf_data.get("confidence", tf_data.get("score", 0.5))
                }
                parsed["confidence"][tf] = tf_data.get("confidence", tf_data.get("score", 0.5))
        
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
        flow = api_response.get("flowMetrics", {}) or api_response.get("flow", {})
        parsed["flow_metrics"] = {
            "gex": flow.get("gex", 0),
            "dix": flow.get("dix", 0.5),
            "vanna": flow.get("vanna", 0),
            "charm": flow.get("charm", 0)
        }

        # Kelly sizing
        parsed["kelly_size"] = api_response.get("kellySizing") or api_response.get("kellySize", 0.1)
        
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
        if self.start_date and self.end_date:
            print(f"Date range: {self.start_date} to {self.end_date}")

        # Evaluate each prediction
        for date in sorted(self.predictions.keys()):
            prediction = self.predictions[date]
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
    import argparse

    parser = argparse.ArgumentParser(description="Run Hurricane SPY backtests")
    parser.add_argument("mode", nargs="?", default="offline", choices=["offline", "api"],
                        help="Prediction source mode (default: offline)")
    parser.add_argument("--start", dest="start", help="Start date (YYYY-MM-DD)")
    parser.add_argument("--end", dest="end", help="End date (YYYY-MM-DD)")
    parser.add_argument("--months", dest="months", type=int, default=3,
                        help="Approximate number of months to include when start is omitted (default: 3)")

    args = parser.parse_args()

    start_date: Optional[date_class] = None
    end_date: Optional[date_class] = None

    if args.start:
        try:
            start_date = datetime.strptime(args.start, "%Y-%m-%d").date()
        except ValueError:
            raise SystemExit(f"Invalid start date format: {args.start}. Use YYYY-MM-DD.")

    if args.end:
        try:
            end_date = datetime.strptime(args.end, "%Y-%m-%d").date()
        except ValueError:
            raise SystemExit(f"Invalid end date format: {args.end}. Use YYYY-MM-DD.")

    if start_date and end_date and start_date > end_date:
        raise SystemExit("Start date must be on or before end date.")

    print(f"Running Hurricane SPY Backtest in {args.mode} mode...")

    backtester = HurricaneBacktest(
        mode=args.mode,
        start_date=start_date,
        end_date=end_date,
        months=args.months,
    )
    backtester.run_backtest()

if __name__ == "__main__":
    main()