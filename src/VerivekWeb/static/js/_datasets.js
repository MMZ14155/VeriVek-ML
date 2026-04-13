let currentDatasetId = null;
let currentSelectedVersion = null;
let currentPreprocessMap = {};
let activePopupVersionId = null;

function openDatasetImportModal() {
    const modal = document.getElementById('dataset-import-modal');
    if (modal) {
        modal.classList.remove('hidden');
        resetDatasetUploadUI();
    }
}

function closeDatasetImportModal() {
    const modal = document.getElementById('dataset-import-modal');
    if (modal) modal.classList.add('hidden');
}

function resetDatasetUploadUI() {
    const form = document.getElementById('dataset-import-form');
    const fileType = document.getElementById('dataset-file-type');
    const progressContainer = document.getElementById('upload-progress-container');
    const progressBar = document.getElementById('upload-progress-bar');
    const percentageText = document.getElementById('upload-percentage');

    if (form) form.reset();
    if (fileType) fileType.textContent = '支持包含图片、CSV 或 JSON 的文件夹';
    if (progressContainer) progressContainer.classList.add('hidden');
    if (progressBar) progressBar.style.width = '0%';
    if (percentageText) percentageText.textContent = '0%';
}

function handleDatasetFileSelect(event) {
    const files = event.target.files;
    if (files.length > 0) {
        const isFolder = files[0].webkitRelativePath && files[0].webkitRelativePath.includes('/');
        const fileType = document.getElementById('dataset-file-type');
        if (fileType) {
            fileType.textContent = isFolder ?
                `文件夹 (${files.length} 个文件)` : `${files.length} 个文件`;
        }

        const folderName = files[0].webkitRelativePath.split('/')[0] || files[0].name.replace(/\.[^/.]+$/, "");
        const nameInput = document.getElementById('import-dataset-name');
        if (nameInput && !nameInput.value) {
            nameInput.value = folderName;
        }
    }
}

async function handleDatasetImport(event) {
    event.preventDefault();
    const files = document.getElementById('dataset-files').files;
    if (files.length === 0) {
        alert('请选择文件夹或文件');
        return;
    }

    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const relativePath = file.webkitRelativePath || file.name;
        formData.append('files', file, relativePath);
    }

    formData.append('dataset_name', document.getElementById('import-dataset-name').value);
    formData.append('format', document.getElementById('dataset-format').value);
    formData.append('description', document.getElementById('import-description').value);
    formData.append('tags', document.getElementById('import-tags').value);
    formData.append('visibility', document.getElementById('import-visibility').value);
    formData.append('message', 'Initial import');

    const progressBar = document.getElementById('upload-progress-bar');
    const percentageText = document.getElementById('upload-percentage');
    const submitBtn = document.getElementById('dataset-import-submit');

    if (submitBtn) submitBtn.disabled = true;
    const progressContainer = document.getElementById('upload-progress-container');
    if (progressContainer) progressContainer.classList.remove('hidden');

    let progress = 0;
    const progressInterval = setInterval(() => {
        if (progress < 90) {
            progress += Math.random() * 10;
            if (progressBar) progressBar.style.width = `${Math.min(progress, 90)}%`;
            if (percentageText) percentageText.textContent = `${Math.round(Math.min(progress, 90))}%`;
        }
    }, 300);

    try {
        const response = await fetch('/api/datasets', {
            method: 'POST',
            body: formData
        });

        clearInterval(progressInterval);
        if (progressBar) progressBar.style.width = '100%';
        if (percentageText) percentageText.textContent = '100%';

        if (response.ok) {
            setTimeout(() => {
                closeDatasetImportModal();
                fetchDatasets();
                resetDatasetUploadUI();
                if (submitBtn) submitBtn.disabled = false;
            }, 500);
        } else {
            const error = await response.json();
            alert('导入失败: ' + error.error);
            if (submitBtn) submitBtn.disabled = false;
        }
    } catch (error) {
        clearInterval(progressInterval);
        alert('上传失败: ' + error.message);
        if (submitBtn) submitBtn.disabled = false;
    }
}

async function fetchDatasets() {
    const container = document.getElementById('dataset-list-container');
    if (!container) return;

    try {
        const response = await fetch('/api/datasets');
        const data = await response.json();

        if (data.success) {
            renderDatasetList(data.datasets);
        } else {
            container.innerHTML = `<div class="p-8 text-center text-red-400">加载失败: ${data.error}</div>`;
        }
    } catch (error) {
        container.innerHTML = `<div class="p-8 text-center text-red-400">网络连接失败</div>`;
    }
}

