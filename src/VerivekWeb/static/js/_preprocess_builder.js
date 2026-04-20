// 预处理浏览器 - 文件树与数据集结构查看
let currentDatasetId = null;
let currentVersionId = null;
let currentStructure = null;

const ANNOTATION_EXTENSIONS = new Set(['csv', 'xls', 'xlsx', 'json', 'txt', 'tsv']);

// 页面初始化
document.addEventListener('DOMContentLoaded', () => {
    loadDatasetList();
    renderSplitWorkspace(null);

    const datasetSelect = document.getElementById('dataset-select');
    const versionSelect = document.getElementById('version-select');

    datasetSelect.addEventListener('change', (e) => {
        currentDatasetId = e.target.value ? parseInt(e.target.value) : null;
        currentVersionId = null;
        versionSelect.innerHTML = '<option value="">选择版本...</option>';
        versionSelect.disabled = true;
        document.getElementById('refresh-structure-btn').disabled = true;
        resetFileTree();

        if (currentDatasetId) {
            loadVersionList(currentDatasetId);
        }
    });

    versionSelect.addEventListener('change', (e) => {
        currentVersionId = e.target.value ? parseInt(e.target.value) : null;
        document.getElementById('refresh-structure-btn').disabled = !currentVersionId;
        if (currentVersionId) {
            loadDatasetStructure();
        } else {
            resetFileTree();
        }
    });
});

// 加载数据集列表
async function loadDatasetList() {
    const select = document.getElementById('dataset-select');
    try {
        const response = await fetch('/api/datasets');
        const data = await response.json();
        if (data.success && data.datasets) {
            select.innerHTML = '<option value="">选择数据集...</option>' +
                data.datasets.map(d => `<option value="${d.dataset_id}">${escapeHtml(d.dataset_name)}</option>`).join('');
        }
    } catch (err) {
        console.error('加载数据集列表失败:', err);
    }
}

// 加载版本列表
async function loadVersionList(datasetId) {
    const select = document.getElementById('version-select');
    try {
        const response = await fetch(`/api/datasets/${datasetId}/versions`);
        const data = await response.json();
        if (data.success && data.versions && data.versions.length > 0) {
            select.innerHTML = '<option value="">选择版本...</option>' +
                data.versions.map(v =>
                    `<option value="${v.version_id}">版本 ${v.version_number} - ${escapeHtml(v.message || '无备注')}</option>`
                ).join('');
            select.disabled = false;
        } else {
            select.innerHTML = '<option value="">无可用版本</option>';
            select.disabled = true;
        }
    } catch (err) {
        console.error('加载版本列表失败:', err);
        select.innerHTML = '<option value="">加载失败</option>';
        select.disabled = true;
    }
}

// 加载数据集目录结构
async function loadDatasetStructure() {
    if (!currentDatasetId || !currentVersionId) return;

    const placeholder = document.getElementById('file-tree-placeholder');
    const content = document.getElementById('file-tree-content');
    const loading = document.getElementById('file-tree-loading');
    const stats = document.getElementById('structure-stats');

    placeholder.classList.add('hidden');
    content.classList.add('hidden');
    loading.classList.remove('hidden');
    stats.classList.add('hidden');

    try {
        const response = await fetch(`/api/datasets/${currentDatasetId}/versions/${currentVersionId}/structure`);
        const data = await response.json();

        loading.classList.add('hidden');

        if (data.success && data.structure) {
            currentStructure = data.structure;
            renderFileTree(data.structure);
            updateStats(data.structure);
            renderSplitWorkspace(data.structure);
            content.classList.remove('hidden');
            stats.classList.remove('hidden');
        } else {
            placeholder.classList.remove('hidden');
            placeholder.innerHTML = `
                <svg class="w-16 h-16 mx-auto mb-4 opacity-30 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
                <p class="text-lg font-medium text-red-400 mb-1">加载失败</p>
                <p class="text-sm text-gray-500">${escapeHtml(data.error || '无法解析目录结构')}</p>
            `;
        }
    } catch (err) {
        loading.classList.add('hidden');
        placeholder.classList.remove('hidden');
        placeholder.innerHTML = `
            <svg class="w-16 h-16 mx-auto mb-4 opacity-30 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
            <p class="text-lg font-medium text-red-400 mb-1">请求失败</p>
            <p class="text-sm text-gray-500">${escapeHtml(err.message)}</p>
        `;
        console.error('加载目录结构失败:', err);
    }
}

