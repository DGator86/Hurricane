#!/usr/bin/env python3
"""
Simulated Fit Analysis - Test Current Predictions Against Synthetic Market Scenarios
This evaluates the QUALITY of our signals, not profit/loss
"""

import json
import requests
import numpy as np
from datetime import datetime
from typing import Dict, List

class SimulatedFitBacktest:
    def __init__(self):
        self.prediction_url = "http://localhost:3000/api/hurricane/prediction"
        
    def generate_market_scenario(self, scenario_type: str) -> Dict:
        """Generate different market scenarios to test against"""
        
        scenarios = {
            'strong_bullish': {
                'actual_move': 1.5,  # +1.5%
                'direction': 'BULLISH',
                'volatility': 'normal',
                'description': 'Strong uptrend day'
            },
            'moderate_bullish': {
                'actual_move': 0.5,  # +0.5%
                'direction': 'BULLISH',
                'volatility': 'normal',
                'description': 'Moderate up day'
            },
            'neutral_choppy': {
                'actual_move': 0.05,  # +0.05%
                'direction': 'NEUTRAL',
                'volatility': 'high',
                'description': 'Choppy sideways'
            },
            'moderate_bearish': {
                'actual_move': -0.5,  # -0.5%
                'direction': 'BEARISH',
                'volatility': 'normal',
                'description': 'Moderate down day'
            },
            'strong_bearish': {
                'actual_move': -1.5,  # -1.5%
                'direction': 'BEARISH',
                'volatility': 'high',
                'description': 'Strong downtrend day'
            },
            'volatile_reversal': {
                'actual_move': -0.3,  # -0.3% (started up, ended down)
                'direction': 'BEARISH',
                'volatility': 'extreme',
                'description': 'V-shaped reversal'
            },
            'gap_and_go': {
                'actual_move': 2.0,  # +2.0%
                'direction': 'BULLISH',
                'volatility': 'high',
                'description': 'Gap up and trend'
            },
            'fade_rally': {
                'actual_move': -0.8,  # -0.8%
                'direction': 'BEARISH',
                'volatility': 'high',
                'description': 'Failed breakout fade'
            }
        }
        
        return scenarios.get(scenario_type, scenarios['neutral_choppy'])
    
    def evaluate_prediction_against_scenario(self, prediction: Dict, scenario: Dict, timeframe: str) -> Dict:
        """Evaluate how well a prediction would perform in a given scenario"""
        
        pred = prediction['predictions'].get(timeframe, {})
        
        # Normalize prediction direction
        pred_direction = 'NEUTRAL'
        if pred.get('direction') in ['STRONG_BUY', 'BUY']:
            pred_direction = 'BULLISH'
        elif pred.get('direction') in ['STRONG_SELL', 'SELL']:
            pred_direction = 'BEARISH'
        
        # Calculate fit metrics
        fit = {
            'timeframe': timeframe,
            'prediction_direction': pred.get('direction', 'NEUTRAL'),
            'normalized_direction': pred_direction,
            'scenario_direction': scenario['direction'],
            'prediction_move': pred.get('expectedMove', 0),
            'scenario_move': scenario['actual_move'],
            'confidence': pred.get('confidence', 0),
            'risk_reward': pred.get('riskReward', 0)
        }
        
        # Direction accuracy
        fit['direction_correct'] = (pred_direction == scenario['direction'])
        if scenario['direction'] == 'NEUTRAL':
            # For neutral, both neutral predictions and small moves are acceptable
            fit['direction_correct'] = (pred_direction == 'NEUTRAL') or (abs(pred.get('expectedMove', 0)) < 0.2)
        
        # Move magnitude accuracy
        move_diff = abs(fit['prediction_move'] - fit['scenario_move'])
        fit['move_accuracy'] = max(0, 100 - (move_diff * 50))  # 50 points off per 1% difference
        
        # Confidence appropriateness
        if fit['direction_correct']:
            # When correct, higher confidence is better
            fit['confidence_score'] = fit['confidence'] * 100
        else:
            # When wrong, lower confidence is better
            fit['confidence_score'] = (1 - fit['confidence']) * 100
        
        # Risk/Reward appropriateness
        if scenario['volatility'] == 'extreme':
            # In extreme volatility, lower R:R is more conservative (good)
            fit['rr_appropriate'] = fit['risk_reward'] < 2
        else:
            # In normal conditions, higher R:R is good
            fit['rr_appropriate'] = fit['risk_reward'] >= 2
        
        # Calculate overall fit score
        fit['fit_score'] = 0
        
        # Direction is most important (40 points)
        if fit['direction_correct']:
            fit['fit_score'] += 40
        
        # Move accuracy (20 points max)
        fit['fit_score'] += fit['move_accuracy'] * 0.2
        
        # Confidence calibration (20 points max)
        fit['fit_score'] += fit['confidence_score'] * 0.2
        
        # Risk/Reward appropriateness (20 points)
        if fit['rr_appropriate']:
            fit['fit_score'] += 20
        
        return fit
    
    def run_comprehensive_test(self) -> Dict:
        """Test current predictions against multiple market scenarios"""
        
        print("\n🔬 SIMULATED FIT ANALYSIS - TESTING SIGNAL QUALITY")
        print("=" * 70)
        print("Testing current predictions against various market scenarios")
        print("=" * 70)
        
        # Get current predictions
        try:
            response = requests.get(self.prediction_url)
            if response.status_code != 200:
                print(f"❌ Failed to get predictions: {response.status_code}")
                return {}
            
            predictions = response.json()
            print(f"\n📊 Current Prediction Summary:")
            print(f"   Overall Confidence: {predictions.get('overallConfidence', 0)*100:.1f}%")
            print(f"   Strongest Signal: {predictions.get('strongestSignal', 'N/A')}")
            print(f"   Market Regime: {predictions.get('marketRegime', 'N/A')}")
            
        except Exception as e:
            print(f"❌ Error getting predictions: {e}")
            return {}
        
        # Test against each scenario
        results = {
            'scenarios': [],
            'by_timeframe': {},
            'overall_fit': [],
            'direction_accuracy': {'correct': 0, 'total': 0}
        }
        
        scenarios_to_test = [
            'strong_bullish',
            'moderate_bullish',
            'neutral_choppy',
            'moderate_bearish',
            'strong_bearish',
            'volatile_reversal',
            'gap_and_go',
            'fade_rally'
        ]
        
        timeframes = ['1m', '5m', '15m', '1h', '4h', '1d']
        
        print("\n" + "=" * 70)
        print("SCENARIO TESTING RESULTS")
        print("=" * 70)
        
        for scenario_type in scenarios_to_test:
            scenario = self.generate_market_scenario(scenario_type)
            scenario_results = {
                'type': scenario_type,
                'description': scenario['description'],
                'actual_move': scenario['actual_move'],
                'fits': []
            }
            
            print(f"\n📈 Scenario: {scenario['description']} ({scenario['actual_move']:+.1f}%)")
            print("-" * 50)
            
            for tf in timeframes:
                if tf in predictions.get('predictions', {}):
                    fit = self.evaluate_prediction_against_scenario(predictions, scenario, tf)
                    scenario_results['fits'].append(fit)
                    
                    # Update statistics
                    if tf not in results['by_timeframe']:
                        results['by_timeframe'][tf] = {
                            'correct': 0,
                            'total': 0,
                            'fit_scores': [],
                            'confidence_scores': []
                        }
                    
                    results['by_timeframe'][tf]['total'] += 1
                    results['by_timeframe'][tf]['fit_scores'].append(fit['fit_score'])
                    results['by_timeframe'][tf]['confidence_scores'].append(fit['confidence_score'])
                    
                    if fit['direction_correct']:
                        results['by_timeframe'][tf]['correct'] += 1
                        results['direction_accuracy']['correct'] += 1
                    
                    results['direction_accuracy']['total'] += 1
                    results['overall_fit'].append(fit['fit_score'])
                    
                    # Print result
                    symbol = "✅" if fit['direction_correct'] else "❌"
                    print(f"  {symbol} {tf:3} | Pred: {fit['normalized_direction']:7} vs {scenario['direction']:7} | Fit: {fit['fit_score']:.0f}/100")
            
            results['scenarios'].append(scenario_results)
        
        # Calculate summary statistics
        print("\n" + "=" * 70)
        print("📊 OVERALL FIT ANALYSIS")
        print("=" * 70)
        
        if results['direction_accuracy']['total'] > 0:
            overall_accuracy = (results['direction_accuracy']['correct'] / results['direction_accuracy']['total']) * 100
            overall_fit_score = np.mean(results['overall_fit']) if results['overall_fit'] else 0
            
            print(f"\n🎯 OVERALL DIRECTIONAL ACCURACY: {overall_accuracy:.1f}%")
            print(f"   Correct: {results['direction_accuracy']['correct']}/{results['direction_accuracy']['total']}")
            print(f"   Average Fit Score: {overall_fit_score:.1f}/100")
            
            # Timeframe breakdown
            print(f"\n📈 ACCURACY BY TIMEFRAME:")
            print("-" * 50)
            
            for tf in timeframes:
                if tf in results['by_timeframe']:
                    stats = results['by_timeframe'][tf]
                    if stats['total'] > 0:
                        accuracy = (stats['correct'] / stats['total']) * 100
                        avg_fit = np.mean(stats['fit_scores'])
                        avg_conf = np.mean(stats['confidence_scores'])
                        
                        print(f"  {tf:3} | Accuracy: {accuracy:5.1f}% | Fit: {avg_fit:5.1f} | Conf: {avg_conf:5.1f}")
            
            # Signal distribution analysis
            print(f"\n📊 SIGNAL DISTRIBUTION:")
            signal_counts = {}
            for tf_data in predictions.get('predictions', {}).values():
                direction = tf_data.get('direction', 'NEUTRAL')
                signal_counts[direction] = signal_counts.get(direction, 0) + 1
            
            total_signals = sum(signal_counts.values())
            for signal, count in sorted(signal_counts.items()):
                pct = (count / total_signals * 100) if total_signals > 0 else 0
                print(f"  {signal:11} : {count:2} ({pct:5.1f}%)")
            
            # Performance by scenario type
            print(f"\n📊 PERFORMANCE BY MARKET CONDITION:")
            print("-" * 50)
            
            scenario_performance = {}
            for scenario_result in results['scenarios']:
                scenario_type = scenario_result['type']
                fits = [f['fit_score'] for f in scenario_result['fits']]
                correct = sum(1 for f in scenario_result['fits'] if f['direction_correct'])
                total = len(scenario_result['fits'])
                
                if total > 0:
                    accuracy = (correct / total) * 100
                    avg_fit = np.mean(fits)
                    print(f"  {scenario_result['description']:20} | Accuracy: {accuracy:5.1f}% | Fit: {avg_fit:5.1f}")
            
            # Analysis and recommendations
            print(f"\n💡 ANALYSIS & RECOMMENDATIONS:")
            print("=" * 70)
            
            # Check overall accuracy
            if overall_accuracy < 30:
                print("🔴 CRITICAL: Accuracy below 30% - predictions are worse than random!")
                print("   • Signals may be inverted")
                print("   • Check data pipeline for errors")
                print("   • Review feature engineering")
            elif overall_accuracy < 50:
                print("🟡 WARNING: Accuracy below 50% - not tradeable yet")
                print("   • Too many NEUTRAL signals")
                print("   • Need stronger directional signals")
                print("   • Adjust thresholds to be more decisive")
            elif overall_accuracy < 75:
                print("🟢 GOOD: Accuracy above 50% but below target")
                print("   • System showing promise")
                print("   • Fine-tune thresholds")
                print("   • Add confirmation signals")
            else:
                print("✅ EXCELLENT: Accuracy meets 75% target!")
                print("   • System ready for paper trading")
                print("   • Monitor live performance")
            
            # Check signal distribution
            if 'NEUTRAL' in signal_counts and signal_counts['NEUTRAL'] / total_signals > 0.6:
                print("\n⚠️ TOO MANY NEUTRAL SIGNALS (>60%)")
                print("   • Lower neutral thresholds from ±0.6 to ±0.4")
                print("   • Increase base signal weights")
                print("   • Remove excessive dampening multipliers")
            
            # Specific improvements needed
            print(f"\n📈 PATH TO 75% ACCURACY:")
            improvement_needed = 75 - overall_accuracy
            print(f"   Current: {overall_accuracy:.1f}%")
            print(f"   Target: 75.0%")
            print(f"   Gap: {improvement_needed:.1f}%")
            
            if improvement_needed > 0:
                print(f"\n   Steps to close the gap:")
                print(f"   1. Reduce NEUTRAL threshold (currently ±0.6)")
                print(f"   2. Increase momentum signal weights")
                print(f"   3. Add volume confirmation requirements")
                print(f"   4. Implement pattern recognition")
                print(f"   5. Use actual options flow data")
        
        return results

if __name__ == "__main__":
    tester = SimulatedFitBacktest()
    results = tester.run_comprehensive_test()
    
    # Save results
    with open('/home/user/webapp/simulated_fit_results.json', 'w') as f:
        json.dump(results, f, indent=2, default=str)
    
    print("\n✅ Results saved to simulated_fit_results.json")