function renderDatasetList(datasets) {
    const container = document.getElementById('dataset-list-container');
    if (!container) return;

    if (!datasets || datasets.length === 0) {
        container.innerHTML = `
            <div class="p-8 text-center text-gray-500">
                <p>暂无数据集</p>
                <button onclick="openDatasetImportModal()" class="text-indigo-400 hover:text-indigo-300 text-sm mt-2">
                    导入第一个数据集 →
                </button>
            </div>
        `;
        return;
    }

    const colorSchemes = [
        { name: 'blue', icon: 'DB' },
        { name: 'emerald', icon: 'IMG' },
        { name: 'purple', icon: 'TXT' },
        { name: 'orange', icon: 'CSV' }
    ];

    const html = datasets.map((ds, index) => {
        const scheme = colorSchemes[index % colorSchemes.length];
        const format = ds.format || 'unknown';
        const sizeMB = (ds.total_size_bytes / 1024 / 1024).toFixed(1);

        return `
        <div class="glass-panel rounded-2xl p-6 hover:border-indigo-500/50 transition-all cursor-pointer group" onclick="showDatasetDetail(${ds.dataset_id})">
            <div class="flex items-start justify-between mb-4">
                <div class="w-12 h-12 rounded-xl bg-${scheme.name}-500/20 flex items-center justify-center">
                    <span class="text-${scheme.name}-400 font-bold text-sm">${scheme.icon}</span>
                </div>
                <span class="px-2 py-1 bg-emerald-500/20 text-emerald-400 text-xs rounded-full border border-emerald-500/30">
                    ${ds.total_rows.toLocaleString()} 样本
                </span>
            </div>
            <h3 class="text-lg font-semibold mb-2 group-hover:text-indigo-400 transition-colors">${escapeHtml(ds.dataset_name)}</h3>
            <p class="text-sm text-gray-400 mb-4 line-clamp-2">${escapeHtml(ds.description || '暂无描述')}</p>
            <div class="flex items-center justify-between text-sm text-gray-500 border-t border-white/5 pt-4">
                <span class="px-2 py-0.5 bg-white/5 rounded text-xs">${format.toUpperCase()}</span>
                <span>${sizeMB} MB • ${ds.version_count} 版本</span>
            </div>
        </div>
        `;
    }).join('');

    container.innerHTML = html;
}

function showDatasetDetail(datasetId) {
    currentDatasetId = datasetId;
    const modal = document.getElementById('dataset-graph-modal');
    if (modal) {
        modal.classList.remove('hidden');
        document.getElementById('version-detail-panel').classList.remove('hidden');
        document.getElementById('version-upload-panel').classList.add('hidden');
        document.getElementById('preprocess-upload-panel').classList.add('hidden');
        loadDatasetGraph(datasetId);
    }
}