// 重置文件树
function resetFileTree() {
    document.getElementById('file-tree-placeholder').classList.remove('hidden');
    document.getElementById('file-tree-content').classList.add('hidden');
    document.getElementById('file-tree-loading').classList.add('hidden');
    document.getElementById('structure-stats').classList.add('hidden');
    renderSplitWorkspace(null);
    document.getElementById('file-tree-placeholder').innerHTML = `
        <svg class="w-16 h-16 mx-auto mb-4 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"></path>
        </svg>
        <p class="text-lg font-medium text-gray-400 mb-1">请先选择数据集和版本</p>
        <p class="text-sm text-gray-500">选择后将自动加载目录结构</p>
    `;
}

// 获取实际要显示的根节点（跳过 root 和单一外包文件夹）
function getDisplayRoot(node) {
    if (!node || !node.children) return null;
    // 跳过 root
    let current = node;
    // 如果只有一个子节点且是文件夹，跳过它（通常是数据集外包文件夹）
    while (current.children && current.children.length === 1 && current.children[0].type === 'folder') {
        current = current.children[0];
    }
    return current;
}

// 渲染文件树 — 横排卡片式布局
function renderFileTree(node) {
    const target = document.getElementById('file-tree-content');
    target.innerHTML = '';

    const displayRoot = getDisplayRoot(node);
    if (!displayRoot || !displayRoot.children || displayRoot.children.length === 0) {
        target.innerHTML = '<p class="text-center text-gray-500 py-8">目录为空</p>';
        return;
    }

    const grid = document.createElement('div');
    grid.className = 'flex flex-wrap gap-3 content-start';

    for (const child of displayRoot.children) {
        const card = buildFolderCard(child);
        grid.appendChild(card);
    }

    target.appendChild(grid);
}

// 构建文件夹卡片
function buildFolderCard(node) {
    const isFolder = node.type === 'folder';

    const card = document.createElement('div');
    card.className = 'bg-white/5 border border-white/10 rounded-xl p-3 min-w-[160px] max-w-[260px] flex-1 flex flex-col';

    // 卡片头部
    const header = document.createElement('div');
    header.className = 'flex items-center space-x-2 mb-2 pb-2 border-b border-white/5';

    if (isFolder) {
        header.innerHTML = `
            <svg class="w-4 h-4 text-blue-400 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"></path>
            </svg>
            <span class="text-sm font-medium text-gray-200 truncate">${escapeHtml(node.name)}</span>
            <span class="ml-auto text-[10px] text-gray-500 bg-white/5 px-1.5 py-0.5 rounded">${node.children ? node.children.length : 0}</span>
        `;
    } else {
        const iconClass = node.is_annotation ? 'text-amber-400' : 'text-gray-500';
        const nameClass = node.is_annotation ? 'text-amber-300' : 'text-gray-400';
        header.innerHTML = `
            <svg class="w-4 h-4 ${iconClass} flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"></path>
            </svg>
            <span class="text-sm ${nameClass} truncate">${escapeHtml(node.name)}</span>
            ${node.size !== undefined ? `<span class="ml-auto text-[10px] text-gray-600 font-mono">${formatBytes(node.size)}</span>` : ''}
        `;
    }
    card.appendChild(header);

    // 子节点列表
    if (isFolder && node.children && node.children.length > 0) {
        const list = document.createElement('div');
        list.className = 'space-y-1 overflow-y-auto max-h-[200px]';

        for (const child of node.children) {
            const row = buildFileRow(child, 0);
            list.appendChild(row);
        }
        card.appendChild(list);
    }

    return card;
}

