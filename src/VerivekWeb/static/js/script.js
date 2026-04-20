// Tailwind 配置
tailwind.config = {
    theme: {
        extend: {
            colors: {
                'verivek-dark': '#0a0a0f',
                'verivek-card': '#13131f',
                'verivek-accent': '#6366f1',
                'verivek-success': '#10b981',
                'verivek-warning': '#f59e0b',
                'verivek-danger': '#ef4444',
            },
            fontFamily: {
                sans: ['Inter', 'sans-serif'],
                mono: ['JetBrains Mono', 'monospace'],
            }
        }
    }
};

// GPU 监控变量
let gpuErrorCount = 0;
const GPU_ERROR_THRESHOLD = 3;

// 电源监控变量
let lastPowerStatus = null;

// 当前显示模式：'normal' | 'no_gpu' | 'no_power'
let currentDisplayMode = 'normal';

// GPU 信息更新函数（全局通用）
function fetchGPUInfo() {
    fetch('/api/gpu')
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                console.error('GPU info error:', data.error);
                gpuErrorCount++;

                // 更新侧边栏为错误状态
                updateSidebarGPUError();

                if (gpuErrorCount >= GPU_ERROR_THRESHOLD) {
                    showNoGPUState();
                }
                return;
            }

            gpuErrorCount = 0;

            checkAndUpdateDisplay(data);
        })
        .catch(err => {
            console.error('Fetch error:', err);
            gpuErrorCount++;
            updateSidebarGPUError();

            if (gpuErrorCount >= GPU_ERROR_THRESHOLD) {
                showNoGPUState();
            }
        });
}

// 检查电源状态并更新显示
async function checkAndUpdateDisplay(gpuData) {
    const acConnected = await fetchPowerStatus();

    if (acConnected === null) {
        // 无法获取电源状态，默认显示正常（依赖 GPU 数据）
        showNormalState(gpuData);
        return;
    }

    lastPowerStatus = acConnected;

    if (acConnected === false) {
        showNoPowerState();
    } else {
        showNormalState(gpuData);
    }
}

// 显示无显卡状态（最高优先级）
function showNoGPUState() {
    currentDisplayMode = 'no_gpu';

    const normalDisplay = document.getElementById('gpu-normal-display');
    const powerWarning = document.getElementById('gpu-power-warning');
    const errorDisplay = document.getElementById('gpu-error-display');
    const progressContainer = document.getElementById('gpu-progress-container');
    const metricCard = document.getElementById('gpu-metric-card');
    const iconNormal = document.getElementById('gpu-icon-normal');
    const iconWarning = document.getElementById('gpu-icon-warning');
    const iconContainer = document.getElementById('gpu-icon-container');

    if (normalDisplay) normalDisplay.classList.add('hidden');
    if (powerWarning) powerWarning.classList.add('hidden');
    if (errorDisplay) errorDisplay.classList.remove('hidden');
    if (progressContainer) progressContainer.classList.add('hidden');

    if (iconNormal) iconNormal.classList.add('hidden');
    if (iconWarning) iconWarning.classList.remove('hidden');
    if (iconContainer) {
        iconContainer.classList.remove('bg-orange-500/20', 'bg-amber-500/20');
        iconContainer.classList.add('bg-amber-500/20');
    }

    if (metricCard) {
        metricCard.classList.remove('border-orange-500', 'border-indigo-500');
        metricCard.classList.add('border-amber-500');
    }

    // 显存卡片显示错误
    const vramNormal = document.getElementById('vram-normal-display');
    const vramError = document.getElementById('vram-error-display');
    const vramProgress = document.getElementById('vram-progress-container');
    const vramCard = document.getElementById('vram-metric-card');
    const vramIconNormal = document.getElementById('vram-icon-normal');
    const vramIconWarning = document.getElementById('vram-icon-warning');
    const vramIconContainer = document.getElementById('vram-icon-container');

    if (vramNormal) vramNormal.classList.add('hidden');
    if (vramError) vramError.classList.remove('hidden');
    if (vramProgress) vramProgress.classList.add('hidden');

    if (vramIconNormal) vramIconNormal.classList.add('hidden');
    if (vramIconWarning) vramIconWarning.classList.remove('hidden');
    if (vramIconContainer) {
        vramIconContainer.classList.remove('bg-purple-500/20');
        vramIconContainer.classList.add('bg-red-500/20');
    }

    if (vramCard) {
        vramCard.classList.remove('border-purple-500');
        vramCard.classList.add('border-red-500');
    }
}