function closeDatasetGraph() {
    const modal = document.getElementById('dataset-graph-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

async function loadDatasetGraph(datasetId) {
    const container = document.getElementById('version-nodes');
    const datasetName = document.getElementById('graph-dataset-name');
    const datasetMeta = document.getElementById('graph-dataset-meta');

    if (container) {
        container.innerHTML = '<div class="flex items-center justify-center w-full h-full"><div class="animate-spin w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full"></div></div>';
    }

    try {
        const [versionsResponse, preprocessResponse] = await Promise.all([
            fetch(`/api/datasets/${datasetId}/versions`),
            fetch(`/api/datasets/${datasetId}/preprocess`)
        ]);

        const versionsData = await versionsResponse.json();
        const preprocessData = await preprocessResponse.json();

        if (!versionsData.success) {
            throw new Error(versionsData.error || '加载失败');
        }

        const dataset = versionsData.dataset;
        const versions = versionsData.versions || [];

        currentPreprocessMap = {};
        if (preprocessData.success && preprocessData.versions) {
            preprocessData.versions.forEach(p => {
                const vid = p.source_version_id;
                if (!currentPreprocessMap[vid]) {
                    currentPreprocessMap[vid] = [];
                }
                currentPreprocessMap[vid].push(p);
            });
        }

        if (datasetName) datasetName.textContent = dataset.dataset_name || '未命名数据集';
        if (datasetMeta) {
            const sizeMB = ((dataset.total_size_bytes || 0) / 1024 / 1024).toFixed(1);
            datasetMeta.textContent = `${(dataset.total_rows || 0).toLocaleString()} 样本 • ${sizeMB} MB • 共 ${versions.length} 个版本`;
        }

        if (versions.length === 0) {
            container.innerHTML = '<div class="text-center text-gray-500 p-8">暂无版本记录<br><button onclick="openVersionUploadPanel()" class="mt-4 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-sm">导入首个版本</button></div>';
            return;
        }

        renderVersionNodes(versions, currentPreprocessMap);
        setTimeout(() => drawVersionConnections(versions), 150);

        const parentSelect = document.getElementById('parent-version-select');
        if (parentSelect) {
            parentSelect.innerHTML = '<option value="latest">最新版本（自动追加）</option>' +
                versions.map(v => `<option value="${v.version_id}">版本 ${v.version_number}</option>`).join('');
        }

    } catch (error) {
        console.error('加载数据集图谱失败:', error);
        if (container) {
            container.innerHTML = `
                <div class="text-center text-red-400 p-8">
                    <svg class="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                    </svg>
                    <p>加载失败: ${error.message}</p>
                    <button onclick="loadDatasetGraph(${datasetId})" class="mt-4 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm text-white">重试</button>
                </div>
            `;
        }
    }
}

function renderVersionNodes(versions, preprocessMap = {}) {
    const container = document.getElementById('version-nodes');
    if (!container) return;
    container.innerHTML = '';

    versions.forEach((version, index) => {
        const isFirst = index === 0;
        const isLast = index === versions.length - 1;

        const baseSize = 48;
        const addedRows = version.added_rows || 0;
        const nodeSize = Math.min(80, baseSize + Math.sqrt(addedRows) / 2);

        const preprocessedList = preprocessMap[version.version_id] || [];
        const preprocessedCount = preprocessedList.length;

        const node = document.createElement('div');
        node.className = `relative flex flex-col items-center cursor-pointer group flex-shrink-0 version-node`;
        node.style.width = `${nodeSize + 20}px`;
        node.dataset.versionId = version.version_id;
        node.dataset.hasPreprocess = preprocessedCount > 0;

        // 如果有预处理版本，点击显示弹出层；否则只显示详情
        if (preprocessedCount > 0) {
            node.onclick = (e) => {
                e.stopPropagation();
                showPreprocessPopup(version, preprocessedList, node);
            };
        } else {
            node.onclick = () => showVersionDetail(version);
        }

        // 静态指示器（小点）保留，提示用户此节点有预处理
        let staticIndicator = '';
        if (preprocessedCount > 0) {
            staticIndicator = `
                <div class="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-purple-500 border-2 border-[#13131f] z-30"></div>
            `;
        }

        node.innerHTML = `
            <div class="rounded-full ${isLast ? 'bg-emerald-500' : 'bg-indigo-500'} 
                        border-4 border-[#13131f] shadow-lg ${isLast ? 'shadow-emerald-500/30' : 'shadow-indigo-500/30'}
                        flex items-center justify-center transition-all group-hover:scale-110 relative z-20"
                 style="width: ${nodeSize}px; height: ${nodeSize}px;">
                <span class="text-xs font-bold text-white">${version.version_number}</span>
                ${isLast ? '<div class="absolute -top-1 -right-1 w-3 h-3 bg-emerald-400 rounded-full border-2 border-[#13131f]"></div>' : ''}
                ${!isLast && preprocessedCount > 0 ? staticIndicator : ''}
            </div>
            
            <div class="mt-4 text-center opacity-60 group-hover:opacity-100 transition-opacity w-32">
                <div class="text-xs font-medium text-white mb-1">V${version.version_number}</div>
                <div class="text-[10px] text-gray-400 truncate">${formatRelativeTime(version.created_at)}</div>
                <div class="text-[10px] ${isLast ? 'text-emerald-400' : 'text-indigo-400'} mt-1">
                    ${index === 0 ? '初始 ' : '+'}${(version.added_rows || 0).toLocaleString()} 行
                </div>
            </div>
        `;

        container.appendChild(node);
    });

    const addNode = document.createElement('div');
    addNode.className = 'relative flex flex-col items-center cursor-pointer group ml-8 flex-shrink-0';
    addNode.onclick = openVersionUploadPanel;
    addNode.innerHTML = `
        <div class="w-12 h-12 rounded-full border-2 border-dashed border-gray-500 hover:border-emerald-500 hover:bg-emerald-500/10
                    flex items-center justify-center transition-all">
            <svg class="w-5 h-5 text-gray-400 group-hover:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path>
            </svg>
        </div>
        <div class="mt-3 text-xs text-gray-500 group-hover:text-emerald-400">追加数据</div>
    `;
    container.appendChild(addNode);
}

function showPreprocessPopup(version, preprocessedList, nodeElement) {
    // 关闭之前的弹出层
    hidePreprocessPopup();

    activePopupVersionId = version.version_id;
    currentSelectedVersion = version;

    const displayCount = Math.min(preprocessedList.length, 3);
    const isLast = nodeElement.querySelector('.bg-emerald-500') !== null;
    const nodeSize = nodeElement.querySelector('.rounded-full').offsetWidth;

    // 创建弹出容器
    const popup = document.createElement('div');
    popup.id = 'preprocess-popup';
    popup.className = 'absolute z-50 flex flex-col items-center';

    // 定位计算：在节点正上方
    const rect = nodeElement.getBoundingClientRect();
    const containerRect = document.getElementById('version-nodes').getBoundingClientRect();
    const relativeLeft = rect.left - containerRect.left + rect.width / 2;
    const relativeTop = rect.top - containerRect.top;

    popup.style.left = `${relativeLeft}px`;
    popup.style.top = `${relativeTop - 10}px`; // 稍微重叠，视觉上连接更紧密
    popup.style.transform = 'translate(-50%, -100%)';

    // 生成预处理节点HTML（倒序，最新的在上面）
    const preprocessNodes = preprocessedList.slice(0, displayCount).reverse().map((p, idx) => `
        <div class="w-10 h-10 rounded-full bg-purple-500 border-3 border-[#13131f] shadow-lg shadow-purple-500/40 
                    flex items-center justify-center transform hover:scale-110 transition-transform cursor-pointer mb-1
                    preprocess-popup-item"
             data-preprocessed-id="${p.preprocessed_id}"
             title="${p.name} (${p.status || 'pending'})">
            <span class="text-[10px] font-bold text-white">P${preprocessedList.length - idx}</span>
        </div>
    `).join('');

    // 如果超过3个，添加"+n"指示器
    const moreIndicator = preprocessedList.length > 3 ? `
        <div class="w-8 h-8 rounded-full bg-purple-600 border-2 border-[#13131f] shadow-lg 
                    flex items-center justify-center mt-1">
            <span class="text-[9px] font-bold text-white">+${preprocessedList.length - 3}</span>
        </div>
    ` : '';

    popup.innerHTML = `
        <div class="flex flex-col items-center p-2 bg-[#13131f]/90 rounded-2xl border border-purple-500/30 backdrop-blur-sm shadow-2xl">
            ${moreIndicator}
            ${preprocessNodes}
            <div class="w-0.5 h-3 bg-purple-500/50 my-1"></div>
        </div>
    `;

    // 添加点击事件：点击预处理节点打开详情面板
    popup.querySelectorAll('.preprocess-popup-item').forEach((item, idx) => {
        item.onclick = (e) => {
            e.stopPropagation();
            hidePreprocessPopup();
            showVersionDetail(version); // 先显示版本详情
            // 可以在这里添加高亮特定预处理版本的逻辑
        };
    });

    document.getElementById('version-nodes').appendChild(popup);

    // 动画效果
    requestAnimationFrame(() => {
        popup.style.opacity = '0';
        popup.style.transform = 'translate(-50%, -90%)';
        popup.style.transition = 'all 0.2s ease-out';
        requestAnimationFrame(() => {
            popup.style.opacity = '1';
            popup.style.transform = 'translate(-50%, -100%)';
        });
    });
}

function hidePreprocessPopup() {
    const existing = document.getElementById('preprocess-popup');
    if (existing) {
        existing.style.opacity = '0';
        existing.style.transform = 'translate(-50%, -90%)';
        setTimeout(() => existing.remove(), 200);
    }
    activePopupVersionId = null;
}

// 点击其他地方关闭弹出层
document.addEventListener('click', (e) => {
    if (!e.target.closest('#preprocess-popup') && !e.target.closest('.version-node')) {
        hidePreprocessPopup();
    }
});

// ESC键关闭弹出层
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        hidePreprocessPopup();
    }
});