// 构建文件/子文件夹行（卡片内部垂直展开）
function buildFileRow(node, depth) {
    const isFolder = node.type === 'folder';
    const row = document.createElement('div');
    row.className = 'flex flex-col';

    const line = document.createElement('div');
    line.className = 'flex items-center py-0.5 px-1 rounded hover:bg-white/5 cursor-pointer transition-colors';
    line.style.paddingLeft = `${depth * 12 + 4}px`;

    if (isFolder) {
        line.innerHTML = `
            <svg class="w-3 h-3 text-blue-400 mr-1.5 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"></path>
            </svg>
            <span class="text-xs text-gray-300 truncate">${escapeHtml(node.name)}</span>
            <span class="ml-auto text-[10px] text-gray-600">${node.children ? node.children.length : 0}</span>
        `;
    } else {
        const iconColor = node.is_annotation ? 'text-amber-400' : 'text-gray-500';
        const nameColor = node.is_annotation ? 'text-amber-300' : 'text-gray-400';
        line.innerHTML = `
            <svg class="w-3 h-3 ${iconColor} mr-1.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"></path>
            </svg>
            <span class="text-xs ${nameColor} truncate">${escapeHtml(node.name)}</span>
            ${node.size !== undefined ? `<span class="ml-auto text-[10px] text-gray-600 font-mono">${formatBytes(node.size)}</span>` : ''}
        `;
    }
    row.appendChild(line);

    // 文件夹展开子节点
    if (isFolder && node.children && node.children.length > 0) {
        const childrenContainer = document.createElement('div');
        childrenContainer.className = 'overflow-hidden transition-all';

        for (const child of node.children) {
            const childEl = buildFileRow(child, depth + 1);
            childrenContainer.appendChild(childEl);
        }

        row.appendChild(childrenContainer);

        // 点击展开/折叠
        line.addEventListener('click', () => {
            const isHidden = childrenContainer.style.display === 'none';
            childrenContainer.style.display = isHidden ? 'flex' : 'none';
            childrenContainer.style.flexDirection = 'column';
        });
    }

    return row;
}

