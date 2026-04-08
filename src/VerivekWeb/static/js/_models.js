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