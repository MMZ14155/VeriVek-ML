let currentModelId = null;
let currentBranchName = 'main';
let graphData = null;

function openImportModal() {
    const modal = document.getElementById('import-modal');
    if (modal) {
        modal.classList.remove('hidden');
        resetUploadUI();
    }
}

function closeImportModal() {
    const modal = document.getElementById('import-modal');
    if (modal) modal.classList.add('hidden');
}

function resetUploadUI() {
    const uploadPrompt = document.getElementById('upload-prompt');
    const fileSelected = document.getElementById('file-selected');
    const progressContainer = document.getElementById('upload-progress-container');
    const progressBar = document.getElementById('upload-progress-bar');
    const percentageText = document.getElementById('upload-percentage');
    const submitBtn = document.getElementById('import-submit-btn');

    if (uploadPrompt) uploadPrompt.classList.remove('hidden');
    if (fileSelected) fileSelected.classList.add('hidden');
    if (progressContainer) progressContainer.classList.add('hidden');
    if (progressBar) progressBar.style.width = '0%';
    if (percentageText) percentageText.textContent = '0%';
    if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `
            <span>开始导入</span>
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
        `;
    }

    const form = document.getElementById('import-model-form');
    if (form) form.reset();
}

async function handleModelImport(event) {
    event.preventDefault();

    const form = event.target;
    const formData = new FormData(form);
    const submitBtn = document.getElementById('import-submit-btn');
    const progressContainer = document.getElementById('upload-progress-container');
    const progressBar = document.getElementById('upload-progress-bar');
    const percentageText = document.getElementById('upload-percentage');

    if (!submitBtn || !progressContainer || !progressBar || !percentageText) return;

    // 禁用提交按钮
    submitBtn.disabled = true;
    submitBtn.innerHTML = `
        <svg class="animate-spin w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
        <span>上传中...</span>
    `;

    // 显示进度条
    progressContainer.classList.remove('hidden');

    try {
        // 模拟上传进度
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
            progressBar.style.width = '100%';
            percentageText.textContent = '100%';

            // 显示成功状态
            submitBtn.classList.remove('from-indigo-600', 'to-purple-600', 'bg-indigo-600');
            submitBtn.classList.add('bg-emerald-600');
            submitBtn.innerHTML = `
                <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
                <span>导入成功</span>
            `;

            // 2秒后关闭并刷新
            setTimeout(() => {
                closeImportModal();
                fetchModels();
                resetUploadUI();
            }, 1500);

        } else {
            const error = await response.json();
            throw new Error(error.error || '导入失败');
        }

    } catch (error) {
        console.error('Import error:', error);
        submitBtn.classList.remove('bg-indigo-600', 'from-indigo-600', 'to-purple-600');
        submitBtn.classList.add('bg-red-600');
        submitBtn.innerHTML = `
            <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
            <span>${error.message || '导入失败'}</span>
        `;

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

async function fetchModels() {
    const container = document.getElementById('model-list-container');
    const loading = document.getElementById('model-list-loading');

    if (!container) return; // 不在模型页面

    if (loading) loading.style.display = 'block';

    try {
        const response = await fetch('/api/models');
        const data = await response.json();

        if (data.success) {
            renderModelList(data.models);
        } else {
            container.innerHTML = `
                <div class="p-8 text-center text-red-400">
                    <p>加载失败: ${data.error || '未知错误'}</p>
                    <button onclick="fetchModels()" class="mt-2 px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-sm transition-colors">
                        重试
                    </button>
                </div>
            `;
        }
    } catch (error) {
        container.innerHTML = `
            <div class="p-8 text-center text-red-400">
                <p>网络连接失败</p>
                <button onclick="fetchModels()" class="mt-2 px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-sm transition-colors">
                    重试
                </button>
            </div>
        `;
    }
}

function renderModelList(models) {
    const container = document.getElementById('model-list-container');
    if (!container) return;

    if (!models || models.length === 0) {
        container.innerHTML = `
            <div class="p-8 text-center text-gray-500">
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
        const scheme = colorSchemes[index % colorSchemes.length];
        const abbr = getModelAbbr(model.model_name);
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

async function deleteModel(modelId) {
    if (!confirm('确定要删除这个模型吗？所有关联的分支和提交历史也将被删除，此操作不可恢复。')) {
        return;
    }

    try {
        const response = await fetch(`/api/models/${modelId}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            fetchModels();
        } else {
            const data = await response.json();
            alert('删除失败: ' + (data.error || '未知错误'));
        }
    } catch (error) {
        alert('删除请求失败，请检查网络连接');
    }
}

