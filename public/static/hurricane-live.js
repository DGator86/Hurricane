/**
 * Hurricane SPY Live Dashboard - Real-time data display with all features
 */

class HurricaneLiveDashboard {
    constructor() {
        this.predictions = {};
        this.flowData = {};
        this.healthData = {};
        this.magnets = [];
        this.highConfTrades = [];
        
        // Initialize on DOM ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.init());
        } else {
            this.init();
        }
    }
    
    init() {
        console.log('🚀 Hurricane Live Dashboard initializing...');
        this.setupEventListeners();
        this.loadAllData();
        this.startAutoRefresh();
    }
    
    setupEventListeners() {
        // Refresh button
        const refreshBtn = document.getElementById('refresh-btn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => this.loadAllData());
        }
    }
    
    async loadAllData() {
        console.log('📊 Loading all dashboard data...');
        
        // Show loading states
        this.showLoading();
        
        try {
            // Load predictions
            const predResp = await fetch('/api/meteorology/predict?symbol=SPY');
            const predData = await predResp.json();
            this.predictions = predData;
            console.log('✅ Predictions loaded:', predData);
            
            // Load options flow
            const flowResp = await fetch('/api/options/flow?symbol=SPY');
            const flowData = await flowResp.json();
            this.flowData = flowData.flow || {};
            this.magnets = this.flowData.magnets || [];
            console.log('✅ Flow data loaded:', this.flowData);
            
            // Load health metrics
            const healthResp = await fetch('/api/meteorology/health');
            const healthData = await healthResp.json();
            this.healthData = healthData;
            console.log('✅ Health data loaded:', healthData);
            
            // Process and render all data
            this.processData();
            this.renderDashboard();
            
        } catch (error) {
            console.error('❌ Error loading data:', error);
            this.showError(error.message);
        }
    }
    
    showLoading() {
        const elements = ['predictions-grid', 'high-conf-list', 'flow-metrics', 'magnets-list', 'health-grid'];
        elements.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.innerHTML = '<div class="text-center py-4"><i class="fas fa-spinner fa-spin text-2xl"></i></div>';
            }
        });
    }
    
    showError(message) {
        const errorHtml = `<div class="text-red-400 text-center py-4">⚠️ ${message}</div>`;
        ['predictions-grid', 'high-conf-list'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = errorHtml;
        });
    }
    
    processData() {
        // Extract high confidence trades
        if (this.predictions.perTF) {
            this.highConfTrades = this.predictions.perTF.filter(tf => tf.confidence >= 0.75);
            console.log(`🎯 Found ${this.highConfTrades.length} high confidence trades`);
        }
        
        // Calculate Kelly sizes
        this.highConfTrades.forEach(trade => {
            trade.kellySize = this.calculateKellySize(trade.confidence, trade.winRate || 0.65);
        });
    }
    
    calculateKellySize(confidence, winRate) {
        // Fractional Kelly with λ=0.25
        const p = winRate;
        const q = 1 - p;
        const b = 2; // 2:1 payoff ratio
        const kelly = (p * b - q) / b;
        const fractionalKelly = kelly * 0.25;
        const sizePercent = Math.min(25, Math.max(0, fractionalKelly * confidence * 100));
        return sizePercent.toFixed(1);
    }
    
    renderDashboard() {
        this.renderMetrics();
        this.renderPredictions();
        this.renderHighConfidenceTrades();
        this.renderOptionsFlow();
        this.renderMagnets();
        this.renderHealth();
        this.updateTimestamp();
    }
    
    renderMetrics() {
        // Update top metrics
        const spot = this.predictions.spot || 505;
        document.getElementById('spy-price').textContent = `$${spot.toFixed(2)}`;
        
        // Update accuracy
        const accuracy = this.predictions.accuracy || 39.6;
        const accEl = document.getElementById('accuracy');
        if (accEl) {
            accEl.textContent = `${accuracy.toFixed(1)}%`;
            accEl.className = accuracy >= 75 ? 'text-2xl font-bold text-green-400' : 
                             accuracy >= 60 ? 'text-2xl font-bold text-yellow-400' : 
                             'text-2xl font-bold text-red-400';
        }
        
        // Update VIX
        const vix = this.predictions.vix || 15.82;
        document.getElementById('vix').textContent = vix.toFixed(2);
        document.getElementById('vix-regime').textContent = 
            vix < 12 ? 'Low Vol' : vix < 20 ? 'Normal' : vix < 30 ? 'High Vol' : 'Extreme';
        
        // Update win rate
        document.getElementById('win-rate').textContent = 
            `${(this.predictions.winRate || 68.5).toFixed(1)}%`;
        
        // Update health
        const health = (this.healthData.avgHealth || 0.65) * 100;
        const healthEl = document.getElementById('health-score');
        if (healthEl) {
            healthEl.textContent = `${health.toFixed(0)}%`;
            healthEl.className = health >= 80 ? 'text-2xl font-bold text-green-400' :
                                health >= 60 ? 'text-2xl font-bold text-yellow-400' :
                                'text-2xl font-bold text-red-400';
        }
    }
    
    renderPredictions() {
        const container = document.getElementById('predictions-grid');
        if (!container || !this.predictions.perTF) return;
        
        const html = this.predictions.perTF.map(tf => {
            const conf = (tf.confidence * 100).toFixed(1);
            const sideColor = tf.side === 'CALL' ? 'green' : 'red';
            const icon = tf.side === 'CALL' ? 'arrow-trend-up' : 'arrow-trend-down';
            const hurricaneCat = this.getHurricaneCategory(tf.confidence);
            
            return `
                <div class="bg-gray-700 rounded-lg p-3 border-l-4 border-${sideColor}-500">
                    <div class="flex justify-between items-center mb-2">
                        <div class="flex items-center gap-2">
                            <span class="text-lg font-bold">${tf.tf}</span>
                            <i class="fas fa-${icon} text-${sideColor}-400"></i>
                        </div>
                        <span class="text-${sideColor}-400 font-bold">${tf.side}</span>
                    </div>
                    <div class="text-sm space-y-1">
                        <div class="flex justify-between">
                            <span class="text-gray-400">Confidence:</span>
                            <span class="font-bold ${conf >= 75 ? 'text-green-400' : conf >= 60 ? 'text-yellow-400' : 'text-gray-400'}">${conf}%</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-gray-400">Hurricane:</span>
                            <span class="text-sm">${hurricaneCat}</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-gray-400">ATR:</span>
                            <span>$${(tf.atr || 1).toFixed(2)}</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-gray-400">Target:</span>
                            <span class="text-${sideColor}-400">$${(tf.target || 505).toFixed(2)}</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        
        container.innerHTML = html || '<div class="text-gray-400">No predictions available</div>';
    }
    
    renderHighConfidenceTrades() {
        const container = document.getElementById('high-conf-list');
        if (!container) return;
        
        if (this.highConfTrades.length === 0) {
            container.innerHTML = `
                <div class="text-center py-8 text-gray-400">
                    <i class="fas fa-search text-3xl mb-3"></i>
                    <p>No high confidence trades (≥75%) at this time</p>
                </div>
            `;
            return;
        }
        
        const html = this.highConfTrades.map(trade => {
            const sideColor = trade.side === 'CALL' ? 'green' : 'red';
            const conf = (trade.confidence * 100).toFixed(1);
            
            return `
                <div class="border-2 border-${sideColor}-500 bg-${sideColor}-900/20 rounded-lg p-4">
                    <div class="flex justify-between items-center mb-3">
                        <div class="flex items-center gap-2">
                            <i class="fas fa-trophy text-yellow-400"></i>
                            <span class="text-lg font-bold text-${sideColor}-400">${trade.tf} ${trade.side}</span>
                        </div>
                        <span class="text-2xl font-bold">${conf}%</span>
                    </div>
                    <div class="grid grid-cols-2 gap-2 text-sm mb-3">
                        <div>
                            <span class="text-gray-400">Entry:</span>
                            <span class="ml-1">$${(this.predictions.spot || 505).toFixed(2)}</span>
                        </div>
                        <div>
                            <span class="text-gray-400">Target:</span>
                            <span class="text-${sideColor}-400 ml-1">$${(trade.target || 505).toFixed(2)}</span>
                        </div>
                        <div>
                            <span class="text-gray-400">Stop:</span>
                            <span class="text-red-400 ml-1">$${((this.predictions.spot || 505) - (trade.atr || 1)).toFixed(2)}</span>
                        </div>
                        <div>
                            <span class="text-gray-400">Kelly:</span>
                            <span class="text-yellow-400 ml-1 font-bold">${trade.kellySize}%</span>
                        </div>
                    </div>
                    <button class="w-full bg-${sideColor}-600 hover:bg-${sideColor}-700 px-4 py-2 rounded font-bold transition-colors">
                        Execute ${trade.side} Trade
                    </button>
                </div>
            `;
        }).join('');
        
        container.innerHTML = html;
    }
    
    renderOptionsFlow() {
        const container = document.getElementById('flow-metrics');
        if (!container || !this.flowData) return;
        
        const dexZ = this.flowData.dex ? this.flowData.dex.zscore : 0;
        const gexZ = this.flowData.gex ? this.flowData.gex.zscore : 0;
        
        container.innerHTML = `
            <div class="grid grid-cols-2 gap-4">
                <div class="bg-gray-700 rounded-lg p-3">
                    <div class="text-gray-400 text-sm mb-1">DEX Z-Score</div>
                    <div class="text-2xl font-bold ${dexZ > 0 ? 'text-green-400' : 'text-red-400'}">
                        ${dexZ > 0 ? '+' : ''}${dexZ.toFixed(2)}
                    </div>
                    <div class="text-xs text-gray-400 mt-1">
                        ${Math.abs(dexZ) > 2 ? 'Extreme' : Math.abs(dexZ) > 1 ? 'Elevated' : 'Normal'}
                    </div>
                </div>
                <div class="bg-gray-700 rounded-lg p-3">
                    <div class="text-gray-400 text-sm mb-1">GEX Level</div>
                    <div class="text-2xl font-bold text-purple-400">
                        ${gexZ.toFixed(2)}
                    </div>
                    <div class="text-xs text-gray-400 mt-1">
                        ${gexZ > 2 ? 'High Gamma' : gexZ > 1 ? 'Moderate' : 'Low'}
                    </div>
                </div>
            </div>
        `;
    }
    
    renderMagnets() {
        const container = document.getElementById('magnets-list');
        if (!container) return;
        
        if (!this.magnets || this.magnets.length === 0) {
            container.innerHTML = '<div class="text-gray-500 text-sm">No price magnets detected</div>';
            return;
        }
        
        const html = this.magnets.slice(0, 5).map(m => {
            const icon = m.type === 'attractor' ? '🎯' : '🚫';
            const color = m.type === 'attractor' ? 'green' : 'red';
            const strength = (m.strength * 100).toFixed(0);
            
            return `
                <div class="flex justify-between items-center py-2 border-b border-gray-700">
                    <div class="flex items-center gap-2">
                        <span class="text-xl">${icon}</span>
                        <span class="font-bold">$${m.strike}</span>
                    </div>
                    <div class="text-right">
                        <span class="text-${color}-400 font-bold">${strength}%</span>
                        <div class="text-xs text-gray-400">${m.type}</div>
                    </div>
                </div>
            `;
        }).join('');
        
        container.innerHTML = html;
    }
    
    renderHealth() {
        const container = document.getElementById('health-grid');
        if (!container || !this.healthData.metrics) return;
        
        const timeframes = ['5m', '15m', '30m', '1h', '4h', '1d'];
        const html = timeframes.map(tf => {
            const metric = this.healthData.metrics[tf] || { score: 0.5 };
            const score = (metric.score * 100).toFixed(0);
            const color = metric.score >= 0.8 ? 'bg-green-500' :
                         metric.score >= 0.6 ? 'bg-yellow-500' :
                         metric.score >= 0.4 ? 'bg-orange-500' : 'bg-red-500';
            
            return `
                <div class="bg-gray-700 rounded-lg p-3 text-center">
                    <div class="text-sm font-bold mb-2">${tf}</div>
                    <div class="relative h-2 bg-gray-600 rounded-full overflow-hidden mb-2">
                        <div class="${color} h-full transition-all" style="width: ${score}%"></div>
                    </div>
                    <div class="text-xs">${score}%</div>
                </div>
            `;
        }).join('');
        
        container.innerHTML = html;
    }
    
    getHurricaneCategory(confidence) {
        if (confidence >= 0.90) return 'Cat-5 🌪️';
        if (confidence >= 0.80) return 'Cat-4 🌀';
        if (confidence >= 0.70) return 'Cat-3 🌊';
        if (confidence >= 0.60) return 'Cat-2 💨';
        if (confidence >= 0.50) return 'Cat-1 🌬️';
        return 'Tropical ☁️';
    }
    
    updateTimestamp() {
        const now = new Date();
        const timeStr = now.toLocaleTimeString('en-US');
        
        document.getElementById('current-time').textContent = timeStr;
        document.getElementById('last-update').textContent = `Last update: ${timeStr}`;
    }
    
    startAutoRefresh() {
        // Update clock every second
        setInterval(() => this.updateTimestamp(), 1000);
        
        // Refresh data every 30 seconds
        setInterval(() => this.loadAllData(), 30000);
    }
}

// Initialize dashboard when script loads
const hurricaneDashboard = new HurricaneLiveDashboard();

// Export for debugging
window.hurricaneDashboard = hurricaneDashboard;