function showVersionDetail(version) {
    currentSelectedVersion = version;

    const panel = document.getElementById('version-detail-panel');
    if (!panel) return;

    const date = new Date(version.created_at);
    const isInitial = version.version_number === 1;

    const preprocessedList = currentPreprocessMap[version.version_id] || [];
    const hasPreprocessed = preprocessedList.length > 0;

    let preprocessHtml = '';
    if (hasPreprocessed) {
        preprocessHtml = `
            <div class="mt-4 pt-4 border-t border-white/5">
                <div class="flex items-center justify-between mb-3">
                    <div class="text-xs text-gray-400">预处理后版本</div>
                    <span class="text-xs bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded-full border border-purple-500/30">
                        ${preprocessedList.length} 个
                    </span>
                </div>
                <div class="space-y-2 max-h-32 overflow-y-auto">
                    ${preprocessedList.slice(0, 3).map((p, idx) => `
                        <div class="flex items-center justify-between p-2 bg-purple-500/10 rounded-lg border border-purple-500/20">
                            <div class="flex items-center space-x-2">
                                <div class="w-2 h-2 rounded-full ${p.status === 'completed' ? 'bg-emerald-400' : 'bg-yellow-400'}"></div>
                                <span class="text-xs text-purple-200 font-medium truncate w-24">${p.name}</span>
                            </div>
                            <span class="text-[10px] text-gray-500">${p.status || 'pending'}</span>
                        </div>
                    `).join('')}
                    ${preprocessedList.length > 3 ? `
                        <div class="text-xs text-center text-gray-500 pt-1">
                            还有 ${preprocessedList.length - 3} 个预处理版本...
                        </div>
                    ` : ''}
                </div>
                <button onclick="openPreprocessUploadPanel()" 
                    class="w-full mt-3 py-2 bg-purple-600/50 hover:bg-purple-600 rounded-lg text-xs text-white transition-colors border border-purple-500/30 flex items-center justify-center space-x-2">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path>
                    </svg>
                    <span>添加预处理版本</span>
                </button>
            </div>
        `;
    } else {
        preprocessHtml = `
            <div class="mt-4 pt-4 border-t border-white/5">
                <div class="text-xs text-gray-400 mb-3">预处理后数据</div>
                <button onclick="openPreprocessUploadPanel('${version.version_id}')" 
                    class="w-full py-3 bg-white/5 hover:bg-purple-500/20 hover:border-purple-500/30 border border-dashed border-white/20 rounded-lg text-sm text-gray-400 hover:text-purple-300 transition-all flex items-center justify-center space-x-2 group">
                    <svg class="w-5 h-5 group-hover:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"></path>
                    </svg>
                    <span>创建预处理版本</span>
                </button>
                <p class="text-xs text-gray-500 text-center mt-2">上传脚本处理此版本数据</p>
            </div>
        `;
    }

    panel.innerHTML = `
        <div class="space-y-4">
            <div class="flex items-center justify-between pb-4 border-b border-white/5">
                <div class="flex items-center space-x-2">
                    <div class="w-8 h-8 rounded-full ${isInitial ? 'bg-indigo-500/20 text-indigo-400' : 'bg-emerald-500/20 text-emerald-400'} flex items-center justify-center font-bold text-sm">
                        ${version.version_number}
                    </div>
                    <div>
                        <div class="font-semibold text-white">版本 ${version.version_number}</div>
                        <div class="text-xs text-gray-400">${date.toLocaleDateString()} ${date.toLocaleTimeString()}</div>
                    </div>
                </div>
                <button onclick="downloadVersion('${version.version_id}')" class="p-2 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white" title="下载此版本">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4-4m0 0l-4 4m4-4v12"></path>
                    </svg>
                </button>
            </div>
            
            <div class="space-y-3 text-sm">
                <div class="flex justify-between py-2 border-b border-white/5">
                    <span class="text-gray-400">数据行数</span>
                    <span class="font-mono text-white">${(version.rows_count || 0).toLocaleString()}</span>
                </div>
                <div class="flex justify-between py-2 border-b border-white/5">
                    <span class="text-gray-400">本次新增</span>
                    <span class="font-mono text-emerald-400">+${(version.added_rows || 0).toLocaleString()}</span>
                </div>
                <div class="flex justify-between py-2 border-b border-white/5">
                    <span class="text-gray-400">存储大小</span>
                    <span class="font-mono text-white">${((version.size_bytes || 0) / 1024 / 1024).toFixed(1)} MB</span>
                </div>
                <div class="flex justify-between py-2 border-b border-white/5">
                    <span class="text-gray-400">更新者</span>
                    <span class="text-white">${version.created_by || 'System'}</span>
                </div>
                <div class="flex justify-between py-2 border-b border-white/5">
                    <span class="text-gray-400">校验和</span>
                    <span class="font-mono text-gray-500 text-xs">${version.checksum || '--'}</span>
                </div>
            </div>
            
            <div class="mt-4">
                <div class="text-xs text-gray-400 mb-2">版本备注</div>
                <div class="p-3 bg-white/5 rounded-lg text-sm text-gray-300 border border-white/5 min-h-[60px]">
                    ${version.message || '无描述信息'}
                </div>
            </div>
            
            ${preprocessHtml}
            
            <div class="pt-4 border-t border-white/5 space-y-2">
                <button onclick="useVersionForTraining('${version.version_id}')" 
                    class="w-full py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm font-medium transition-colors">
                    使用此版本训练
                </button>
                <button onclick="openVersionUploadPanel()" 
                    class="w-full py-2 bg-white/5 hover:bg-white/10 rounded-lg text-sm text-gray-400 transition-colors">
                    基于此版本追加数据
                </button>
            </div>
        </div>
    `;
}