function showModelDetail(modelId) {
    console.log('查看模型详情:', modelId);
    // 可扩展为跳转到详情页或打开侧边栏
}

function getModelAbbr(name) {
    if (!name) return 'M';
    const matches = name.match(/[A-Z]/g);
    if (matches && matches.length >= 2) {
        return matches.slice(0, 2).join('');
    }
    return name.substring(0, 2).toUpperCase();
}

function formatRelativeTime(dateString) {
    if (!dateString) return '--';
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;

    if (diff < 3600000) {
        const mins = Math.floor(diff / 60000);
        return mins < 1 ? '刚刚' : `${mins}分钟前`;
    }
    if (diff < 86400000) {
        return `${Math.floor(diff / 3600000)}小时前`;
    }
    if (diff < 604800000) {
        return `${Math.floor(diff / 86400000)}天前`;
    }
    return date.toISOString().split('T')[0];
}

// 拖拽上传相关
function initModelUploadEvents() {
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('model-file');

    if (!dropZone || !fileInput) return;

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
}

function updateFileUI(file) {
    const selectedFilename = document.getElementById('selected-filename');
    const uploadPrompt = document.getElementById('upload-prompt');
    const fileSelected = document.getElementById('file-selected');

    if (selectedFilename) selectedFilename.textContent = file.name;
    if (uploadPrompt) uploadPrompt.classList.add('hidden');
    if (fileSelected) fileSelected.classList.remove('hidden');

    // 自动提取文件名作为模型名称（如果为空）
    const modelNameInput = document.getElementById('import-model-name');
    if (modelNameInput && !modelNameInput.value) {
        const nameWithoutExt = file.name.replace(/\.[^/.]+$/, "");
        modelNameInput.value = nameWithoutExt;
    }
}

// 页面初始化
document.addEventListener('DOMContentLoaded', function() {
    // 初始加载模型列表
    fetchModels();

    // 初始化拖拽上传
    initModelUploadEvents();

    // ESC 键关闭模型模态框
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeImportModal();
        }
    });
});

// 模型版本图谱
function showModelDetail(modelId) {
    currentModelId = modelId;
    const modal = document.getElementById('model-graph-modal');
    if (modal) {
        modal.classList.remove('hidden');
        // 重置右侧面板状态
        document.getElementById('commit-detail-panel').classList.remove('hidden');
        document.getElementById('commit-upload-panel').classList.add('hidden');
        loadModelGraph(modelId);
    }
}

function closeModelGraph() {
    const modal = document.getElementById('model-graph-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
    currentModelId = null;
}

async function loadModelGraph(modelId) {
    const container = document.getElementById('commit-nodes');
    const modelName = document.getElementById('graph-model-name');
    const modelMeta = document.getElementById('graph-model-meta');

    // 显示加载状态
    if (container) {
        container.innerHTML = '<div class="flex items-center justify-center w-full h-full"><div class="animate-spin w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full"></div></div>';
    }

    try {
        // 获取模型详情和提交历史
        const response = await fetch(`/api/models/${modelId}`);
        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || '加载失败');
        }

        const model = data.model;
        const branches = data.branches || [];
        const branchName = branches.length > 0 ? branches[0].branch_name : 'main';
        currentBranchName = branchName;

        // 更新头部信息
        if (modelName) modelName.textContent = model.model_name || '未命名模型';
        if (modelMeta) {
            modelMeta.textContent = `${branches.length} 分支 • ${data.branch_count || 0} 个提交`;
        }

        // 获取提交历史
        const historyResponse = await fetch(`/api/models/${modelId}/commits?branch=${branchName}`);
        const historyData = await historyResponse.json();

        if (!historyData.success || !historyData.commits || historyData.commits.length === 0) {
            container.innerHTML = '<div class="text-center text-gray-500 p-8">暂无提交记录<br><button onclick="openCommitUploadPanel()" class="mt-4 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-sm">提交首个版本</button></div>';
            return;
        }

        // 渲染节点
        renderCommitNodes(historyData.commits);

        // 延迟绘制连接线
        setTimeout(() => drawCommitConnections(historyData.commits), 150);

        // 更新分支选择器
        const branchSelect = document.getElementById('commit-branch-select');
        if (branchSelect) {
            branchSelect.innerHTML = branches.map(b =>
                `<option value="${b.branch_name}" ${b.branch_name === branchName ? 'selected' : ''}>${b.branch_name}</option>`
            ).join('');
        }

    } catch (error) {
        console.error('加载模型图谱失败:', error);
        if (container) {
            container.innerHTML = `
                <div class="text-center text-red-400 p-8">
                    <svg class="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                    </svg>
                    <p>加载失败: ${error.message}</p>
                    <button onclick="loadModelGraph(${modelId})" class="mt-4 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm text-white">重试</button>
                </div>
            `;
        }
    }
}