// 显示未插电状态
function showNoPowerState() {
    currentDisplayMode = 'no_power';

    // GPU 利用率卡片 - 显示电源警告
    const normalDisplay = document.getElementById('gpu-normal-display');
    const powerWarning = document.getElementById('gpu-power-warning');
    const errorDisplay = document.getElementById('gpu-error-display');
    const progressContainer = document.getElementById('gpu-progress-container');
    const metricCard = document.getElementById('gpu-metric-card');
    const iconNormal = document.getElementById('gpu-icon-normal');
    const iconWarning = document.getElementById('gpu-icon-warning');
    const iconContainer = document.getElementById('gpu-icon-container');

    if (normalDisplay) normalDisplay.classList.add('hidden');
    if (powerWarning) powerWarning.classList.remove('hidden');
    if (errorDisplay) errorDisplay.classList.add('hidden');
    if (progressContainer) progressContainer.classList.add('hidden');

    // 切换为电源图标
    if (iconNormal) iconNormal.classList.add('hidden');
    if (iconWarning) iconWarning.classList.remove('hidden');
    if (iconContainer) {
        iconContainer.classList.remove('bg-orange-500/20', 'bg-amber-500/20');
        iconContainer.classList.add('bg-amber-500/20');
    }

    if (metricCard) {
        metricCard.classList.remove('border-orange-500', 'border-amber-500');
        metricCard.classList.add('border-amber-500');
    }

    resetVRAMDisplay();
}

// 显示正常状态
function showNormalState(data) {
    currentDisplayMode = 'normal';

    const normalDisplay = document.getElementById('gpu-normal-display');
    const powerWarning = document.getElementById('gpu-power-warning');
    const errorDisplay = document.getElementById('gpu-error-display');
    const progressContainer = document.getElementById('gpu-progress-container');
    const metricCard = document.getElementById('gpu-metric-card');
    const iconNormal = document.getElementById('gpu-icon-normal');
    const iconWarning = document.getElementById('gpu-icon-warning');
    const iconContainer = document.getElementById('gpu-icon-container');

    if (normalDisplay) normalDisplay.classList.remove('hidden');
    if (powerWarning) powerWarning.classList.add('hidden');
    if (errorDisplay) errorDisplay.classList.add('hidden');
    if (progressContainer) progressContainer.classList.remove('hidden');

    if (iconNormal) iconNormal.classList.remove('hidden');
    if (iconWarning) iconWarning.classList.add('hidden');
    if (iconContainer) {
        iconContainer.classList.remove('bg-amber-500/20', 'bg-red-500/20');
        iconContainer.classList.add('bg-orange-500/20');
    }

    if (metricCard) {
        metricCard.classList.remove('border-amber-500', 'border-red-500');
        metricCard.classList.add('border-orange-500');
    }

    updateGPUDisplay(data);
}

// 重置显存显示为正常状态
function resetVRAMDisplay() {
    const vramNormal = document.getElementById('vram-normal-display');
    const vramError = document.getElementById('vram-error-display');
    const vramProgress = document.getElementById('vram-progress-container');
    const vramCard = document.getElementById('vram-metric-card');
    const vramIconNormal = document.getElementById('vram-icon-normal');
    const vramIconWarning = document.getElementById('vram-icon-warning');
    const vramIconContainer = document.getElementById('vram-icon-container');

    if (vramNormal) vramNormal.classList.remove('hidden');
    if (vramError) vramError.classList.add('hidden');
    if (vramProgress) vramProgress.classList.remove('hidden');

    if (vramIconNormal) vramIconNormal.classList.remove('hidden');
    if (vramIconWarning) vramIconWarning.classList.add('hidden');
    if (vramIconContainer) {
        vramIconContainer.classList.remove('bg-red-500/20');
        vramIconContainer.classList.add('bg-purple-500/20');
    }

    if (vramCard) {
        vramCard.classList.remove('border-red-500');
        vramCard.classList.add('border-purple-500');
    }
}

// 更新侧边栏 GPU 错误状态
function updateSidebarGPUError() {
    const gpuText = document.getElementById('gpu-memory-text');
    const gpuBar = document.getElementById('gpu-memory-bar');

    if (gpuText) gpuText.innerText = '未连接';
    if (gpuBar) {
        gpuBar.style.width = '0%';
        gpuBar.classList.remove('bg-indigo-500');
        gpuBar.classList.add('bg-gray-700');
    }
}