// 渲染数据集划分工作区（train/val/test）
function renderSplitWorkspace(structure) {
    const container = document.getElementById('split-workspace');
    container.innerHTML = '';

    const splits = [
        { key: 'train', label: 'Train', color: 'emerald', desc: '训练集' },
        { key: 'val', label: 'Validation', color: 'blue', desc: '验证集' },
        { key: 'test', label: 'Test', color: 'purple', desc: '测试集' }
    ];

    let splitNodes = {};
    if (structure) {
        const displayRoot = getDisplayRoot(structure);
        if (displayRoot && displayRoot.children) {
            for (const child of displayRoot.children) {
                const name = child.name.toLowerCase();
                if (name === 'train' || name === 'training') splitNodes['train'] = child;
                else if (name === 'val' || name === 'validation' || name === 'valid') splitNodes['val'] = child;
                else if (name === 'test' || name === 'testing') splitNodes['test'] = child;
            }
        }
    }

    for (const split of splits) {
        const node = splitNodes[split.key];
        const card = document.createElement('div');
        card.className = `flex-1 min-w-[200px] bg-${split.color}-500/5 border border-${split.color}-500/20 rounded-xl flex flex-col overflow-hidden`;

        // 头部
        const header = document.createElement('div');
        header.className = `p-3 border-b border-${split.color}-500/20 bg-${split.color}-500/10 flex items-center space-x-2`;
        header.innerHTML = `
            <svg class="w-5 h-5 text-${split.color}-400" fill="currentColor" viewBox="0 0 24 24">
                <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"></path>
            </svg>
            <div>
                <div class="text-sm font-medium text-${split.color}-300">${split.label}</div>
                <div class="text-[10px] text-${split.color}-400/60">${split.desc}</div>
            </div>
        `;
        card.appendChild(header);

        // 内容区
        const body = document.createElement('div');
        body.className = 'flex-1 p-3 overflow-y-auto';

        if (node && node.children && node.children.length > 0) {
            for (const child of node.children) {
                const row = buildFileRow(child, 0);
                body.appendChild(row);
            }
        } else {
            body.innerHTML = `
                <div class="text-center py-6 text-gray-600">
                    <svg class="w-10 h-10 mx-auto mb-2 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z"></path>
                    </svg>
                    <p class="text-xs">未检测到${split.label}文件夹</p>
                    <p class="text-[10px] text-gray-700 mt-1">从上方拖拽文件夹到此处</p>
                </div>
            `;
        }
        card.appendChild(body);

        // 底部统计
        const footer = document.createElement('div');
        footer.className = `p-2 border-t border-${split.color}-500/10 bg-${split.color}-500/5 text-[10px] text-${split.color}-400/60 flex items-center justify-between`;
        if (node) {
            let fileCount = 0;
            let folderCount = 0;
            function count(n) {
                if (n.type === 'folder') { folderCount++; if (n.children) n.children.forEach(count); }
                else fileCount++;
            }
            if (node.children) node.children.forEach(count);
            footer.innerHTML = `<span>${folderCount} 文件夹</span><span>${fileCount} 文件</span>`;
        } else {
            footer.innerHTML = `<span>--</span><span>--</span>`;
        }
        card.appendChild(footer);

        container.appendChild(card);
    }
}

// 统计文件树
function updateStats(node) {
    let folders = 0;
    let files = 0;
    let annotations = 0;

    function traverse(n) {
        if (n.type === 'folder') {
            folders++;
            if (n.children) {
                for (const child of n.children) traverse(child);
            }
        } else {
            files++;
            if (n.is_annotation) annotations++;
        }
    }

    traverse(node);

    document.getElementById('folder-count').textContent = folders;
    document.getElementById('file-count').textContent = files;
    document.getElementById('annotation-count').textContent = annotations;
}

// 更新预处理面板
function updatePreprocessPanel() {
    const panel = document.getElementById('preprocess-action-panel');
    if (!currentDatasetId || !currentVersionId) {
        panel.innerHTML = `
            <svg class="w-12 h-12 mx-auto mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
            <p>在上方选择数据集版本后，此处将显示预处理配置面板</p>
        `;
        return;
    }

    const datasetName = document.getElementById('dataset-select').selectedOptions[0].text;
    const versionName = document.getElementById('version-select').selectedOptions[0].text;

    panel.innerHTML = `
        <div class="text-left space-y-4">
            <div class="flex items-center space-x-4 p-4 bg-white/5 rounded-xl border border-white/10">
                <div class="w-12 h-12 rounded-xl bg-indigo-500/20 flex items-center justify-center">
                    <svg class="w-6 h-6 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path>
                    </svg>
                </div>
                <div>
                    <div class="text-sm text-gray-400">已选数据源</div>
                    <div class="text-white font-medium">${escapeHtml(datasetName)} · ${escapeHtml(versionName)}</div>
                </div>
            </div>
            <div class="flex space-x-3">
                <button onclick="alert('预处理任务创建功能即将上线')" class="flex-1 px-6 py-3 bg-purple-600 hover:bg-purple-500 rounded-xl font-medium transition-all flex items-center justify-center space-x-2">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"></path>
                    </svg>
                    <span>创建预处理任务</span>
                </button>
                <button onclick="window.open('/datasets', '_self')" class="px-6 py-3 bg-white/5 hover:bg-white/10 rounded-xl font-medium transition-all border border-white/10 text-gray-300">
                    前往数据集管理
                </button>
            </div>
        </div>
    `;
}

// 工具函数
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