function openPreprocessUploadPanel(versionId) {
    const targetVersionId = versionId || (currentSelectedVersion && currentSelectedVersion.version_id);
    if (!targetVersionId) {
        alert('请先选择一个原始数据版本');
        return;
    }

    if (currentSelectedVersion) {
        document.getElementById('preprocess-source-version-badge').textContent = 'V' + currentSelectedVersion.version_number;
        document.getElementById('preprocess-source-version-name').textContent = '版本 ' + currentSelectedVersion.version_number;
        document.getElementById('preprocess-source-version-id').value = currentSelectedVersion.version_id;
    } else {
        document.getElementById('preprocess-source-version-id').value = targetVersionId;
    }

    resetPreprocessUploadUI();

    document.getElementById('version-detail-panel').classList.add('hidden');
    document.getElementById('version-upload-panel').classList.add('hidden');
    document.getElementById('preprocess-upload-panel').classList.remove('hidden');
}

function closePreprocessUploadPanel() {
    document.getElementById('preprocess-upload-panel').classList.add('hidden');
    document.getElementById('version-detail-panel').classList.remove('hidden');
}

function resetPreprocessUploadUI() {
    const form = document.getElementById('preprocess-upload-form');
    const prompt = document.getElementById('preprocess-script-prompt');
    const selected = document.getElementById('preprocess-script-selected');
    const progress = document.getElementById('preprocess-upload-progress');
    const submitBtn = document.getElementById('preprocess-submit-btn');

    if (form) form.reset();
    if (prompt) prompt.classList.remove('hidden');
    if (selected) selected.classList.add('hidden');
    if (progress) progress.classList.add('hidden');
    if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `<span>创建预处理任务</span><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"></path></svg>`;
    }
}

