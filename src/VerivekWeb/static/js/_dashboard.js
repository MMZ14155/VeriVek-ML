document.addEventListener('DOMContentLoaded', function() {
    // 初始化训练趋势图表
    const chartCanvas = document.getElementById('trainingChart');
    if (chartCanvas) {
        const ctx = chartCanvas.getContext('2d');
        const gradient = ctx.createLinearGradient(0, 0, 0, 400);
        gradient.addColorStop(0, 'rgba(99, 102, 241, 0.3)');
        gradient.addColorStop(1, 'rgba(99, 102, 241, 0)');

        new Chart(ctx, {
            type: 'line',
            data: {
                labels: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'],
                datasets: [{
                    label: '训练任务数',
                    data: [12, 19, 15, 25, 22, 30, 28],
                    borderColor: '#6366f1',
                    backgroundColor: gradient,
                    fill: true,
                    tension: 0.4,
                    borderWidth: 3
                }, {
                    label: '完成率 (%)',
                    data: [85, 88, 82, 90, 87, 92, 94],
                    borderColor: '#10b981',
                    borderDash: [5, 5],
                    fill: false,
                    tension: 0.4,
                    borderWidth: 2,
                    yAxisID: 'y1'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false,
                },
                plugins: {
                    legend: {
                        display: true,
                        labels: { color: '#9ca3af' }
                    }
                },
                scales: {
                    x: {
                        grid: { color: 'rgba(255, 255, 255, 0.05)' },
                        ticks: { color: '#9ca3af' }
                    },
                    y: {
                        grid: { color: 'rgba(255, 255, 255, 0.05)' },
                        ticks: { color: '#9ca3af' },
                        beginAtZero: true
                    },
                    y1: {
                        position: 'right',
                        grid: { drawOnChartArea: false },
                        ticks: { color: '#10b981', callback: value => value + '%' },
                        min: 0,
                        max: 100
                    }
                }
            }
        });
    }

    // 演示模式由全局 isDemoMode() 控制（快捷键触发）
    if (typeof isDemoMode === 'function' && isDemoMode()) {
        loadActiveTasksWithDemo();
    } else {
        loadActiveTasks();
    }

    loadRecentActivity();
});

// 演示模式：加载任务并叠加高显存占用效果
async function loadActiveTasksWithDemo() {
    await loadActiveTasks();

    // 激活演示效果（高占用）
    const demoStr = localStorage.getItem('verivek_demo_training');
    if (demoStr) {
        activateDemoMode();
    }
}

// 加载活跃任务
async function loadActiveTasks() {
    try {
        let tasks = [];
        const demoTrainingStr = localStorage.getItem('verivek_demo_training');

        // 尝试获取真实数据（失败也不影响演示）
        try {
            const response = await fetch('/api/trainings');
            const data = await response.json();
            if (data.success) {
                tasks = data.trainings || [];
            }
        } catch (err) {
            console.log('[演示模式] 使用模拟数据，忽略API错误');
        }

        // 演示模式下才注入演示数据
        if (demoTrainingStr && typeof isDemoMode === 'function' && isDemoMode()) {
            const demoTraining = JSON.parse(demoTrainingStr);
            // 避免重复添加
            const exists = tasks.some(t => t.training_id === demoTraining.training_id);
            if (!exists) {
                tasks.unshift(demoTraining);
            }
        }

        // 过滤活跃任务（包括演示任务）
        const activeTasks = tasks.filter(t => ['running', 'pending'].includes(t.status));

        updateTaskStats(activeTasks);
        renderActiveTasks(activeTasks);

        // 演示模式下才模拟进度动画
        if (demoTrainingStr && activeTasks.some(t => t.is_demo) && typeof isDemoMode === 'function' && isDemoMode()) {
            simulateDemoProgress();
        }

    } catch (err) {
        console.error('Error loading tasks:', err);
        document.getElementById('active-tasks-list').innerHTML = `
            <div class="flex flex-col items-center justify-center p-8 text-gray-500">
                <span class="text-sm">加载失败</span>
            </div>
        `;
    }
}

// 演示模式：高显存占用显示
function activateDemoMode() {
    console.log('[演示模式] 激活高显存占用显示');

    // 演示显存配置
    const TOTAL_VRAM_GB = 8.0;
    const USED_VRAM_GB = 7.2;  // 90%占用
    const VRAM_PERCENT = 90.0;
    const GPU_UTIL = 94;       // GPU利用率94%

    // 更新显存卡片 - 高占用警告样式（红色）
    const vramText = document.getElementById('dashboard-vram-text');
    const vramBar = document.getElementById('dashboard-vram-bar');
    const vramRemaining = document.getElementById('vram-remaining');
    const vramCard = document.getElementById('vram-metric-card');
    const vramIconNormal = document.getElementById('vram-icon-normal');
    const vramIconWarning = document.getElementById('vram-icon-warning');
    const vramIconContainer = document.getElementById('vram-icon-container');

    if (vramText) {
        vramText.innerHTML = `${USED_VRAM_GB.toFixed(1)}<span class="text-lg text-gray-500">/${TOTAL_VRAM_GB.toFixed(0)} GB</span>`;
    }
    if (vramBar) {
        vramBar.style.width = VRAM_PERCENT + '%';
        // 高占用时变为红色警告
        vramBar.classList.remove('bg-purple-500');
        vramBar.classList.add('bg-red-500');
    }
    if (vramRemaining) {
        const freeGB = TOTAL_VRAM_GB - USED_VRAM_GB;
        vramRemaining.textContent = `⚠️ 仅剩 ${freeGB.toFixed(1)} GB`;
        vramRemaining.className = 'text-xs text-red-400 font-bold animate-pulse';
    }
    if (vramCard) {
        vramCard.classList.remove('border-purple-500');
        vramCard.classList.add('border-red-500');
    }

    // 切换显存图标为警告状态
    if (vramIconNormal) vramIconNormal.classList.add('hidden');
    if (vramIconWarning) vramIconWarning.classList.remove('hidden');
    if (vramIconContainer) {
        vramIconContainer.classList.remove('bg-purple-500/20');
        vramIconContainer.classList.add('bg-red-500/20');
    }

    // 更新GPU利用率卡片也为高负载（红色）
    const gpuText = document.getElementById('dashboard-gpu-percent');
    const gpuBar = document.getElementById('dashboard-gpu-bar');
    const gpuStatus = document.getElementById('gpu-status-text');
    const gpuCard = document.getElementById('gpu-metric-card');
    const gpuIconNormal = document.getElementById('gpu-icon-normal');
    const gpuIconWarning = document.getElementById('gpu-icon-warning');
    const gpuIconContainer = document.getElementById('gpu-icon-container');

    if (gpuText) gpuText.textContent = GPU_UTIL + '%';
    if (gpuBar) {
        gpuBar.style.width = GPU_UTIL + '%';
        gpuBar.classList.remove('bg-orange-500');
        gpuBar.classList.add('bg-red-500');
    }
    if (gpuStatus) {
        gpuStatus.textContent = '高负载';
        gpuStatus.className = 'text-xs text-red-400 font-semibold';
    }
    if (gpuCard) {
        gpuCard.classList.remove('border-orange-500');
        gpuCard.classList.add('border-red-500');
    }

    // 切换GPU图标为警告
    if (gpuIconNormal) gpuIconNormal.classList.add('hidden');
    if (gpuIconWarning) gpuIconWarning.classList.remove('hidden');
    if (gpuIconContainer) {
        gpuIconContainer.classList.remove('bg-orange-500/20', 'bg-amber-500/20');
        gpuIconContainer.classList.add('bg-red-500/20');
    }

    // 更新侧边栏系统状态（演示高占用显示）
    const sidebarGpuText = document.getElementById('gpu-memory-text');
    const sidebarGpuBar = document.getElementById('gpu-memory-bar');
    if (sidebarGpuText) {
        sidebarGpuText.innerText = `${USED_VRAM_GB.toFixed(1)} / ${TOTAL_VRAM_GB.toFixed(0)} GB`;
        sidebarGpuText.classList.add('text-red-400');
    }
    if (sidebarGpuBar) {
        sidebarGpuBar.style.width = `${VRAM_PERCENT}%`;
        sidebarGpuBar.classList.remove('bg-indigo-500');
        sidebarGpuBar.classList.add('bg-red-500');
    }

    // 显示侧边栏训练徽章（闪烁效果）
    const badge = document.getElementById('training-badge');
    if (badge) {
        badge.classList.remove('hidden');
        badge.classList.add('animate-pulse');
    }

    // 更新活跃任务数（演示任务+真实任务）
    const countEl = document.getElementById('active-task-count');
    const statusEl = document.getElementById('active-task-status');
    const detailEl = document.getElementById('active-task-detail');

    const currentCount = parseInt(countEl?.textContent || '0');
    if (countEl) countEl.textContent = (currentCount + 1).toString();
    if (statusEl) {
        statusEl.textContent = '高显存占用';
        statusEl.className = 'text-xs text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full border border-red-500/20 animate-pulse';
    }
    if (detailEl) detailEl.textContent = `显存高占用: ${USED_VRAM_GB}GB/${TOTAL_VRAM_GB}GB • 1个演示任务运行中`;

    // 显示顶部演示横幅（如果页面中有）
    const demoBanner = document.getElementById('demo-banner');
    if (demoBanner) {
        demoBanner.classList.remove('hidden');
        demoBanner.querySelector('span.text-purple-300').textContent = '演示模式：显存高占用 (7.2GB/8GB)';
    }
}

// 更新任务统计
function updateTaskStats(tasks) {
    const countEl = document.getElementById('active-task-count');
    const statusEl = document.getElementById('active-task-status');
    const detailEl = document.getElementById('active-task-detail');

    if (!countEl) return;

    const runningCount = tasks.filter(t => t.status === 'running').length;
    const pendingCount = tasks.filter(t => t.status === 'pending').length;
    const demoCount = tasks.filter(t => t.is_demo).length;
    const totalCount = tasks.length;

    countEl.textContent = totalCount;

    if (totalCount === 0) {
        statusEl.textContent = '无活跃任务';
        statusEl.className = 'text-xs text-gray-400 bg-gray-500/10 px-2 py-0.5 rounded-full border border-gray-500/20';
        detailEl.textContent = '所有任务已完成或停止';
    } else {
        const parts = [];
        if (runningCount > 0) parts.push(`${runningCount}个运行中`);
        if (pendingCount > 0) parts.push(`${pendingCount}个待启动`);
        if (demoCount > 0) parts.push('(含演示)');

        if (demoCount > 0) {
            statusEl.textContent = '演示模式';
            statusEl.className = 'text-xs text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded-full border border-purple-500/20';
        } else {
            statusEl.textContent = runningCount > 0 ? '运行正常' : '等待启动';
            statusEl.className = runningCount > 0
                ? 'text-xs text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20'
                : 'text-xs text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20';
        }
        detailEl.textContent = parts.join(' • ');
    }
}

// 渲染活跃任务列表
function renderActiveTasks(tasks) {
    const container = document.getElementById('active-tasks-list');
    if (!container) return;

    if (tasks.length === 0) {
        container.innerHTML = `
            <div class="flex flex-col items-center justify-center p-8 text-gray-500">
                <svg class="w-12 h-12 mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path>
                </svg>
                <p class="text-sm">暂无活跃任务</p>
                <a href="/training" class="mt-3 px-4 py-2 bg-indigo-600/30 hover:bg-indigo-600/50 rounded-lg text-xs text-indigo-300 transition-colors">
                    创建新训练 →
                </a>
            </div>
        `;
        return;
    }

    const statusConfig = {
        running: { label: '运行中', colorClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30', icon: 'running', iconColor: 'text-emerald-400' },
        pending: { label: '待启动', colorClass: 'bg-blue-500/20 text-blue-300 border-blue-500/30', icon: 'pending', iconColor: 'text-blue-400' }
    };

    const colorClasses = ['indigo', 'purple', 'emerald', 'blue', 'orange'];

    container.innerHTML = tasks.map((t, index) => {
        const status = statusConfig[t.status] || statusConfig.pending;
        const color = colorClasses[index % colorClasses.length];
        const progress = t.progress || 0;
        const hp = t.hyperparameters || {};
        const isDemo = t.is_demo || (t.training_id && t.training_id.toString().startsWith('demo_'));

        const demoHighlight = isDemo ? 'border-l-4 border-red-500 bg-red-500/5' : '';
        const vramInfo = isDemo ? `<span class="text-red-400 font-semibold">显存高占用</span>` : '';

        return `
            <div class="flex items-center p-4 bg-white/5 rounded-xl border border-white/5 hover:border-${isDemo ? 'red' : color}-500/30 transition-all group ${demoHighlight}">
                <div class="w-10 h-10 rounded-lg bg-${isDemo ? 'red' : color}-500/20 flex items-center justify-center mr-4 flex-shrink-0">
                    <svg class="w-5 h-5 ${isDemo ? 'text-red-400' : status.iconColor}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        ${getStatusIcon(status.icon)}
                    </svg>
                </div>
                <div class="flex-1 min-w-0">
                    <div class="flex items-center justify-between mb-1">
                        <div class="flex items-center space-x-2">
                            <h4 class="font-medium text-sm truncate ${isDemo ? 'text-red-200' : 'text-white'}">${escapeHtml(t.training_name || '未命名训练')}</h4>
                            <span class="px-1.5 py-0.5 text-[10px] ${status.colorClass} rounded border">${status.label}</span>
                        </div>
                        <span class="text-xs text-gray-400 font-mono">${isDemo ? 'DEMO-' + Math.floor(Math.random()*1000) : '#' + t.training_id}</span>
                    </div>
                    <div class="flex items-center space-x-4 text-xs text-gray-400 mb-2">
                        <span>模型: <span class="text-white font-mono">${escapeHtml(t.model_name || 'Unknown')}</span></span>
                        <span>Epochs: <span class="text-white font-mono">${hp.epochs || '-'}</span></span>
                        <span>Batch: <span class="text-white font-mono">${hp.batch_size || '-'}</span></span>
                        ${vramInfo}
                    </div>
                    <div class="w-full bg-gray-800 rounded-full h-1.5">
                        <div class="bg-gradient-to-r from-${isDemo ? 'red' : color}-500 to-${isDemo ? 'orange' : color}-400 h-1.5 rounded-full transition-all duration-500" style="width: ${progress}%"></div>
                    </div>
                </div>
                <div class="ml-4 flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button class="p-2 hover:bg-red-500/20 rounded-lg transition-colors text-gray-400 hover:text-red-400" 
                            title="${isDemo ? '停止演示' : '删除'}" 
                            onclick="stopTask('${t.training_id}')">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z"></path>
                        </svg>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

// 获取状态图标
function getStatusIcon(status) {
    const icons = {
        running: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path>',
        pending: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>'
    };
    return icons[status] || icons.pending;
}

// 模拟演示任务进度增长
function simulateDemoProgress() {
    const demoStr = localStorage.getItem('verivek_demo_training');
    if (!demoStr) return;

    const demo = JSON.parse(demoStr);
    if (demo.status !== 'running') return;

    // 每2秒增加一点进度，模拟训练进行
    const interval = setInterval(() => {
        const current = localStorage.getItem('verivek_demo_training');
        if (!current) {
            clearInterval(interval);
            return;
        }

        const data = JSON.parse(current);
        if (data.status === 'running' && data.progress < 95) {
            // 随机增加0.5-2%
            data.progress += Math.random() * 0.4 + 0.1;
            if (data.progress > 95) data.progress = 95;
            localStorage.setItem('verivek_demo_training', JSON.stringify(data));

            // 更新进度条显示
            const progressBars = document.querySelectorAll('#active-tasks-list .bg-gradient-to-r');
            if (progressBars.length > 0 && data.is_demo) {
                // 找到第一个演示任务的进度条（通常是第一个）
                progressBars[0].style.width = data.progress + '%';
            }
        } else {
            clearInterval(interval);
        }
    }, 10000);
}

// 加载最近动态
async function loadRecentActivity() {
    try {
        const response = await fetch('/api/trainings');
        const data = await response.json();

        if (!data.success) {
            console.error('Failed to load activity:', data.error);
            return;
        }

        const tasks = data.trainings || [];
        // 获取最近完成的任务或状态变化
        const recentTasks = tasks
            .filter(t => ['completed', 'failed', 'cancelled'].includes(t.status) || t.completed_at)
            .slice(0, 5); // 最近5条

        // 演示模式下才将演示任务加入最近动态
        const demoStr = localStorage.getItem('verivek_demo_training');
        if (demoStr && typeof isDemoMode === 'function' && isDemoMode()) {
            const demo = JSON.parse(demoStr);
            recentTasks.unshift({
                ...demo,
                status: 'running',
                created_at: demo.created_at
            });
            if (recentTasks.length > 5) recentTasks.pop();
        }

        renderRecentActivity(recentTasks);
    } catch (err) {
        console.error('Error loading activity:', err);
        document.getElementById('recent-activity-list').innerHTML = `
            <div class="text-center text-gray-500 text-xs py-4">加载失败</div>
        `;
    }
}

// 渲染最近动态
function renderRecentActivity(tasks) {
    const container = document.getElementById('recent-activity-list');
    if (!container) return;

    if (tasks.length === 0) {
        container.innerHTML = `
            <div class="text-center text-gray-500 text-xs py-4">暂无最近动态</div>
        `;
        return;
    }

    const statusColors = {
        completed: { bg: 'bg-emerald-500/5', border: 'border-emerald-500/10', dot: 'bg-emerald-500', text: 'text-emerald-400' },
        failed: { bg: 'bg-red-500/5', border: 'border-red-500/10', dot: 'bg-red-500', text: 'text-red-400' },
        cancelled: { bg: 'bg-gray-500/5', border: 'border-gray-500/10', dot: 'bg-gray-500', text: 'text-gray-400' },
        running: { bg: 'bg-purple-500/5', border: 'border-purple-500/10', dot: 'bg-purple-500 animate-pulse', text: 'text-purple-400' }
    };

    container.innerHTML = tasks.map(t => {
        const isDemo = t.is_demo;
        const colors = isDemo ? statusColors.running : (statusColors[t.status] || statusColors.completed);
        const timeText = formatTimeAgo(t.completed_at || t.updated_at || t.created_at);
        const statusLabel = isDemo ? '训练中' : getStatusLabel(t.status);

        return `
            <div class="flex items-start space-x-3 p-3 rounded-lg ${colors.bg} border ${colors.border}">
                <div class="w-2 h-2 mt-1.5 rounded-full ${colors.dot} flex-shrink-0"></div>
                <div class="flex-1 min-w-0">
                    <p class="text-sm font-medium ${isDemo ? 'text-red-200' : 'text-gray-200'} truncate">${escapeHtml(t.training_name || '未命名训练')}</p>
                    <p class="text-xs text-gray-500 mt-0.5">
                        <span class="${colors.text}">${statusLabel}</span> • ${timeText}
                        ${isDemo ? '<span class="text-red-400 ml-1">[显存高占用]</span>' : ''}
                    </p>
                </div>
            </div>
        `;
    }).join('');
}

// 获取状态标签
function getStatusLabel(status) {
    const labels = {
        completed: '训练完成',
        failed: '训练失败',
        cancelled: '已取消',
        running: '运行中',
        paused: '已暂停',
        pending: '待启动'
    };
    return labels[status] || status;
}

// 格式化相对时间
function formatTimeAgo(dateString) {
    if (!dateString) return '未知时间';
    const date = new Date(dateString);
    const now = new Date();
    const diff = Math.floor((now - date) / 1000);

    if (diff < 60) return '刚刚';
    if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`;
    return `${Math.floor(diff / 86400)}天前`;
}

// 转义 HTML
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// 任务控制函数（支持停止演示任务）
async function stopTask(id) {
    // 处理演示任务
    if (id && id.toString().startsWith('demo_')) {
        if (confirm('确定要停止演示任务吗？这将清除演示数据并恢复正常的GPU监控。')) {
            localStorage.removeItem('verivek_demo_training');
            // 恢复GPU显示为正常状态
            resetDemoMode();
            // 刷新页面清除演示状态
            window.location.search = '';
        }
        return;
    }

    // 原有真实任务的处理逻辑
    if (!confirm('确定要删除这个训练任务吗？相关的权重文件也会被删除。')) return;
    try {
        const response = await fetch(`/api/trainings/${id}`, { method: 'DELETE' });
        if (response.ok) {
            loadActiveTasks();
            loadRecentActivity();
        } else {
            alert('删除失败');
        }
    } catch (err) {
        console.error('Error stopping task:', err);
        alert('删除失败');
    }
}

// 重置演示模式，恢复正常显示
function resetDemoMode() {
    console.log('[演示模式] 重置为正常显示');

    // 恢复显存卡片
    const vramText = document.getElementById('dashboard-vram-text');
    const vramBar = document.getElementById('dashboard-vram-bar');
    const vramRemaining = document.getElementById('vram-remaining');
    const vramCard = document.getElementById('vram-metric-card');

    if (vramText) {
        vramText.innerHTML = '--<span class="text-lg text-gray-500">/-- GB</span>';
        vramText.classList.remove('text-red-400');
    }
    if (vramBar) {
        vramBar.style.width = '0%';
        vramBar.classList.remove('bg-red-500');
        vramBar.classList.add('bg-purple-500');
    }
    if (vramRemaining) {
        vramRemaining.textContent = '--';
        vramRemaining.className = 'text-xs text-purple-400';
    }
    if (vramCard) {
        vramCard.classList.remove('border-red-500');
        vramCard.classList.add('border-purple-500');
    }

    // 恢复GPU卡片
    const gpuText = document.getElementById('dashboard-gpu-percent');
    const gpuBar = document.getElementById('dashboard-gpu-bar');
    const gpuStatus = document.getElementById('gpu-status-text');
    const gpuCard = document.getElementById('gpu-metric-card');

    if (gpuText) gpuText.textContent = '--';
    if (gpuBar) {
        gpuBar.style.width = '0%';
        gpuBar.classList.remove('bg-red-500');
        gpuBar.classList.add('bg-orange-500');
    }
    if (gpuStatus) {
        gpuStatus.textContent = '检测中...';
        gpuStatus.className = 'text-xs text-orange-400';
    }
    if (gpuCard) {
        gpuCard.classList.remove('border-red-500');
        gpuCard.classList.add('border-orange-500');
    }

    // 恢复侧边栏
    const sidebarGpuText = document.getElementById('gpu-memory-text');
    const sidebarGpuBar = document.getElementById('gpu-memory-bar');
    if (sidebarGpuText) {
        sidebarGpuText.innerText = '-- / -- GB';
        sidebarGpuText.classList.remove('text-red-400');
    }
    if (sidebarGpuBar) {
        sidebarGpuBar.style.width = '0%';
        sidebarGpuBar.classList.remove('bg-red-500');
        sidebarGpuBar.classList.add('bg-indigo-500');
    }

    // 隐藏训练徽章
    const badge = document.getElementById('training-badge');
    if (badge) {
        badge.classList.add('hidden');
        badge.classList.remove('animate-pulse');
    }

    // 重新加载真实GPU数据
    if (typeof fetchGPUInfo === 'function') {
        fetchGPUInfo();
    }
}

// 每30秒刷新一次
setInterval(() => {
    // 仅在非演示模式时自动刷新真实数据
    if (typeof isDemoMode !== 'function' || !isDemoMode()) {
        loadActiveTasks();
        loadRecentActivity();
    }
}, 30000);