function renderCommitNodes(commits) {
    const container = document.getElementById('commit-nodes');
    if (!container) return;
    container.innerHTML = '';

    commits.forEach((commit, index) => {
        const isFirst = index === 0;
        const isLast = index === commits.length - 1;

        // 节点大小固定，但最新提交突出显示
        const nodeSize = isLast ? 56 : 48;

        const node = document.createElement('div');
        node.className = `relative flex flex-col items-center cursor-pointer group flex-shrink-0`;
        node.style.width = `${nodeSize + 24}px`;
        node.onclick = () => showCommitDetail(commit);

        // 计算提交信息摘要
        const messagePreview = commit.message ?
            (commit.message.length > 20 ? commit.message.substring(0, 20) + '...' : commit.message)
            : '无描述';

        node.innerHTML = `
            <!-- 节点圆圈 -->
            <div class="rounded-full ${isLast ? 'bg-emerald-500' : 'bg-indigo-500'} 
                        border-4 border-[#13131f] shadow-lg ${isLast ? 'shadow-emerald-500/30' : 'shadow-indigo-500/30'}
                        flex items-center justify-center transition-all group-hover:scale-110 relative z-20"
                 style="width: ${nodeSize}px; height: ${nodeSize}px;">
                <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
                ${isLast ? '<div class="absolute -top-1 -right-1 w-3 h-3 bg-emerald-400 rounded-full border-2 border-[#13131f]"></div>' : ''}
            </div>
            
            <!-- 信息卡片 -->
            <div class="mt-4 text-center opacity-60 group-hover:opacity-100 transition-opacity w-36">
                <div class="text-xs font-medium text-white mb-1 truncate">${escapeHtml(messagePreview)}</div>
                <div class="text-[10px] text-gray-400">${escapeHtml(commit.author || 'System')}</div>
                <div class="text-[10px] ${isLast ? 'text-emerald-400' : 'text-indigo-400'} mt-1">
                    ${formatRelativeTime(commit.created_at)}
                </div>
            </div>
            
            <!-- Tooltip -->
            <div class="absolute bottom-full mb-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-30 w-52 hidden group-hover:block">
                <div class="glass-panel rounded-lg p-3 text-xs border border-white/10 bg-[#1a1a2e] shadow-xl">
                    <div class="font-medium text-white mb-1 break-all">${escapeHtml(commit.message || '无描述')}</div>
                    <div class="text-gray-400">作者: ${escapeHtml(commit.author || 'System')}</div>
                    <div class="text-gray-500 mt-1">${new Date(commit.created_at).toLocaleString()}</div>
                    <div class="text-gray-500 mt-1 font-mono text-[10px]">ID: ${commit.commit_id}</div>
                </div>
            </div>
        `;

        container.appendChild(node);
    });

    // 添加"新增提交"占位节点
    const addNode = document.createElement('div');
    addNode.className = 'relative flex flex-col items-center cursor-pointer group ml-8 flex-shrink-0';
    addNode.onclick = openCommitUploadPanel;
    addNode.innerHTML = `
        <div class="w-12 h-12 rounded-full border-2 border-dashed border-gray-500 hover:border-emerald-500 hover:bg-emerald-500/10
                    flex items-center justify-center transition-all">
            <svg class="w-5 h-5 text-gray-400 group-hover:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path>
            </svg>
        </div>
        <div class="mt-3 text-xs text-gray-500 group-hover:text-emerald-400">提交更新</div>
    `;
    container.appendChild(addNode);
}