function handlePreprocessScriptSelect(event) {
    const file = event.target.files[0];
    if (file) {
        document.getElementById('preprocess-script-prompt').classList.add('hidden');
        document.getElementById('preprocess-script-selected').classList.remove('hidden');
        document.getElementById('preprocess-script-filename').textContent = file.name;

        const nameInput = document.getElementById('preprocess-name');
        if (!nameInput.value) {
            nameInput.value = file.name.replace('.py', '').replace(/[_-]/g, ' ');
        }
    }
}

async function handlePreprocessUpload(event) {
    event.preventDefault();

    if (!currentDatasetId) {
        alert('未选择数据集');
        return;
    }

    const scriptFile = document.getElementById('preprocess-script').files[0];
    const name = document.getElementById('preprocess-name').value;
    const sourceVersionId = document.getElementById('preprocess-source-version-id').value;
    const config = document.getElementById('preprocess-config').value || '{}';

    if (!scriptFile) {
        alert('请上传预处理脚本');
        return;
    }

    if (!name) {
        alert('请输入预处理名称');
        return;
    }

    const formData = new FormData();
    formData.append('script', scriptFile);
    formData.append('name', name);
    formData.append('source_version_id', sourceVersionId);
    formData.append('config', config);

    const progressBar = document.getElementById('preprocess-progress-bar');
    const percentText = document.getElementById('preprocess-upload-percent');
    const submitBtn = document.getElementById('preprocess-submit-btn');
    const progressContainer = document.getElementById('preprocess-upload-progress');

    if (progressContainer) progressContainer.classList.remove('hidden');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span>创建中...</span>';
    }

    try {
        const response = await fetch(`/api/datasets/${currentDatasetId}/preprocess`, {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        if (response.ok && result.success) {
            // 开始轮询预处理状态
            if (progressBar) progressBar.style.width = '30%';
            if (percentText) percentText.textContent = '30%';
            if (submitBtn) submitBtn.innerHTML = '<span>执行预处理脚本...</span>';

            // 轮询状态
            await pollPreprocessStatus(result.preprocessed_id, progressBar, percentText, submitBtn);
        } else {
            throw new Error(result.error || '创建失败');
        }
    } catch (error) {
        console.error('预处理上传失败:', error);
        alert('创建预处理任务失败: ' + error.message);

        if (progressBar) progressBar.style.width = '0%';
        if (percentText) percentText.textContent = '0%';
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = `<span>创建预处理任务</span><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"></path></svg>`;
        }
    }
}

