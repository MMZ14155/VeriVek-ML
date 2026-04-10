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

// GPU 监控状态跟踪
let gpuErrorCount = 0;
const GPU_ERROR_THRESHOLD = 3;

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

                // 达到阈值后显示仪表板警告
                if (gpuErrorCount >= GPU_ERROR_THRESHOLD) {
                    showGPUErrorState();
                }
                return;
            }

            // 成功获取数据，重置错误计数并恢复正常显示
            gpuErrorCount = 0;
            hideGPUErrorState();
            updateGPUDisplay(data);
        })
        .catch(err => {
            console.error('Fetch error:', err);
            gpuErrorCount++;
            updateSidebarGPUError();

            if (gpuErrorCount >= GPU_ERROR_THRESHOLD) {
                showGPUErrorState();
            }
        });
}

// 显示 GPU 错误状态（替换正常显示为警告）
function showGPUErrorState() {
    // GPU 利用率卡片
    const normalDisplay = document.getElementById('gpu-normal-display');
    const errorDisplay = document.getElementById('gpu-error-display');
    const progressContainer = document.getElementById('gpu-progress-container');
    const metricCard = document.getElementById('gpu-metric-card');
    const iconNormal = document.getElementById('gpu-icon-normal');
    const iconWarning = document.getElementById('gpu-icon-warning');
    const iconContainer = document.getElementById('gpu-icon-container');

    if (normalDisplay) normalDisplay.classList.add('hidden');
    if (errorDisplay) errorDisplay.classList.remove('hidden');
    if (progressContainer) progressContainer.classList.add('hidden');

    // 切换图标
    if (iconNormal) iconNormal.classList.add('hidden');
    if (iconWarning) iconWarning.classList.remove('hidden');
    if (iconContainer) {
        iconContainer.classList.remove('bg-orange-500/20');
        iconContainer.classList.add('bg-amber-500/20');
    }

    // 改变边框为警告色
    if (metricCard) {
        metricCard.classList.remove('border-orange-500');
        metricCard.classList.add('border-amber-500');
    }

    // 显存卡片
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

// 隐藏 GPU 错误状态（恢复正常显示）
function hideGPUErrorState() {
    // GPU 利用率卡片恢复正常
    const normalDisplay = document.getElementById('gpu-normal-display');
    const errorDisplay = document.getElementById('gpu-error-display');
    const progressContainer = document.getElementById('gpu-progress-container');
    const metricCard = document.getElementById('gpu-metric-card');
    const iconNormal = document.getElementById('gpu-icon-normal');
    const iconWarning = document.getElementById('gpu-icon-warning');
    const iconContainer = document.getElementById('gpu-icon-container');

    if (normalDisplay) normalDisplay.classList.remove('hidden');
    if (errorDisplay) errorDisplay.classList.add('hidden');
    if (progressContainer) progressContainer.classList.remove('hidden');

    if (iconNormal) iconNormal.classList.remove('hidden');
    if (iconWarning) iconWarning.classList.add('hidden');
    if (iconContainer) {
        iconContainer.classList.add('bg-orange-500/20');
        iconContainer.classList.remove('bg-amber-500/20');
    }

    if (metricCard) {
        metricCard.classList.add('border-orange-500');
        metricCard.classList.remove('border-amber-500');
    }

    // 显存卡片恢复正常
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
        vramIconContainer.classList.add('bg-purple-500/20');
        vramIconContainer.classList.remove('bg-red-500/20');
    }

    if (vramCard) {
        vramCard.classList.add('border-purple-500');
        vramCard.classList.remove('border-red-500');
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

// 通用工具函数（被多个页面使用）
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// 页面加载后初始化 GPU 监控
document.addEventListener('DOMContentLoaded', () => {
    fetchGPUInfo();
    setInterval(fetchGPUInfo, 2000);
});