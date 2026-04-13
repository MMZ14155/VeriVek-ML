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

    // 加载活跃任务（运行中、暂停、待启动）
    loadActiveTasks();
    // 加载最近动态
    loadRecentActivity();
});

// 加载活跃任务
async function loadActiveTasks() {
    try {
        const response = await fetch('/api/trainings');
        const data = await response.json();

        if (!data.success) {
            console.error('Failed to load trainings:', data.error);
            return;
        }

        const tasks = data.trainings || [];

// 过滤出活跃任务：running（运行中）、pending（待启动）
    const activeTasks = tasks.filter(t => ['running', 'pending'].includes(t.status));

        // 更新统计卡片
        updateTaskStats(activeTasks);

        // 渲染任务列表
        renderActiveTasks(activeTasks);
    } catch (err) {
        console.error('Error loading tasks:', err);
        document.getElementById('active-tasks-list').innerHTML = `
            <div class="flex flex-col items-center justify-center p-8 text-gray-500">
                <svg class="w-8 h-8 mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
                <span class="text-sm">加载失败，请刷新重试</span>
            </div>
        `;
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

        statusEl.textContent = runningCount > 0 ? '运行正常' : '等待启动';
        statusEl.className = runningCount > 0
            ? 'text-xs text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20'
            : 'text-xs text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20';
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

    // 状态配置
    const statusConfig = {
        running: { label: '运行中', colorClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30', icon: 'running', iconColor: 'text-emerald-400' },
        pending: { label: '待启动', colorClass: 'bg-blue-500/20 text-blue-300 border-blue-500/30', icon: 'pending', iconColor: 'text-blue-400' }
    };

    // 颜色配置
    const colorClasses = ['indigo', 'purple', 'emerald', 'blue', 'orange'];

    container.innerHTML = tasks.map((t, index) => {
        const status = statusConfig[t.status] || statusConfig.pending;
        const color = colorClasses[index % colorClasses.length];
        const progress = t.progress || 0;
        const hp = t.hyperparameters || {};

        return `
            <div class="flex items-center p-4 bg-white/5 rounded-xl border border-white/5 hover:border-${color}-500/30 transition-all group">
                <div class="w-10 h-10 rounded-lg bg-${color}-500/20 flex items-center justify-center mr-4 flex-shrink-0">
                    <svg class="w-5 h-5 ${status.iconColor}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        ${getStatusIcon(status.icon)}
                    </svg>
                </div>
                <div class="flex-1 min-w-0">
                    <div class="flex items-center justify-between mb-1">
                        <div class="flex items-center space-x-2">
                            <h4 class="font-medium text-sm truncate">${escapeHtml(t.training_name || '未命名训练')}</h4>
                            <span class="px-1.5 py-0.5 text-[10px] ${status.colorClass} rounded border">${status.label}</span>
                        </div>
                        <span class="text-xs text-gray-400 font-mono">#${t.training_id}</span>
                    </div>
                    <div class="flex items-center space-x-4 text-xs text-gray-400 mb-2">
                        <span>模型: <span class="text-white font-mono">${escapeHtml(t.model_name || 'Unknown')}</span></span>
                        <span>Epochs: <span class="text-white font-mono">${hp.epochs || '-'}</span></span>
                        <span>Batch: <span class="text-white font-mono">${hp.batch_size || '-'}</span></span>
                    </div>
                    <div class="w-full bg-gray-800 rounded-full h-1.5">
                        <div class="bg-gradient-to-r from-${color}-500 to-${color}-400 h-1.5 rounded-full transition-all duration-500" style="width: ${progress}%"></div>
                    </div>
                </div>
                <div class="ml-4 flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button class="p-2 hover:bg-red-500/20 rounded-lg transition-colors text-gray-400 hover:text-red-400" title="删除" onclick="stopTask(${t.training_id})">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z"></path></svg>
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
        cancelled: { bg: 'bg-gray-500/5', border: 'border-gray-500/10', dot: 'bg-gray-500', text: 'text-gray-400' }
    };

    container.innerHTML = tasks.map(t => {
        const colors = statusColors[t.status] || statusColors.completed;
        const timeText = formatTimeAgo(t.completed_at || t.updated_at || t.created_at);

        return `
            <div class="flex items-start space-x-3 p-3 rounded-lg ${colors.bg} border ${colors.border}">
                <div class="w-2 h-2 mt-1.5 rounded-full ${colors.dot} flex-shrink-0"></div>
                <div class="flex-1 min-w-0">
                    <p class="text-sm font-medium text-gray-200 truncate">${escapeHtml(t.training_name || '未命名训练')}</p>
                    <p class="text-xs text-gray-500 mt-0.5">
                        <span class="${colors.text}">${getStatusLabel(t.status)}</span> • ${timeText}
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

// 任务控制函数
async function stopTask(id) {
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

// 每30秒刷新一次
setInterval(() => {
    loadActiveTasks();
    loadRecentActivity();
}, 30000);