// 轮询预处理状态
async function pollPreprocessStatus(preprocessedId, progressBar, percentText, submitBtn) {
    const maxRetries = 120; // 最多轮询120次（约2分钟）
    const interval = 1000; // 每秒轮询一次

    for (let i = 0; i < maxRetries; i++) {
        try {
            const response = await fetch(`/api/preprocess/${preprocessedId}/status`);
            const result = await response.json();

            if (!result.success) {
                throw new Error(result.error || '获取状态失败');
            }

            const status = result.status;

            // 更新进度显示
            if (status.status === 'pending') {
                if (progressBar) progressBar.style.width = '35%';
                if (percentText) percentText.textContent = '35%';
                if (submitBtn) submitBtn.innerHTML = '<span>等待执行...</span>';
            } else if (status.status === 'running') {
                // 简单的进度动画
                const progress = 50 + (i % 40);
                if (progressBar) progressBar.style.width = `${progress}%`;
                if (percentText) percentText.textContent = `${Math.round(progress)}%`;
                if (submitBtn) submitBtn.innerHTML = '<span>执行预处理脚本...</span>';
            } else if (status.status === 'completed') {
                // 完成
                if (progressBar) progressBar.style.width = '100%';
                if (percentText) percentText.textContent = '100%';
                if (submitBtn) submitBtn.innerHTML = '<span class="text-emerald-400">✓ 完成</span>';

                // 显示成功信息
                alert('预处理完成！数据已保存至 TaskEnv');

                setTimeout(() => {
                    closePreprocessUploadPanel();
                    loadDatasetGraph(currentDatasetId);
                }, 500);
                return;
            } else if (status.status === 'failed') {
                // 失败
                if (progressBar) progressBar.style.width = '0%';
                if (percentText) percentText.textContent = '失败';
                if (submitBtn) submitBtn.innerHTML = '<span class="text-red-400">✗ 失败</span>';

                alert('预处理失败，请检查服务器日志');

                setTimeout(() => {
                    closePreprocessUploadPanel();
                    loadDatasetGraph(currentDatasetId);
                }, 1000);
                return;
            }
        } catch (error) {
            console.error('轮询状态失败:', error);
        }

        // 等待下一次轮询
        await new Promise(resolve => setTimeout(resolve, interval));
    }

    // 超时
    alert('预处理执行超时，请稍后刷新页面查看结果');
    closePreprocessUploadPanel();
    loadDatasetGraph(currentDatasetId);
}

function openVersionUploadPanel() {
    document.getElementById('version-detail-panel').classList.add('hidden');
    document.getElementById('version-upload-panel').classList.remove('hidden');
}

function closeVersionUploadPanel() {
    document.getElementById('version-upload-panel').classList.add('hidden');
    document.getElementById('version-detail-panel').classList.remove('hidden');
    const form = document.getElementById('version-upload-form');
    if (form) form.reset();
}

async function handleVersionUpload(event) {
    event.preventDefault();

    if (!currentDatasetId) {
        alert('未选择数据集');
        return;
    }

    const files = document.getElementById('version-files').files;
    const message = document.getElementById('version-message').value || '追加数据版本';
    const parentVersion = document.getElementById('parent-version-select').value;
    const updateMode = document.querySelector('input[name="update_mode"]:checked')?.value || 'append';

    if (files.length === 0) {
        alert('请选择要追加的文件');
        return;
    }

    const progressBar = document.getElementById('version-progress-bar');
    const percentText = document.getElementById('version-upload-percent');
    const submitBtn = document.getElementById('version-submit-btn');
    const progressContainer = document.getElementById('version-upload-progress');

    if (progressContainer) progressContainer.classList.remove('hidden');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span>上传中...</span>';
    }

    try {
        const formData = new FormData();
        for (let i = 0; i < files.length; i++) {
            const relativePath = files[i].webkitRelativePath || files[i].name;
            formData.append('files', files[i], relativePath);
        }
        formData.append('message', message);
        formData.append('parent_version', parentVersion);
        formData.append('update_mode', updateMode);

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

            xhr.open('POST', `/api/datasets/${currentDatasetId}/versions`);
            xhr.send(formData);
        });

        const result = await uploadPromise;

        setTimeout(() => {
            closeVersionUploadPanel();
            loadDatasetGraph(currentDatasetId);
            const firstVersion = document.querySelector('#version-nodes > div');
            if (firstVersion) firstVersion.click();
        }, 300);

    } catch (error) {
        console.error('上传失败:', error);
        alert('上传失败: ' + error.message);
        if (progressBar) progressBar.style.width = '0%';
        if (percentText) percentText.textContent = '0%';
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<span>确认追加</span><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>';
        }
    }
}