function drawCommitConnections(commits) {
    const svg = document.getElementById('model-graph-svg');
    const container = document.getElementById('commit-nodes');
    if (!svg || !container) return;

    const containerRect = container.getBoundingClientRect();
    // 只选择提交节点（排除最后的"新增"按钮）
    const nodes = Array.from(container.querySelectorAll(':scope > div')).slice(0, -1);

    svg.setAttribute('width', container.scrollWidth);
    svg.setAttribute('height', containerRect.height);
    svg.innerHTML = '';

    if (nodes.length < 2) return;

    // 绘制节点间的连接线
    for (let i = 0; i < nodes.length - 1; i++) {
        const current = nodes[i];
        const next = nodes[i + 1];

        const currentRect = current.getBoundingClientRect();
        const nextRect = next.getBoundingClientRect();

        // 相对于container的坐标
        const x1 = currentRect.left - containerRect.left + currentRect.width / 2;
        const y1 = currentRect.top - containerRect.top + currentRect.height / 2;
        const x2 = nextRect.left - containerRect.left + nextRect.width / 2;
        const y2 = nextRect.top - containerRect.top + nextRect.height / 2;

        // 最新连接使用 emerald 色
        const isLastConnection = (i === nodes.length - 2);
        const lineColor = isLastConnection ? '#10b981' : '#6366f1';

        // 创建路径（水平连接的贝塞尔曲线）
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const controlOffset = Math.abs(x2 - x1) / 2;
        const d = `M ${x1} ${y1} C ${x1 + controlOffset} ${y1}, ${x2 - controlOffset} ${y2}, ${x2} ${y2}`;

        path.setAttribute('d', d);
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', lineColor);
        path.setAttribute('stroke-width', '2');
        path.setAttribute('stroke-dasharray', '5,5');
        path.setAttribute('opacity', '0.6');

        svg.appendChild(path);

        // 添加流向箭头
        const angle = Math.atan2(y2 - y1, x2 - x1);
        const arrowSize = 5;
        const arrowX = x2 - (nextRect.width/2 + 8) * Math.cos(angle);
        const arrowY = y2 - (nextRect.height/2 + 8) * Math.sin(angle);

        const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        arrow.setAttribute('points', `${arrowX},${arrowY-arrowSize} ${arrowX+arrowSize*2},${arrowY} ${arrowX},${arrowY+arrowSize}`);
        arrow.setAttribute('fill', lineColor);
        arrow.setAttribute('opacity', '0.8');
        const rotation = angle * 180 / Math.PI;
        arrow.setAttribute('transform', `rotate(${rotation}, ${arrowX}, ${arrowY})`);
        svg.appendChild(arrow);
    }
}

