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

// 标签切换功能
function switchTab(tabName) {
    // 隐藏所有页面
    ['dashboard', 'datasets', 'models', 'training'].forEach(page => {
        document.getElementById(`page-${page}`).classList.add('hidden');
    });

    // 显示目标页面
    document.getElementById(`page-${tabName}`).classList.remove('hidden');

    // 更新导航样式
    ['dashboard', 'datasets', 'models', 'training'].forEach(nav => {
        const el = document.getElementById(`nav-${nav}`);
        if (nav === tabName) {
            el.classList.add('tab-active');
            el.classList.remove('text-gray-400', 'hover:bg-white/5');
        } else {
            el.classList.remove('tab-active');
            el.classList.add('text-gray-400', 'hover:bg-white/5');
        }
    });

    // 如果切换到模型页面，自动刷新数据
    if (tabName === 'models') {
        fetchModels();
    }
}

// 初始化图表
const ctx = document.getElementById('trainingChart').getContext('2d');
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

// 模拟开始训练
function startTraining() {
    const btn = event.target.closest('button');
    btn.innerHTML = '<svg class="animate-spin w-6 h-6 mr-2" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg><span>启动中...</span>';
    btn.disabled = true;

    setTimeout(() => {
        btn.innerHTML = '<svg class="w-6 h-6 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg><span>已启动</span>';
        btn.classList.remove('from-indigo-600', 'to-purple-600');
        btn.classList.add('from-emerald-600', 'to-emerald-500');

        // 显示训练徽章
        document.getElementById('training-badge').classList.remove('hidden');

        // 2秒后返回仪表板
        setTimeout(() => {
            switchTab('dashboard');
            // 重置按钮
            setTimeout(() => {
                btn.innerHTML = '<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg><span>开始训练</span>';
                btn.disabled = false;
                btn.classList.add('from-indigo-600', 'to-purple-600');
                btn.classList.remove('from-emerald-600', 'to-emerald-500');
            }, 1000);
        }, 1500);
    }, 2000);
}

// 初始化显示仪表板
document.addEventListener('DOMContentLoaded', () => {
    switchTab('dashboard');
});

// GPU 信息更新函数
function fetchGPUInfo() {
    fetch('/api/gpu')
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                console.error('GPU info error:', data.error);
                document.getElementById('gpu-memory-text').innerText = '无法获取';
                document.getElementById('gpu-memory-bar').style.width = '0%';
                return;
            }

            // 更新显示文本 (单位转换 GB)
            const totalGB = (data.total_memory_mb / 1024).toFixed(1);
            const usedGB = (data.used_memory_mb / 1024).toFixed(1);
            document.getElementById('gpu-memory-text').innerText = `${usedGB} / ${totalGB} GB`;

            // 更新进度条宽度
            const percent = data.usage_percent;
            document.getElementById('gpu-memory-bar').style.width = `${percent}%`;
        })
        .catch(err => {
            console.error('Fetch error:', err);
            document.getElementById('gpu-memory-text').innerText = '连接失败';
            document.getElementById('gpu-memory-bar').style.width = '0%';
        });
}

// 页面加载后立即获取一次，然后每 2 秒刷新
document.addEventListener('DOMContentLoaded', () => {
    fetchGPUInfo();
    setInterval(fetchGPUInfo, 2000);
});

// ===== 模型导入功能 =====

function openImportModal() {
    document.getElementById('import-modal').classList.remove('hidden');
    // 重置表单
    document.getElementById('import-model-form').reset();
    resetUploadUI();
}

function closeImportModal() {
    document.getElementById('import-modal').classList.add('hidden');
    // 如果正在上传，可以在这里添加上传中断逻辑
}

// 文件上传 UI 处理
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('model-file');
const uploadPrompt = document.getElementById('upload-prompt');
const fileSelected = document.getElementById('file-selected');
const selectedFilename = document.getElementById('selected-filename');

// 拖拽事件
dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('border-indigo-500', 'bg-indigo-500/10');
});

dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('border-indigo-500', 'bg-indigo-500/10');
});

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('border-indigo-500', 'bg-indigo-500/10');

    const files = e.dataTransfer.files;
    if (files.length > 0) {
        fileInput.files = files;
        updateFileUI(files[0]);
    }
});

// 文件选择事件
fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        updateFileUI(e.target.files[0]);
    }
});

function updateFileUI(file) {
    selectedFilename.textContent = file.name;
    uploadPrompt.classList.add('hidden');
    fileSelected.classList.remove('hidden');

    // 自动提取文件名作为模型名称（如果为空）
    const modelNameInput = document.getElementById('import-model-name');
    if (!modelNameInput.value) {
        // 移除扩展名
        const nameWithoutExt = file.name.replace(/\.[^/.]+$/, "");
        modelNameInput.value = nameWithoutExt;
    }
}