function drawVersionConnections(versions) {
    const svg = document.getElementById('graph-svg');
    const container = document.getElementById('version-nodes');
    if (!svg || !container) return;

    const containerRect = container.getBoundingClientRect();
    const nodes = Array.from(container.querySelectorAll(':scope > div')).slice(0, -1);

    svg.setAttribute('width', container.scrollWidth);
    svg.setAttribute('height', containerRect.height);
    svg.innerHTML = '';

    if (nodes.length < 2) return;

    for (let i = 0; i < nodes.length - 1; i++) {
        const current = nodes[i];
        const next = nodes[i + 1];

        const currentRect = current.getBoundingClientRect();
        const nextRect = next.getBoundingClientRect();

        const x1 = currentRect.left - containerRect.left + currentRect.width / 2;
        const y1 = currentRect.top - containerRect.top + currentRect.height / 2;
        const x2 = nextRect.left - containerRect.left + nextRect.width / 2;
        const y2 = nextRect.top - containerRect.top + nextRect.height / 2;

        const isLastConnection = (i === nodes.length - 2);
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

function downloadVersion(versionId) {
    console.log('下载版本:', versionId);
    alert('下载功能开发中...\n版本ID: ' + versionId);
}

function useVersionForTraining(versionId) {
    window.location.href = `/training?dataset=${currentDatasetId}&version=${versionId}`;
}

function formatRelativeTime(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffSec < 60) return '刚刚';
    if (diffMin < 60) return `${diffMin} 分钟前`;
    if (diffHour < 24) return `${diffHour} 小时前`;
    if (diffDay < 30) return `${diffDay} 天前`;
    if (diffDay < 365) return `${Math.floor(diffDay / 30)} 个月前`;
    return `${Math.floor(diffDay / 365)} 年前`;
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

document.addEventListener('DOMContentLoaded', function() {
    fetchDatasets();

    const fileInput = document.getElementById('dataset-files');
    if (fileInput) {
        fileInput.addEventListener('change', handleDatasetFileSelect);
    }

    const preprocessScriptInput = document.getElementById('preprocess-script');
    if (preprocessScriptInput) {
        preprocessScriptInput.addEventListener('change', handlePreprocessScriptSelect);
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeDatasetImportModal();
            closeDatasetGraph();
            const preprocessPanel = document.getElementById('preprocess-upload-panel');
            if (preprocessPanel && !preprocessPanel.classList.contains('hidden')) {
                closePreprocessUploadPanel();
            }
        }
    });
});

window.addEventListener('resize', () => {
    const modal = document.getElementById('dataset-graph-modal');
    if (modal && !modal.classList.contains('hidden') && currentDatasetId) {
        clearTimeout(window.resizeTimer);
        window.resizeTimer = setTimeout(() => {
            const nodes = document.getElementById('version-nodes');
            if (nodes && nodes.children.length > 0) {
                const svg = document.getElementById('graph-svg');
                const container = document.getElementById('version-nodes');
                if (svg && container) {
                    const containerRect = container.getBoundingClientRect();
                    const versionNodes = Array.from(container.querySelectorAll(':scope > div')).slice(0, -1);

                    svg.setAttribute('width', container.scrollWidth);
                    svg.setAttribute('height', containerRect.height);
                    svg.innerHTML = '';

                    if (versionNodes.length < 2) return;

                    for (let i = 0; i < versionNodes.length - 1; i++) {
                        const current = versionNodes[i];
                        const next = versionNodes[i + 1];
                        const currentRect = current.getBoundingClientRect();
                        const nextRect = next.getBoundingClientRect();

                        const x1 = currentRect.left - containerRect.left + currentRect.width / 2;
                        const y1 = currentRect.top - containerRect.top + currentRect.height / 2;
                        const x2 = nextRect.left - containerRect.left + nextRect.width / 2;
                        const y2 = nextRect.top - containerRect.top + nextRect.height / 2;

                        const isLastConnection = (i === versionNodes.length - 2);
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