function showCommitDetail(commit) {
    const panel = document.getElementById('commit-detail-panel');
    if (!panel) return;

    const date = new Date(commit.created_at);
    const isLatest = commit.commit_id === document.querySelector('#commit-nodes > div:last-child')?.previousElementSibling?.onclick?.toString().includes(commit.commit_id);

    panel.innerHTML = `
        <div class="space-y-4">
            <div class="flex items-center justify-between pb-4 border-b border-white/5">
                <div class="flex items-center space-x-2">
                    <div class="w-8 h-8 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold text-sm">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                        </svg>
                    </div>
                    <div>
                        <div class="font-semibold text-white">提交 #${commit.commit_id}</div>
                        <div class="text-xs text-gray-400">${date.toLocaleDateString()} ${date.toLocaleTimeString()}</div>
                    </div>
                </div>
                <button onclick="downloadCommit('${commit.commit_id}')" class="p-2 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white" title="下载此版本">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4-4m0 0l-4 4m4-4v12"></path>
                    </svg>
                </button>
            </div>
            
            <div class="space-y-3 text-sm">
                <div class="flex justify-between py-2 border-b border-white/5">
                    <span class="text-gray-400">提交者</span>
                    <span class="text-white">${escapeHtml(commit.author || 'System')}</span>
                </div>
                <div class="flex justify-between py-2 border-b border-white/5">
                    <span class="text-gray-400">提交时间</span>
                    <span class="text-white">${date.toLocaleString()}</span>
                </div>
                <div class="flex justify-between py-2 border-b border-white/5">
                    <span class="text-gray-400">对象存储</span>
                    <span class="font-mono text-xs text-gray-500 truncate max-w-[150px]">${commit.object_key || '--'}</span>
                </div>
            </div>
            
            <div class="mt-4">
                <div class="text-xs text-gray-400 mb-2">提交信息</div>
                <div class="p-3 bg-white/5 rounded-lg text-sm text-gray-300 border border-white/5 min-h-[80px]">
                    ${escapeHtml(commit.message || '无提交信息')}
                </div>
            </div>
            
            <div class="pt-4 mt-4 border-t border-white/5 space-y-2">
                <button onclick="useCommitForTraining('${commit.commit_id}')" 
                    class="w-full py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm font-medium transition-colors">
                    使用此版本训练
                </button>
                <button onclick="openCommitUploadPanel()" 
                    class="w-full py-2 bg-white/5 hover:bg-white/10 rounded-lg text-sm text-gray-400 transition-colors">
                    基于此提交更新
                </button>
            </div>
        </div>
    `;
}

// 提交新版本面板
function openCommitUploadPanel() {
    document.getElementById('commit-detail-panel').classList.add('hidden');
    document.getElementById('commit-upload-panel').classList.remove('hidden');

    // 绑定文件选择事件
    const fileInput = document.getElementById('commit-model-file');
    if (fileInput) {
        fileInput.addEventListener('change', handleCommitFileSelect);
    }
}

function closeCommitUploadPanel() {
    document.getElementById('commit-upload-panel').classList.add('hidden');
    document.getElementById('commit-detail-panel').classList.remove('hidden');
    const form = document.getElementById('commit-upload-form');
    if (form) form.reset();
    document.getElementById('commit-file-name').textContent = '支持 PyTorch/TensorFlow 定义';
}

function handleCommitFileSelect(event) {
    const file = event.target.files[0];
    if (file) {
        document.getElementById('commit-file-name').textContent = file.name;
    }
}

async function handleCommitUpload(event) {
    event.preventDefault();

    if (!currentModelId) {
        alert('未选择模型');
        return;
    }

    const form = event.target;
    const fileInput = document.getElementById('commit-model-file');
    const message = document.getElementById('commit-message').value;
    const author = document.getElementById('commit-author').value || 'anonymous';
    const branch = document.getElementById('commit-branch-select').value;

    if (!fileInput.files || fileInput.files.length === 0) {
        alert('请选择模型文件');
        return;
    }

    const progressBar = document.getElementById('commit-progress-bar');
    const percentText = document.getElementById('commit-upload-percent');
    const submitBtn = document.getElementById('commit-submit-btn');
    const progressContainer = document.getElementById('commit-upload-progress');

    // 显示进度条
    if (progressContainer) progressContainer.classList.remove('hidden');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span>上传中...</span>';
    }

    try {
        const formData = new FormData();
        formData.append('model_file', fileInput.files[0]);
        formData.append('model_name', document.getElementById('graph-model-name').textContent);
        formData.append('branch_name', branch);
        formData.append('message', message);
        formData.append('author', author);

        // 使用 XMLHttpRequest 以便获取上传进度
        const uploadPromise = new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();

            xhr.upload.addEventListener('progress', (e) => {
                if (e.lengthComputable) {
                    const percentComplete = Math.round((e.loaded / e.total) * 100);
                    if (progressBar) progressBar.style.width = `${percentComplete}%`;
                    if (percentText) percentText.textContent = `${percentComplete}%`;
                }
            });

            xhr.addEventListener('load', () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    try {
                        const response = JSON.parse(xhr.responseText);
                        resolve(response);
                    } catch (e) {
                        reject(new Error('解析响应失败'));
                    }
                } else {
                    try {
                        const error = JSON.parse(xhr.responseText);
                        reject(new Error(error.error || `HTTP ${xhr.status}`));
                    } catch (e) {
                        reject(new Error(`上传失败: HTTP ${xhr.status}`));
                    }
                }
            });

            xhr.addEventListener('error', () => reject(new Error('网络请求失败')));
            xhr.addEventListener('abort', () => reject(new Error('上传已取消')));

            xhr.open('POST', '/api/models/import');
            xhr.send(formData);
        });

        const result = await uploadPromise;

        // 上传完成，刷新图谱
        setTimeout(() => {
            closeCommitUploadPanel();
            loadModelGraph(currentModelId);
        }, 300);

    } catch (error) {
        console.error('提交失败:', error);
        alert('提交失败: ' + error.message);
        if (progressBar) progressBar.style.width = '0%';
        if (percentText) percentText.textContent = '0%';
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<span>确认提交</span><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>';
        }
    }
}