function resetUploadUI() {
    uploadPrompt.classList.remove('hidden');
    fileSelected.classList.add('hidden');
    selectedFilename.textContent = '';
    document.getElementById('upload-progress-container').classList.add('hidden');
    document.getElementById('upload-progress-bar').style.width = '0%';
    document.getElementById('upload-percentage').textContent = '0%';
    document.getElementById('import-submit-btn').disabled = false;
    document.getElementById('import-submit-btn').innerHTML = `
        <span>开始导入</span>
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
    `;
}

// 处理模型导入提交
async function handleModelImport(event) {
    event.preventDefault();

    const form = event.target;
    const formData = new FormData(form);
    const submitBtn = document.getElementById('import-submit-btn');
    const progressContainer = document.getElementById('upload-progress-container');
    const progressBar = document.getElementById('upload-progress-bar');
    const percentageText = document.getElementById('upload-percentage');

    // 禁用提交按钮
    submitBtn.disabled = true;
    submitBtn.innerHTML = `
        <svg class="animate-spin w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
        <span>上传中...</span>
    `;

    // 显示进度条
    progressContainer.classList.remove('hidden');

    try {
        // 模拟上传进度（因为 fetch 不支持进度监听，这里用模拟）
        let progress = 0;
        const progressInterval = setInterval(() => {
            if (progress < 90) {
                progress += Math.random() * 15;
                if (progress > 90) progress = 90;
                progressBar.style.width = `${progress}%`;
                percentageText.textContent = `${Math.round(progress)}%`;
            }
        }, 200);

        // 发送请求到后端
        const response = await fetch('/api/models/import', {
            method: 'POST',
            body: formData
        });

        clearInterval(progressInterval);

        if (response.ok) {
            // 完成
            progressBar.style.width = '100%';
            percentageText.textContent = '100%';

            const result = await response.json();

            // 显示成功状态
            submitBtn.classList.remove('from-indigo-600', 'to-purple-600', 'bg-indigo-600');
            submitBtn.classList.add('bg-emerald-600');
            submitBtn.innerHTML = `
                <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
                <span>导入成功</span>
            `;

            // 2秒后关闭并刷新模型列表
            setTimeout(() => {
                closeImportModal();
                // 如果当前在模型页面，刷新列表；否则无需操作
                if (!document.getElementById('page-models').classList.contains('hidden')) {
                    fetchModels();
                }
                // 重置表单
                form.reset();
                resetUploadUI();
                // 恢复按钮状态
                setTimeout(() => {
                    submitBtn.disabled = false;
                    submitBtn.classList.remove('bg-emerald-600');
                    submitBtn.classList.add('from-indigo-600', 'to-purple-600', 'bg-indigo-600');
                    submitBtn.innerHTML = `
                        <span>开始导入</span>
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
                    `;
                }, 500);
            }, 1500);

        } else {
            const error = await response.json();
            throw new Error(error.error || '导入失败');
        }

    } catch (error) {
        console.error('Import error:', error);

        // 显示错误状态
        submitBtn.classList.remove('bg-indigo-600', 'from-indigo-600', 'to-purple-600');
        submitBtn.classList.add('bg-red-600');
        submitBtn.innerHTML = `
            <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            <span>${error.message || '导入失败'}</span>
        `;

        // 3秒后恢复按钮
        setTimeout(() => {
            submitBtn.disabled = false;
            submitBtn.classList.remove('bg-red-600');
            submitBtn.classList.add('bg-indigo-600', 'from-indigo-600', 'to-purple-600');
            submitBtn.innerHTML = `
                <span>重试</span>
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
            `;
        }, 3000);
    }
}

// ESC 键关闭模态框
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeImportModal();
    }
});

// ========== 模型数据管理 ==========

// 获取并渲染模型列表
async function fetchModels() {
    const container = document.getElementById('model-list-container');
    const loading = document.getElementById('model-list-loading');

    if (loading) loading.style.display = 'block';

    try {
        const response = await fetch('/api/models');
        const data = await response.json();

        if (data.success) {
            renderModelList(data.models);
        } else {
            container.innerHTML = `
                <div class="p-8 text-center text-red-400">
                    <svg class="w-8 h-8 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                    </svg>
                    <p>加载失败: ${data.error || '未知错误'}</p>
                    <button onclick="fetchModels()" class="mt-2 px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-sm transition-colors">
                        重试
                    </button>
                </div>
            `;
        }
    } catch (error) {
        console.error('获取模型列表失败:', error);
        container.innerHTML = `
            <div class="p-8 text-center text-red-400">
                <svg class="w-8 h-8 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
                <p>网络连接失败</p>
                <button onclick="fetchModels()" class="mt-2 px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-sm transition-colors">
                    重试
                </button>
            </div>
        `;
    }
}