// 更新 GPU 正常显示数据
function updateGPUDisplay(data) {
    if (typeof isDemoMode === 'function' && isDemoMode()) {
        return;
    }

    const totalGB = (data.total_memory_mb / 1024).toFixed(1);
    const usedGB = (data.used_memory_mb / 1024).toFixed(1);
    const percent = data.usage_percent;

    // 侧边栏
    const gpuText = document.getElementById('gpu-memory-text');
    const gpuBar = document.getElementById('gpu-memory-bar');

    if (gpuText) gpuText.innerText = `${usedGB} / ${totalGB} GB`;
    if (gpuBar) {
        gpuBar.style.width = `${percent}%`;
        gpuBar.classList.remove('bg-gray-700');
        gpuBar.classList.add('bg-indigo-500');
    }

    // 仪表板 GPU 利用率
    const dashboardGpu = document.getElementById('dashboard-gpu-percent');
    const dashboardGpuBar = document.getElementById('dashboard-gpu-bar');
    const gpuStatusText = document.getElementById('gpu-status-text');

    if (dashboardGpu) dashboardGpu.textContent = Math.round(percent) + '%';
    if (dashboardGpuBar) dashboardGpuBar.style.width = percent + '%';
    if (gpuStatusText) {
        const taskCount = Math.ceil(percent / 30); // 模拟任务数
        gpuStatusText.textContent = taskCount > 0 ? `${taskCount}个任务运行中` : '空闲';
    }

    // 仪表板显存占用
    const dashboardVram = document.getElementById('dashboard-vram-text');
    const dashboardVramBar = document.getElementById('dashboard-vram-bar');
    const vramRemaining = document.getElementById('vram-remaining');

    if (dashboardVram) {
        dashboardVram.innerHTML = `${usedGB}<span class="text-lg text-gray-500">/${totalGB} GB</span>`;
    }
    if (dashboardVramBar) {
        const vramPercent = (data.used_memory_mb / data.total_memory_mb) * 100;
        dashboardVramBar.style.width = vramPercent + '%';
    }
    if (vramRemaining) {
        const freeGB = (data.total_memory_mb - data.used_memory_mb) / 1024;
        vramRemaining.textContent = `剩余 ${freeGB.toFixed(1)} GB`;
        vramRemaining.className = freeGB < 2 ? 'text-xs text-red-400' : 'text-xs text-purple-400';
    }
}

// 获取电源状态
function fetchPowerStatus() {
    return fetch('/api/power')
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                return data.data.ac_connected;
            }
            return null;
        })
        .catch(err => {
            console.error('Power status fetch error:', err);
            return null;
        });
}

// 通用工具函数
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// 侧边栏数量更新
function updateSidebarCounts() {
    fetch('/api/datasets')
        .then(r => r.json())
        .then(data => {
            const el = document.getElementById('sidebar-dataset-count');
            if (el && data.success) {
                el.textContent = data.total || (data.datasets ? data.datasets.length : 0);
            }
        })
        .catch(() => {});

    fetch('/api/models')
        .then(r => r.json())
        .then(data => {
            const el = document.getElementById('sidebar-model-count');
            if (el && data.success) {
                el.textContent = data.total || (data.models ? data.models.length : 0);
            }
        })
        .catch(() => {});
}

// 页面加载后初始化 GPU 监控
document.addEventListener('DOMContentLoaded', () => {
    fetchGPUInfo();
    setInterval(fetchGPUInfo, 2000);
    initDemoMode();
    updateSidebarCounts();
});

// ========== 演示模式（极致隐蔽） ==========
// 触发方式：1秒内连续按 3 次 `~` 键
// 状态标记：品牌后缀颜色、版本号边框/背景色发生微妙变化
// 状态存储键名伪装成缓存相关键
const DEMO_KEY = '__vv_cache_key';
let tildeCount = 0;
let tildeTimer = null;

function isDemoMode() {
    return localStorage.getItem(DEMO_KEY) === '1';
}

function setDemoMode(enabled) {
    localStorage.setItem(DEMO_KEY, enabled ? '1' : '0');
    applyDemoMarker();
}

function applyDemoMarker() {
    const suffix = document.getElementById('brand-suffix');
    const badge = document.getElementById('version-badge');
    const active = isDemoMode();
    if (suffix) {
        suffix.classList.toggle('text-indigo-400', !active);
        suffix.classList.toggle('text-amber-400/60', active);
    }
    if (badge) {
        badge.classList.toggle('bg-indigo-500/20', !active);
        badge.classList.toggle('text-indigo-300', !active);
        badge.classList.toggle('border-indigo-500/30', !active);
        badge.classList.toggle('bg-amber-500/10', active);
        badge.classList.toggle('text-amber-300/70', active);
        badge.classList.toggle('border-amber-500/20', active);
    }
}

function initDemoMode() {
    applyDemoMarker();
    document.addEventListener('keydown', (e) => {
        if (e.key !== '~' && e.key !== '`') return;
        e.preventDefault();
        tildeCount++;
        if (!tildeTimer) {
            tildeTimer = setTimeout(() => {
                tildeCount = 0;
                tildeTimer = null;
            }, 1000);
        }
        if (tildeCount >= 3) {
            clearTimeout(tildeTimer);
            tildeTimer = null;
            tildeCount = 0;
            setDemoMode(!isDemoMode());
        }
    });
}