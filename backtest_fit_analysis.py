#!/usr/bin/env python3
"""
Backtest Fit Analysis - Focus on Signal Accuracy, Not P&L
Evaluates whether predictions correctly identify market direction and timing
"""

import json
import requests
from datetime import datetime, timedelta
import numpy as np
from typing import Dict, List, Tuple
import time

class FitAnalysisBacktest:
    def __init__(self, polygon_key: str):
        self.polygon_key = polygon_key
        self.base_url = "https://api.polygon.io"
        
    def get_historical_data(self, date: str, timeframe: str = '1hour') -> Dict:
        """Fetch actual SPY data for a given date"""
        # Convert timeframe to Polygon format
        multiplier, timespan = self._convert_timeframe(timeframe)
        
        # Parse date and set range
        target_date = datetime.strptime(date, '%Y-%m-%d')
        start = target_date.strftime('%Y-%m-%d')
        end = (target_date + timedelta(days=1)).strftime('%Y-%m-%d')
        
        url = f"{self.base_url}/v2/aggs/ticker/SPY/range/{multiplier}/{timespan}/{start}/{end}"
        params = {"apiKey": self.polygon_key, "adjusted": "true", "sort": "asc"}
        
        try:
            response = requests.get(url, params=params)
            if response.status_code == 200:
                data = response.json()
                if data.get('results'):
                    return self._process_polygon_data(data['results'])
        except Exception as e:
            print(f"Error fetching data for {date}: {e}")
        
        return None
    
    def _convert_timeframe(self, timeframe: str) -> Tuple[int, str]:
        """Convert our timeframe to Polygon format"""
        mapping = {
            '1m': (1, 'minute'),
            '5m': (5, 'minute'),
            '15m': (15, 'minute'),
            '1h': (1, 'hour'),
            '4h': (4, 'hour'),
            '1d': (1, 'day')
        }
        return mapping.get(timeframe, (1, 'hour'))
    
    def _process_polygon_data(self, results: List) -> Dict:
        """Process Polygon data into our format"""
        if not results:
            return None
            
        # Get price movements
        first_bar = results[0]
        last_bar = results[-1]
        
        # Calculate actual movements
        actual_move = ((last_bar['c'] - first_bar['o']) / first_bar['o']) * 100
        high_move = ((max(r['h'] for r in results) - first_bar['o']) / first_bar['o']) * 100
        low_move = ((min(r['l'] for r in results) - first_bar['o']) / first_bar['o']) * 100
        
        # Determine actual direction
        if actual_move > 0.1:
            direction = 'BUY'
        elif actual_move < -0.1:
            direction = 'SELL'
        else:
            direction = 'NEUTRAL'
        
        return {
            'open': first_bar['o'],
            'close': last_bar['c'],
            'high': max(r['h'] for r in results),
            'low': min(r['l'] for r in results),
            'actual_move': actual_move,
            'high_move': high_move,
            'low_move': low_move,
            'actual_direction': direction,
            'volume': sum(r['v'] for r in results),
            'bars': len(results)
        }
    
    def evaluate_prediction_fit(self, prediction: Dict, actual: Dict) -> Dict:
        """Evaluate how well a prediction fits actual market behavior"""
        
        fit_metrics = {
            'timeframe': prediction.get('timeframe', 'unknown'),
            'prediction_direction': prediction.get('direction', 'NEUTRAL'),
            'actual_direction': actual['actual_direction'],
            'prediction_move': prediction.get('expectedMove', 0),
            'actual_move': actual['actual_move'],
            'target_price': prediction.get('targetPrice', 0),
            'stop_loss': prediction.get('stopLoss', 0),
            'entry_price': prediction.get('entryPrice', actual['open']),
            'confidence': prediction.get('confidence', 0),
        }
        
        # Direction accuracy (most important)
        if fit_metrics['prediction_direction'] in ['STRONG_BUY', 'BUY']:
            pred_dir = 'BULLISH'
        elif fit_metrics['prediction_direction'] in ['STRONG_SELL', 'SELL']:
            pred_dir = 'BEARISH'
        else:
            pred_dir = 'NEUTRAL'
            
        if actual['actual_direction'] == 'BUY':
            actual_dir = 'BULLISH'
        elif actual['actual_direction'] == 'SELL':
            actual_dir = 'BEARISH'
        else:
            actual_dir = 'NEUTRAL'
        
        fit_metrics['direction_correct'] = (pred_dir == actual_dir)
        
        # Target hit analysis
        if pred_dir == 'BULLISH':
            fit_metrics['target_hit'] = actual['high'] >= fit_metrics['target_price']
            fit_metrics['stop_hit'] = actual['low'] <= fit_metrics['stop_loss']
        elif pred_dir == 'BEARISH':
            fit_metrics['target_hit'] = actual['low'] <= fit_metrics['target_price']
            fit_metrics['stop_hit'] = actual['high'] >= fit_metrics['stop_loss']
        else:
            fit_metrics['target_hit'] = False
            fit_metrics['stop_hit'] = False
        
        # Move magnitude accuracy
        fit_metrics['move_error'] = abs(fit_metrics['prediction_move']) - abs(fit_metrics['actual_move'])
        fit_metrics['move_direction_correct'] = (
            (fit_metrics['prediction_move'] > 0 and fit_metrics['actual_move'] > 0) or
            (fit_metrics['prediction_move'] < 0 and fit_metrics['actual_move'] < 0) or
            (abs(fit_metrics['prediction_move']) < 0.1 and abs(fit_metrics['actual_move']) < 0.1)
        )
        
        # Confidence calibration
        if fit_metrics['direction_correct']:
            fit_metrics['confidence_justified'] = fit_metrics['confidence'] > 0.5
        else:
            fit_metrics['confidence_justified'] = fit_metrics['confidence'] < 0.5
        
        # Calculate fit score (0-100)
        fit_score = 0
        if fit_metrics['direction_correct']:
            fit_score += 40  # Direction is most important
        if fit_metrics['move_direction_correct']:
            fit_score += 20
        if fit_metrics['target_hit'] and not fit_metrics['stop_hit']:
            fit_score += 20
        if abs(fit_metrics['move_error']) < 0.5:
            fit_score += 10
        if fit_metrics['confidence_justified']:
            fit_score += 10
            
        fit_metrics['fit_score'] = fit_score
        
        return fit_metrics
    
    def run_comprehensive_backtest(self, days: int = 5) -> Dict:
        """Run backtest for multiple days and compile statistics"""
        
        print(f"\n🔬 RUNNING FIT ANALYSIS BACKTEST")
        print("=" * 70)
        print(f"Focus: Signal accuracy and directional correctness")
        print(f"Period: Last {days} trading days")
        print("=" * 70)
        
        results = {
            'total_predictions': 0,
            'by_timeframe': {},
            'direction_accuracy': {'correct': 0, 'incorrect': 0},
            'target_hit_rate': {'hit': 0, 'missed': 0, 'stopped': 0},
            'confidence_calibration': {'justified': 0, 'unjustified': 0},
            'fit_scores': [],
            'daily_results': []
        }
        
        # Use actual recent historical dates (late 2024)
        # These are known trading days with data available
        trading_days = [
            '2024-12-20',  # Friday
            '2024-12-19',  # Thursday
            '2024-12-18',  # Wednesday
            '2024-12-17',  # Tuesday
            '2024-12-16',  # Monday
        ][:days]
        
        # Test each day
        for date in trading_days:
            print(f"\n📅 Testing {date}...")
            
            # For now, use current prediction structure but with historical actual data
            # In production, you'd generate predictions as-of the historical date
            prediction_url = "http://localhost:3000/api/hurricane/prediction"
            
            try:
                # Get current prediction structure (we'll compare against historical actuals)
                response = requests.get(prediction_url)
                if response.status_code != 200:
                    print(f"  ⚠️ Failed to get prediction: {response.status_code}")
                    continue
                    
                prediction_data = response.json()
                
                # Analyze each timeframe
                daily_fits = []
                for timeframe in ['1m', '5m', '15m', '1h', '4h', '1d']:
                    if timeframe not in prediction_data.get('predictions', {}):
                        continue
                    
                    pred = prediction_data['predictions'][timeframe]
                    
                    # Get actual data for this timeframe
                    actual = self.get_historical_data(date, timeframe)
                    if not actual:
                        print(f"  ⚠️ No actual data for {timeframe}")
                        continue
                    
                    # Add entry price to prediction
                    pred['entryPrice'] = prediction_data.get('currentPrice', actual['open'])
                    pred['timeframe'] = timeframe
                    
                    # Evaluate fit
                    fit = self.evaluate_prediction_fit(pred, actual)
                    daily_fits.append(fit)
                    
                    # Update statistics
                    results['total_predictions'] += 1
                    
                    if timeframe not in results['by_timeframe']:
                        results['by_timeframe'][timeframe] = {
                            'total': 0,
                            'direction_correct': 0,
                            'target_hit': 0,
                            'avg_fit_score': 0,
                            'fit_scores': []
                        }
                    
                    tf_stats = results['by_timeframe'][timeframe]
                    tf_stats['total'] += 1
                    if fit['direction_correct']:
                        tf_stats['direction_correct'] += 1
                        results['direction_accuracy']['correct'] += 1
                    else:
                        results['direction_accuracy']['incorrect'] += 1
                    
                    if fit['target_hit']:
                        tf_stats['target_hit'] += 1
                        results['target_hit_rate']['hit'] += 1
                    elif fit['stop_hit']:
                        results['target_hit_rate']['stopped'] += 1
                    else:
                        results['target_hit_rate']['missed'] += 1
                    
                    if fit['confidence_justified']:
                        results['confidence_calibration']['justified'] += 1
                    else:
                        results['confidence_calibration']['unjustified'] += 1
                    
                    tf_stats['fit_scores'].append(fit['fit_score'])
                    results['fit_scores'].append(fit['fit_score'])
                    
                    # Print immediate feedback
                    symbol = "✅" if fit['direction_correct'] else "❌"
                    print(f"  {symbol} {timeframe:3} | Pred: {fit['prediction_direction']:11} | Actual: {fit['actual_direction']:7} | Fit Score: {fit['fit_score']:3}/100")
                
                results['daily_results'].append({
                    'date': date,
                    'fits': daily_fits
                })
                
                time.sleep(0.5)  # Rate limit
                
            except Exception as e:
                print(f"  ❌ Error processing {date}: {e}")
                continue
        
        # Calculate final statistics
        print("\n" + "=" * 70)
        print("📊 FIT ANALYSIS RESULTS")
        print("=" * 70)
        
        if results['total_predictions'] > 0:
            # Overall accuracy
            dir_accuracy = (results['direction_accuracy']['correct'] / results['total_predictions']) * 100
            print(f"\n🎯 OVERALL DIRECTIONAL ACCURACY: {dir_accuracy:.1f}%")
            print(f"   Correct: {results['direction_accuracy']['correct']}")
            print(f"   Incorrect: {results['direction_accuracy']['incorrect']}")
            
            # Target performance
            total_targets = results['target_hit_rate']['hit'] + results['target_hit_rate']['missed'] + results['target_hit_rate']['stopped']
            if total_targets > 0:
                hit_rate = (results['target_hit_rate']['hit'] / total_targets) * 100
                stop_rate = (results['target_hit_rate']['stopped'] / total_targets) * 100
                print(f"\n🎯 TARGET PERFORMANCE:")
                print(f"   Targets Hit: {results['target_hit_rate']['hit']} ({hit_rate:.1f}%)")
                print(f"   Stops Hit: {results['target_hit_rate']['stopped']} ({stop_rate:.1f}%)")
                print(f"   Missed Both: {results['target_hit_rate']['missed']}")
            
            # Confidence calibration
            conf_total = results['confidence_calibration']['justified'] + results['confidence_calibration']['unjustified']
            if conf_total > 0:
                conf_accuracy = (results['confidence_calibration']['justified'] / conf_total) * 100
                print(f"\n🎯 CONFIDENCE CALIBRATION: {conf_accuracy:.1f}%")
                print(f"   (High confidence when right, low when wrong)")
            
            # Average fit score
            avg_fit = np.mean(results['fit_scores']) if results['fit_scores'] else 0
            print(f"\n🎯 AVERAGE FIT SCORE: {avg_fit:.1f}/100")
            
            # By timeframe analysis
            print(f"\n📈 ACCURACY BY TIMEFRAME:")
            print("-" * 50)
            for tf in ['1m', '5m', '15m', '1h', '4h', '1d']:
                if tf in results['by_timeframe']:
                    stats = results['by_timeframe'][tf]
                    if stats['total'] > 0:
                        accuracy = (stats['direction_correct'] / stats['total']) * 100
                        avg_fit = np.mean(stats['fit_scores']) if stats['fit_scores'] else 0
                        print(f"  {tf:3} | Accuracy: {accuracy:5.1f}% | Avg Fit: {avg_fit:5.1f} | n={stats['total']}")
            
            # Signal distribution
            print(f"\n📊 SIGNAL DISTRIBUTION:")
            signal_counts = {}
            for day_result in results['daily_results']:
                for fit in day_result['fits']:
                    dir = fit['prediction_direction']
                    signal_counts[dir] = signal_counts.get(dir, 0) + 1
            
            for signal, count in sorted(signal_counts.items()):
                pct = (count / results['total_predictions']) * 100
                print(f"  {signal:11} : {count:3} ({pct:5.1f}%)")
            
            # Recommendations
            print(f"\n💡 ANALYSIS & RECOMMENDATIONS:")
            print("-" * 50)
            
            if dir_accuracy < 40:
                print("⚠️ Direction accuracy is LOW (<40%) - signals are not reliable")
                print("   • Check if signals are inverted")
                print("   • Review feature weights and thresholds")
            elif dir_accuracy < 60:
                print("📊 Direction accuracy is MODERATE (40-60%) - needs improvement")
                print("   • Fine-tune signal thresholds")
                print("   • Add more technical confirmations")
            else:
                print("✅ Direction accuracy is GOOD (>60%) - signals are working")
            
            if 'NEUTRAL' in signal_counts and signal_counts['NEUTRAL'] / results['total_predictions'] > 0.5:
                print("\n⚠️ Too many NEUTRAL signals (>50%)")
                print("   • Lower neutral thresholds")
                print("   • Increase signal sensitivity")
            
            if avg_fit < 50:
                print(f"\n⚠️ Low average fit score ({avg_fit:.1f}/100)")
                print("   • Predictions not matching market behavior well")
                print("   • Consider adjusting ATR multipliers")
                print("   • Review regime detection logic")
            
        else:
            print("❌ No predictions to analyze")
        
        return results

if __name__ == "__main__":
    # Run the fit analysis
    polygon_key = "Jm_fqc_gtSTSXG78P67dpBpO3LX_4P6D"
    
    backtest = FitAnalysisBacktest(polygon_key)
    results = backtest.run_comprehensive_backtest(days=5)
    
    # Save results
    with open('/home/user/webapp/backtest_fit_results.json', 'w') as f:
        json.dump(results, f, indent=2)
    
    print("\n✅ Results saved to backtest_fit_results.json")
    print("\n🎯 GOAL: Achieve 75% directional accuracy")
    current_accuracy = (results['direction_accuracy']['correct'] / results['total_predictions'] * 100) if results['total_predictions'] > 0 else 0
    print(f"📊 CURRENT: {current_accuracy:.1f}%")
    print(f"📈 NEEDED: +{75 - current_accuracy:.1f}% improvement")