function downloadCommit(commitId) {
    console.log('下载提交:', commitId);
    alert('下载功能开发中...\n提交ID: ' + commitId);
}

function useCommitForTraining(commitId) {
    window.location.href = `/training?model=${currentModelId}&commit=${commitId}`;
}

// 监听窗口大小变化，重绘连接线
window.addEventListener('resize', () => {
    const modal = document.getElementById('model-graph-modal');
    if (modal && !modal.classList.contains('hidden') && currentModelId) {
        clearTimeout(window.modelResizeTimer);
        window.modelResizeTimer = setTimeout(() => {
            // 重新获取提交历史并绘制连接线
            const nodes = document.getElementById('commit-nodes');
            if (nodes && nodes.children.length > 0) {
                const svg = document.getElementById('model-graph-svg');
                const container = document.getElementById('commit-nodes');
                if (svg && container) {
                    const containerRect = container.getBoundingClientRect();
                    const commitNodes = Array.from(container.querySelectorAll(':scope > div')).slice(0, -1);

                    svg.setAttribute('width', container.scrollWidth);
                    svg.setAttribute('height', containerRect.height);
                    svg.innerHTML = '';

                    if (commitNodes.length < 2) return;

                    for (let i = 0; i < commitNodes.length - 1; i++) {
                        const current = commitNodes[i];
                        const next = commitNodes[i + 1];
                        const currentRect = current.getBoundingClientRect();
                        const nextRect = next.getBoundingClientRect();

                        const x1 = currentRect.left - containerRect.left + currentRect.width / 2;
                        const y1 = currentRect.top - containerRect.top + currentRect.height / 2;
                        const x2 = nextRect.left - containerRect.left + nextRect.width / 2;
                        const y2 = nextRect.top - containerRect.top + nextRect.height / 2;

                        const isLastConnection = (i === commitNodes.length - 2);
                        const lineColor = isLastConnection ? '#10b981' : '#6366f1';

                        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                        const controlOffset = Math.abs(x2 - x1) / 2;
                        path.setAttribute('d', `M ${x1} ${y1} C ${x1 + controlOffset} ${y1}, ${x2 - controlOffset} ${y2}, ${x2} ${y2}`);
                        path.setAttribute('fill', 'none');
                        path.setAttribute('stroke', lineColor);
                        path.setAttribute('stroke-width', '2');
                        path.setAttribute('stroke-dasharray', '5,5');
                        path.setAttribute('opacity', '0.6');
                        svg.appendChild(path);

                        const angle = Math.atan2(y2 - y1, x2 - x1);
                        const arrowSize = 5;
                        const arrowX = x2 - (nextRect.width/2 + 8) * Math.cos(angle);
                        const arrowY = y2 - (nextRect.height/2 + 8) * Math.sin(angle);
                        const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
                        arrow.setAttribute('points', `${arrowX},${arrowY-arrowSize} ${arrowX+arrowSize*2},${arrowY} ${arrowX},${arrowY+arrowSize}`);
                        arrow.setAttribute('fill', lineColor);
                        arrow.setAttribute('opacity', '0.8');
                        arrow.setAttribute('transform', `rotate(${angle * 180 / Math.PI}, ${arrowX}, ${arrowY})`);
                        svg.appendChild(arrow);
                    }
                }
            }
        }, 250);
    }
});

// ESC 键关闭模型图谱模态框（扩展现有监听）
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeModelGraph();
    }
});