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
    if (!container) return; // 不在数据集页面

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
    console.log('查看数据集详情:', datasetId);
    const modal = document.getElementById('dataset-detail-modal');
    if (modal) modal.classList.remove('hidden');
}

function closeDatasetDetail() {
    const modal = document.getElementById('dataset-detail-modal');
    if (modal) modal.classList.add('hidden');
}

// 页面初始化
document.addEventListener('DOMContentLoaded', function() {
    // 初始加载数据集列表
    fetchDatasets();

    // 绑定文件选择事件
    const fileInput = document.getElementById('dataset-files');
    if (fileInput) {
        fileInput.addEventListener('change', handleDatasetFileSelect);
    }

    // ESC 键关闭数据集模态框
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeDatasetImportModal();
        }
    });
});