// 渲染模型列表（保持与原有 mock 数据完全一致的样式结构）
function renderModelList(models) {
    const container = document.getElementById('model-list-container');

    if (!models || models.length === 0) {
        container.innerHTML = `
            <div class="p-8 text-center text-gray-500">
                <svg class="w-12 h-12 mx-auto mb-3 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path>
                </svg>
                <p class="mb-2">暂无模型</p>
                <button onclick="openImportModal()" class="text-indigo-400 hover:text-indigo-300 text-sm transition-colors">
                    导入第一个模型 →
                </button>
            </div>
        `;
        return;
    }

    const colorSchemes = [
        { name: 'indigo', abbr: 'IN' },
        { name: 'purple', abbr: 'PU' },
        { name: 'emerald', abbr: 'EM' },
        { name: 'blue', abbr: 'BL' },
        { name: 'orange', abbr: 'OR' }
    ];

    const html = models.map((model, index) => {
        // 轮询颜色方案
        const scheme = colorSchemes[index % colorSchemes.length];
        // 生成缩写（取名称前两个大写字母或首字母）
        const abbr = getModelAbbr(model.model_name);
        // 格式化时间
        const timeStr = formatRelativeTime(model.created_at);

        return `
        <div class="p-6 hover:bg-white/5 transition-colors flex items-center justify-between group cursor-pointer" onclick="showModelDetail(${model.model_id})">
            <div class="flex items-center space-x-4">
                <div class="w-10 h-10 rounded-lg bg-${scheme.name}-500/20 flex items-center justify-center">
                    <span class="text-${scheme.name}-400 font-mono font-bold">${abbr}</span>
                </div>
                <div>
                    <h4 class="font-medium mb-1">${escapeHtml(model.model_name)}</h4>
                    <p class="text-sm text-gray-400">${escapeHtml(model.description || '暂无描述')}</p>
                </div>
            </div>
            <div class="flex items-center space-x-6">
                <div class="text-right">
                    <div class="text-sm text-gray-400">参数量</div>
                    <div class="font-mono text-sm">--</div>
                </div>
                <div class="text-right">
                    <div class="text-sm text-gray-400">最后使用</div>
                    <div class="text-sm">${timeStr}</div>
                </div>
                <button onclick="event.stopPropagation(); deleteModel(${model.model_id})" 
                        class="opacity-0 group-hover:opacity-100 p-2 hover:bg-red-500/20 hover:text-red-400 rounded-lg transition-all text-gray-400" 
                        title="删除模型">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                    </svg>
                </button>
            </div>
        </div>
        `;
    }).join('');

    container.innerHTML = html;
}

// 删除模型
async function deleteModel(modelId) {
    if (!confirm('确定要删除这个模型吗？所有关联的分支和提交历史也将被删除，此操作不可恢复。')) {
        return;
    }

    try {
        const response = await fetch(`/api/models/${modelId}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            // 删除成功，刷新列表
            fetchModels();
            // 显示成功提示（可选）
            console.log(`模型 ${modelId} 已删除`);
        } else {
            const data = await response.json();
            alert('删除失败: ' + (data.error || '未知错误'));
        }
    } catch (error) {
        console.error('删除模型失败:', error);
        alert('删除请求失败，请检查网络连接');
    }
}

// 显示模型详情（占位函数，可按需扩展）
function showModelDetail(modelId) {
    console.log('查看模型详情:', modelId);
    // 可扩展为打开详情页或侧边栏
}

// 辅助函数：获取模型名称缩写
function getModelAbbr(name) {
    if (!name) return 'M';
    // 提取大写字母或首字母
    const matches = name.match(/[A-Z]/g);
    if (matches && matches.length >= 2) {
        return matches.slice(0, 2).join('');
    }
    return name.substring(0, 2).toUpperCase();
}

// 辅助函数：格式化相对时间
function formatRelativeTime(dateString) {
    if (!dateString) return '--';
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;

    // 小于1小时
    if (diff < 3600000) {
        const mins = Math.floor(diff / 60000);
        return mins < 1 ? '刚刚' : `${mins}分钟前`;
    }
    // 小于24小时
    if (diff < 86400000) {
        return `${Math.floor(diff / 3600000)}小时前`;
    }
    // 小于7天
    if (diff < 604800000) {
        return `${Math.floor(diff / 86400000)}天前`;
    }
    // 其他情况显示日期
    return date.toISOString().split('T')[0];
}

// 辅助函数：HTML 转义防止 XSS
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}