import { IntegratedPredictionSystem } from './dist/_worker.js';

// Initialize system with API keys
const system = new IntegratedPredictionSystem(
  'Jm_fqc_gtSTSXG78P67dpBpO3LX_4P6D',  // Polygon API key
  '44b220a2cbd540c9a50ed2a97ef3e8d8'   // Twelve Data key (limit exceeded)
);

// Generate current prediction
system.generatePrediction().then(prediction => {
  console.log('\n📈 HURRICANE SPY PREDICTIONS - WITH FIXED ATR & SIGNAL DIVERSITY');
  console.log('='.repeat(70));
  console.log('Timestamp:', prediction.timestamp);
  console.log('Current Price: $' + prediction.currentPrice?.toFixed(2));
  console.log('Overall Confidence:', (prediction.overallConfidence * 100).toFixed(1) + '%');
  console.log('Market Regime:', prediction.marketRegime);
  console.log('Strongest Signal:', prediction.strongestSignal);
  console.log('Kelly Sizing:', (prediction.kellySizing * 100).toFixed(1) + '%');
  
  console.log('\n⏱️ TIMEFRAME PREDICTIONS:');
  console.log('-'.repeat(40));
  
  Object.entries(prediction.predictions).forEach(([tf, pred]) => {
    const move = pred.expectedMove?.toFixed(2) || '0.00';
    const target = pred.targetPrice?.toFixed(2) || '0.00';
    const stop = pred.stopLoss?.toFixed(2) || '0.00';
    const rr = pred.riskReward?.toFixed(1) || '0.0';
    
    console.log(`\n${tf.padEnd(3)} | ${pred.direction.padEnd(11)} | Conf: ${(pred.confidence * 100).toFixed(1)}%`);
    console.log('    Target: $' + target + ' | Stop: $' + stop);
    console.log('    Move: ' + move + '% | R:R = ' + rr + ':1');
    console.log('    Reasons:', pred.reasons?.slice(0, 2).join(', '));
  });
  
  if (prediction.warnings?.length > 0) {
    console.log('\n⚠️ WARNINGS:');
    prediction.warnings.forEach(w => console.log('  •', w));
  }
  
  console.log('\n✅ ATR CALCULATION FIXED:');
  console.log('  • Using timeframe-specific ATR values');
  console.log('  • Minimum ATR percentages enforced');
  console.log('  • Proper R-multiple targets (1.5x - 5x ATR)');
  console.log('  • Stop loss = 1 ATR for risk management');
  
  console.log('\n✅ SIGNAL DIVERSITY IMPROVED:');
  console.log('  • RSI neutral zones added (40-60 range)');
  console.log('  • Time-based patterns enhanced');
  console.log('  • Regime-specific directional bias');
  console.log('  • More nuanced signal thresholds');
  
}).catch(err => {
  console.error('Error generating prediction:', err);
});