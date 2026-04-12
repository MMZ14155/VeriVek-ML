/**
 * VeriVek 模型架构构建器 - 前端精简版
 * 代码生成逻辑已迁移至后端 ArchitectureGenerator
 */

// ==================== 全局状态 ====================
let nodes = [];
let connections = [];
let selectedNodeId = null;
let draggedNodeId = null;
let isDrawingConnection = false;
let tempConnection = null;
let canvasOffset = { x: 0, y: 0 };
let nodeIdCounter = 0;
let connectionIdCounter = 0;

// 组件默认配置（仅用于前端初始化，后端有完整配置）
const COMPONENT_DEFAULTS = {
    'Conv2d': { in_channels: 3, out_channels: 64, kernel_size: 3, stride: 1, padding: 0, inputs: ['in'], outputs: ['out'] },
    'MaxPool2d': { kernel_size: 2, stride: 2, padding: 0, inputs: ['in'], outputs: ['out'] },
    'AdaptiveAvgPool2d': { output_size: [1, 1], inputs: ['in'], outputs: ['out'] },
    'Linear': { in_features: 512, out_features: 10, bias: true, inputs: ['in'], outputs: ['out'] },
    'Dropout': { p: 0.5, inputs: ['in'], outputs: ['out'] },
    'ReLU': { inplace: false, inputs: ['in'], outputs: ['out'] },
    'Sigmoid': { inputs: ['in'], outputs: ['out'] },
    'Tanh': { inputs: ['in'], outputs: ['out'] },
    'Softmax': { dim: 1, inputs: ['in'], outputs: ['out'] },
    'BatchNorm2d': { num_features: 64, eps: 1e-05, momentum: 0.1, inputs: ['in'], outputs: ['out'] },
    'Flatten': { start_dim: 1, end_dim: -1, inputs: ['in'], outputs: ['out'] },
    'View': { shape: [-1, 512], inputs: ['in'], outputs: ['out'] },
    'Input': { shape: [1, 3, 224, 224], inputs: [], outputs: ['out'] },
    'Output': { name: 'output', inputs: ['in'], outputs: [] }
};

const COMPONENT_NAMES = {
    'Conv2d': '二维卷积', 'MaxPool2d': '最大池化', 'AdaptiveAvgPool2d': '自适应平均池化',
    'Linear': '全连接层', 'Dropout': '随机失活', 'ReLU': 'ReLU激活',
    'Sigmoid': 'Sigmoid激活', 'Tanh': 'Tanh激活', 'Softmax': 'Softmax归一化',
    'BatchNorm2d': '批归一化', 'Flatten': '展平层', 'View': '维度变换',
    'Input': '输入层', 'Output': '输出层'
};

// ==================== 初始化 ====================
document.addEventListener('DOMContentLoaded', () => {
    initDragAndDrop();
    initCanvasEvents();
    initKeyboardShortcuts();
    updateStats();
});

// ==================== 模式切换（调用后端生成代码） ====================
async function switchMode(mode) {
    const visualBtn = document.getElementById('mode-visual');
    const codeBtn = document.getElementById('mode-code');
    const visualPanel = document.getElementById('visual-mode');
    const codePanel = document.getElementById('code-mode');

    if (mode === 'visual') {
        visualBtn.classList.add('bg-indigo-600', 'text-white');
        visualBtn.classList.remove('text-gray-400');
        codeBtn.classList.remove('bg-indigo-600', 'text-white');
        codeBtn.classList.add('text-gray-400');
        visualPanel.classList.remove('hidden');
        codePanel.classList.add('hidden');
    } else {
        // 切换到代码模式时，调用后端生成
        await fetchGeneratedCode();

        codeBtn.classList.add('bg-indigo-600', 'text-white');
        codeBtn.classList.remove('text-gray-400');
        visualBtn.classList.remove('bg-indigo-600', 'text-white');
        visualBtn.classList.add('text-gray-400');
        codePanel.classList.remove('hidden');
        visualPanel.classList.add('hidden');
    }
}

// ==================== 后端 API 调用 ====================
async function fetchGeneratedCode() {
    const editor = document.getElementById('code-editor');
    const btn = document.getElementById('mode-code');

    // 显示加载状态
    const originalText = btn.innerHTML;
    btn.innerHTML = '<span class="animate-spin inline-block mr-2">⟳</span>生成中...';

    try {
        const response = await fetch('/api/architecture/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                graph_structure: exportGraph(),
                class_name: 'GeneratedModel'
            })
        });

        const data = await response.json();

        if (data.success) {
            editor.value = data.code;

            // 如果有统计信息，显示在控制台或UI中
            if (data.stats) {
                console.log('架构统计:', data.stats);
                updateArchitectureStats(data.stats);
            }
        } else {
            editor.value = `# 生成失败: ${data.error || '未知错误'}\n# 请检查图形结构是否有环或未连接的节点`;
        }
    } catch (error) {
        editor.value = `# 请求失败: ${error.message}\n# 请确保后端服务正常运行`;
    } finally {
        btn.innerHTML = originalText;
    }
}

async function validateGraph() {
    try {
        const response = await fetch('/api/architecture/validate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ graph_structure: exportGraph() })
        });

        const data = await response.json();

        if (!data.valid) {
            showValidationErrors(data.errors);
        } else {
            clearValidationErrors();
        }

        return data.valid;
    } catch (error) {
        console.error('验证失败:', error);
        return true; // 网络错误时不阻断操作
    }
}

// ==================== 拖拽系统 ====================
function initDragAndDrop() {
    const componentItems = document.querySelectorAll('.component-item');
    const canvas = document.getElementById('nodes-container');

    componentItems.forEach(item => {
        item.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('component-type', item.dataset.type);
        });
    });

    canvas.addEventListener('dragover', (e) => e.preventDefault());

    canvas.addEventListener('drop', (e) => {
        e.preventDefault();
        const type = e.dataTransfer.getData('component-type');
        if (type) {
            const rect = canvas.getBoundingClientRect();
            createNode(type,
                e.clientX - rect.left + canvas.scrollLeft,
                e.clientY - rect.top + canvas.scrollTop
            );
        }
    });
}

// ==================== 节点操作 ====================
function createNode(type, x, y) {
    const defaults = COMPONENT_DEFAULTS[type] || { inputs: ['in'], outputs: ['out'] };
    const node = {
        id: ++nodeIdCounter,
        type: type,
        x: x - 90,
        y: y - 30,
        properties: { ...defaults },
        inputs: [...(defaults.inputs || [])],
        outputs: [...(defaults.outputs || [])]
    };

    delete node.properties.inputs;
    delete node.properties.outputs;

    nodes.push(node);
    renderNode(node);
    updateStats();
    selectNode(node.id);

    // 自动验证
    debounceValidate();

    return node;
}

function renderNode(node) {
    const container = document.getElementById('nodes-container');
    const el = document.createElement('div');
    el.id = `node-${node.id}`;
    el.className = 'node-component';
    el.style.left = `${node.x}px`;
    el.style.top = `${node.y}px`;
    el.dataset.nodeId = node.id;

    const inputsHtml = node.inputs.map((name, idx) => `
        <div class="absolute node-port input" 
             style="left: -6px; top: ${20 + idx * 25}px;" 
             data-port="${name}" data-type="input">
        </div>
    `).join('');

    const outputsHtml = node.outputs.map((name, idx) => `
        <div class="absolute node-port output" 
             style="right: -6px; top: ${20 + idx * 25}px;" 
             data-port="${name}" data-type="output">
        </div>
    `).join('');

    el.innerHTML = `
        <div class="px-4 py-3 border-b border-white/10 flex items-center justify-between relative">
            <span class="text-xs font-bold text-gray-400">${node.type}</span>
            <button class="node-delete p-1 hover:bg-red-500/20 rounded transition-colors" 
                    onclick="deleteNode(${node.id}); event.stopPropagation();">
                <svg class="w-3 h-3 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                </svg>
            </button>
            ${inputsHtml}
            ${outputsHtml}
        </div>
        <div class="px-4 py-2">
            <div class="text-sm font-medium text-white">${COMPONENT_NAMES[node.type] || node.type}</div>
            <div class="text-xs text-gray-500 mt-1 truncate">${getNodeSummary(node)}</div>
        </div>
    `;

    el.addEventListener('mousedown', (e) => {
        if (e.target.classList.contains('node-port')) return;
        selectNode(node.id);
        draggedNodeId = node.id;
        const rect = el.getBoundingClientRect();
        canvasOffset = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    });

    el.querySelectorAll('.node-port').forEach(port => {
        port.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            startConnection(node.id, port.dataset.port, port.dataset.type, e);
        });
    });

    container.appendChild(el);
}

function getNodeSummary(node) {
    const props = [];
    const p = node.properties;
    if (p.in_channels !== undefined) props.push(`in:${p.in_channels}`);
    if (p.out_channels !== undefined) props.push(`out:${p.out_channels}`);
    if (p.out_features !== undefined) props.push(`${p.out_features}类`);
    if (p.kernel_size !== undefined) props.push(`k:${p.kernel_size}`);
    return props.join(', ') || '无配置';
}

function selectNode(nodeId) {
    if (selectedNodeId) {
        const oldEl = document.getElementById(`node-${selectedNodeId}`);
        if (oldEl) oldEl.classList.remove('selected');
    }

    selectedNodeId = nodeId;
    const el = document.getElementById(`node-${nodeId}`);
    if (el) el.classList.add('selected');

    updatePropertiesPanel();
}

function deleteNode(nodeId) {
    connections = connections.filter(c => c.from.nodeId !== nodeId && c.to.nodeId !== nodeId);
    nodes = nodes.filter(n => n.id !== nodeId);

    const el = document.getElementById(`node-${nodeId}`);
    if (el) el.remove();

    if (selectedNodeId === nodeId) {
        selectedNodeId = null;
        updatePropertiesPanel();
    }

    drawConnections();
    updateStats();
    debounceValidate();
}

function deleteSelected() {
    if (selectedNodeId) deleteNode(selectedNodeId);
}

function clearCanvas() {
    if (!confirm('确定要清空所有节点和连接吗？')) return;

    nodes = [];
    connections = [];
    selectedNodeId = null;
    document.getElementById('nodes-container').innerHTML = '';
    drawConnections();
    updateStats();
    updatePropertiesPanel();
}

// ==================== 画布交互（保持不变） ====================
function initCanvasEvents() {
    const container = document.getElementById('nodes-container');
    const svg = document.getElementById('connections-svg');

    document.addEventListener('mousemove', (e) => {
        if (draggedNodeId) {
            const node = nodes.find(n => n.id === draggedNodeId);
            if (node) {
                const rect = container.getBoundingClientRect();
                node.x = e.clientX - rect.left - canvasOffset.x + container.scrollLeft;
                node.y = e.clientY - rect.top - canvasOffset.y + container.scrollTop;

                const el = document.getElementById(`node-${node.id}`);
                if (el) {
                    el.style.left = `${node.x}px`;
                    el.style.top = `${node.y}px`;
                }
                drawConnections();
            }
        }

        if (isDrawingConnection && tempConnection) {
            const rect = svg.getBoundingClientRect();
            tempConnection.x = e.clientX - rect.left + container.scrollLeft;
            tempConnection.y = e.clientY - rect.top + container.scrollTop;
            drawConnections();
        }
    });

    document.addEventListener('mouseup', () => {
        // 延迟执行以保证 startConnection 附加的 mouseup 处理器先运行，
        // 否则全局处理器会在专用处理器之前清除临时连接导致连线消失。
        setTimeout(() => {
            if (isDrawingConnection && tempConnection) {
                isDrawingConnection = false;
                tempConnection = null;
                drawConnections();
            }
            draggedNodeId = null;
        }, 0);
    });

    container.addEventListener('mousedown', (e) => {
        if (e.target === container) {
            selectedNodeId = null;
            document.querySelectorAll('.node-component.selected').forEach(el => el.classList.remove('selected'));
            updatePropertiesPanel();
        }
    });
}

function startConnection(nodeId, portName, portType, e) {
    isDrawingConnection = true;
    tempConnection = {
        from: { nodeId, port: portName },
        portType: portType,
        x: e.clientX,
        y: e.clientY
    };

    const handleMouseUp = (e) => {
        document.removeEventListener('mouseup', handleMouseUp);

        const target = e.target;
        if (target.classList.contains('node-port')) {
            const targetNodeId = parseInt(target.closest('.node-component').dataset.nodeId);
            const targetPort = target.dataset.port;
            const targetType = target.dataset.type;

            if (tempConnection.portType !== targetType) {
                let from, to;
                if (tempConnection.portType === 'output') {
                    from = tempConnection.from;
                    to = { nodeId: targetNodeId, port: targetPort };
                } else {
                    from = { nodeId: targetNodeId, port: targetPort };
                    to = tempConnection.from;
                }

                const exists = connections.some(c =>
                    c.from.nodeId === from.nodeId && c.from.port === from.port &&
                    c.to.nodeId === to.nodeId && c.to.port === to.port
                );

                if (!exists && from.nodeId !== to.nodeId) {
                    connections.push({ id: ++connectionIdCounter, from, to });
                    drawConnections();
                    updateStats();
                    debounceValidate();
                }
            }
        }

        isDrawingConnection = false;
        tempConnection = null;
        drawConnections();
    };

    document.addEventListener('mouseup', handleMouseUp);
}

function drawConnections() {
    const svg = document.getElementById('connections-svg');
    const container = document.getElementById('nodes-container');
    svg.innerHTML = '';

    connections.forEach(conn => {
        const fromNode = document.getElementById(`node-${conn.from.nodeId}`);
        const toNode = document.getElementById(`node-${conn.to.nodeId}`);
        if (!fromNode || !toNode) return;

        const fromPort = fromNode.querySelector(`[data-port="${conn.from.port}"]`);
        const toPort = toNode.querySelector(`[data-port="${conn.to.port}"]`);
        if (!fromPort || !toPort) return;

        const fromRect = fromPort.getBoundingClientRect();
        const toRect = toPort.getBoundingClientRect();
        const svgRect = svg.getBoundingClientRect();

        const x1 = fromRect.left + fromRect.width / 2 - svgRect.left + container.scrollLeft;
        const y1 = fromRect.top + fromRect.height / 2 - svgRect.top + container.scrollTop;
        const x2 = toRect.left + toRect.width / 2 - svgRect.left + container.scrollLeft;
        const y2 = toRect.top + toRect.height / 2 - svgRect.top + container.scrollTop;

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const controlOffset = Math.abs(x2 - x1) / 2;
        path.setAttribute('d', `M ${x1} ${y1} C ${x1 + controlOffset} ${y1}, ${x2 - controlOffset} ${y2}, ${x2} ${y2}`);
        path.setAttribute('class', 'connection-line');
        path.addEventListener('click', () => {
            connections = connections.filter(c => c.id !== conn.id);
            drawConnections();
            updateStats();
            debounceValidate();
        });

        svg.appendChild(path);
    });

    if (isDrawingConnection && tempConnection) {
        const fromNode = document.getElementById(`node-${tempConnection.from.nodeId}`);
        const fromPort = fromNode?.querySelector(`[data-port="${tempConnection.from.port}"]`);

        if (fromPort) {
            const fromRect = fromPort.getBoundingClientRect();
            const svgRect = svg.getBoundingClientRect();
            const x1 = fromRect.left + fromRect.width / 2 - svgRect.left + container.scrollLeft;
            const y1 = fromRect.top + fromRect.height / 2 - svgRect.top + container.scrollTop;

            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', `M ${x1} ${y1} L ${tempConnection.x} ${tempConnection.y}`);
            path.setAttribute('class', 'connection-line temp');
            svg.appendChild(path);
        }
    }
}

// ==================== 属性面板 ====================
function updatePropertiesPanel() {
    const panel = document.getElementById('properties-panel');
    const info = document.getElementById('selected-node-info');

    if (!selectedNodeId) {
        info.textContent = '未选择组件';
        panel.innerHTML = `
            <div class="text-center text-gray-500 mt-8">
                <svg class="w-12 h-12 mx-auto mb-2 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                </svg>
                <p class="text-sm">选择一个组件以编辑属性</p>
            </div>`;
        return;
    }

    const node = nodes.find(n => n.id === selectedNodeId);
    if (!node) return;

    info.textContent = `${COMPONENT_NAMES[node.type]} (ID: ${node.id})`;

    let html = `<div class="space-y-3">
        <div class="bg-white/5 rounded-lg p-3">
            <div class="text-xs text-gray-500 mb-1">组件类型</div>
            <div class="text-sm font-medium text-white">${node.type}</div>
        </div>`;

    Object.entries(node.properties).forEach(([key, value]) => {
        if (key === 'inputs' || key === 'outputs') return;
        html += createPropertyInput(key, value);
    });

    html += '</div>';
    panel.innerHTML = html;

    panel.querySelectorAll('input').forEach(input => {
        input.addEventListener('change', (e) => {
            const key = e.target.dataset.key;
            let val = e.target.type === 'checkbox' ? e.target.checked :
                      e.target.type === 'number' ? parseFloat(e.target.value) : e.target.value;

            if (e.target.dataset.type === 'array') {
                try { val = JSON.parse(val); } catch(e) { return; }
            }

            node.properties[key] = val;

            const el = document.getElementById(`node-${node.id}`);
            const summary = el.querySelector('.text-xs.text-gray-500');
            if (summary) summary.textContent = getNodeSummary(node);

            // 属性改变时触发代码重新生成（如果在代码模式）
            if (!document.getElementById('code-mode').classList.contains('hidden')) {
                debounceGenerate();
            }
        });
    });
}

function createPropertyInput(key, value) {
    const label = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    let input = '';

    if (typeof value === 'boolean') {
        input = `<label class="flex items-center space-x-2 cursor-pointer">
            <input type="checkbox" data-key="${key}" ${value ? 'checked' : ''} 
                   class="rounded bg-white/10 border-white/20 text-indigo-500">
            <span class="text-sm text-gray-300">${label}</span>
        </label>`;
    } else if (Array.isArray(value)) {
        input = `<input type="text" data-key="${key}" data-type="array" value='${JSON.stringify(value)}'
            class="w-full prop-input rounded-lg px-3 py-2 text-sm text-white">`;
    } else {
        input = `<input type="${typeof value === 'number' ? 'number' : 'text'}" data-key="${key}" value="${value}"
            class="w-full prop-input rounded-lg px-3 py-2 text-sm text-white">`;
    }

    return `<div><label class="block text-xs text-gray-400 mb-1">${label}</label>${input}</div>`;
}

// ==================== 导出与保存（调用后端） ====================
function exportGraph() {
    return {
        nodes: nodes.map(n => ({
            id: n.id,
            type: n.type,
            x: n.x,
            y: n.y,
            properties: n.properties
        })),
        connections: connections.map(c => ({
            from: c.from,
            to: c.to
        }))
    };
}

async function exportCode() {
    await fetchGeneratedCode();
    const code = document.getElementById('code-editor').value;
    document.getElementById('export-code-display').textContent = code;
    document.getElementById('export-modal').classList.remove('hidden');
}

function closeExportModal() {
    document.getElementById('export-modal').classList.add('hidden');
}

function copyExportCode() {
    const code = document.getElementById('code-editor').value;
    navigator.clipboard.writeText(code).then(() => alert('代码已复制'));
}

function downloadCode() {
    const code = document.getElementById('code-editor').value;
    const blob = new Blob([code], { type: 'text/x-python' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'model.py';
    a.click();
    URL.revokeObjectURL(url);
}

function saveArchitecture() {
    document.getElementById('save-modal').classList.remove('hidden');
}

function closeSaveModal() {
    document.getElementById('save-modal').classList.add('hidden');
}

async function confirmSave() {
    const name = document.getElementById('arch-name').value.trim();
    if (!name) return alert('请输入架构名称');

    try {
        const response = await fetch('/api/architecture/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                architecture_name: name,
                description: document.getElementById('arch-description').value.trim(),
                tags: document.getElementById('arch-tags').value.trim(),
                graph_structure: exportGraph(),
                generated_code: document.getElementById('code-editor').value
            })
        });

        const result = await response.json();
        if (result.success) {
            alert('架构保存成功！');
            closeSaveModal();
        } else {
            alert('保存失败: ' + result.error);
        }
    } catch (error) {
        alert('保存请求失败: ' + error.message);
    }
}

// ==================== 代码编辑器功能 ====================
function formatCode() {
    // 简单格式化，复杂格式化建议后端实现
    const editor = document.getElementById('code-editor');
    const lines = editor.value.split('\n');
    let indent = 0;

    const formatted = lines.map(line => {
        const trimmed = line.trim();
        if (trimmed.endsWith(':')) indent++;
        if (trimmed === '' || trimmed.startsWith('#')) return trimmed;

        const currentIndent = Math.max(0, indent - (trimmed.startsWith('return') ? 1 : 0));
        if (trimmed.startsWith('return')) indent = Math.max(0, indent - 1);

        return '    '.repeat(currentIndent) + trimmed;
    });

    editor.value = formatted.join('\n');
}

function copyCode() {
    const code = document.getElementById('code-editor').value;
    navigator.clipboard.writeText(code).then(() => {
        const btn = event.target;
        const original = btn.textContent;
        btn.textContent = '已复制!';
        setTimeout(() => btn.textContent = original, 2000);
    });
}

function insertTemplate(template) {
    const templates = {
        'cnn': `import torch\nimport torch.nn as nn\n\nclass CNN(nn.Module):\n    def __init__(self, num_classes=10):\n        super(CNN, self).__init__()\n        self.features = nn.Sequential(\n            nn.Conv2d(3, 64, 3, padding=1),\n            nn.ReLU(inplace=True),\n            nn.MaxPool2d(2),\n            nn.Conv2d(64, 128, 3, padding=1),\n            nn.ReLU(inplace=True),\n            nn.MaxPool2d(2),\n        )\n        self.classifier = nn.Sequential(\n            nn.Linear(128 * 8 * 8, 256),\n            nn.ReLU(inplace=True),\n            nn.Dropout(0.5),\n            nn.Linear(256, num_classes)\n        )\n    def forward(self, x):\n        x = self.features(x)\n        x = x.view(x.size(0), -1)\n        x = self.classifier(x)\n        return x`,

        'mlp': `import torch\nimport torch.nn as nn\n\nclass MLP(nn.Module):\n    def __init__(self, input_size=784, hidden=[256, 128], num_classes=10):\n        super(MLP, self).__init__()\n        layers = []\n        prev = input_size\n        for h in hidden:\n            layers.extend([nn.Linear(prev, h), nn.ReLU(), nn.Dropout(0.2)])\n            prev = h\n        layers.append(nn.Linear(prev, num_classes))\n        self.network = nn.Sequential(*layers)\n    def forward(self, x):\n        return self.network(x.view(x.size(0), -1))`,

        'resblock': `import torch\nimport torch.nn as nn\n\nclass ResBlock(nn.Module):\n    def __init__(self, channels):\n        super(ResBlock, self).__init__()\n        self.conv1 = nn.Conv2d(channels, channels, 3, padding=1)\n        self.bn1 = nn.BatchNorm2d(channels)\n        self.conv2 = nn.Conv2d(channels, channels, 3, padding=1)\n        self.bn2 = nn.BatchNorm2d(channels)\n    def forward(self, x):\n        identity = x\n        out = F.relu(self.bn1(self.conv1(x)))\n        out = self.bn2(self.conv2(out))\n        out += identity\n        return F.relu(out)`,

        'lstm': `import torch\nimport torch.nn as nn\n\nclass LSTMClassifier(nn.Module):\n    def __init__(self, input_size=10, hidden_size=128, num_layers=2, num_classes=5):\n        super(LSTMClassifier, self).__init__()\n        self.lstm = nn.LSTM(input_size, hidden_size, num_layers, \n                           batch_first=True, dropout=0.3, bidirectional=True)\n        self.fc = nn.Linear(hidden_size * 2, num_classes)\n    def forward(self, x):\n        lstm_out, _ = self.lstm(x)\n        return self.fc(lstm_out[:, -1, :])`
    };

    document.getElementById('code-editor').value = templates[template] || '';
}

// ==================== 辅助功能 ====================
function autoLayout() {
    // 简单的网格布局
    const levels = {};
    const queue = [];

    nodes.forEach(n => {
        const hasInput = connections.some(c => c.to.nodeId === n.id);
        if (!hasInput || n.type === 'Input') {
            levels[n.id] = 0;
            queue.push(n.id);
        }
    });

    while (queue.length) {
        const nodeId = queue.shift();
        connections.filter(c => c.from.nodeId === nodeId).forEach(c => {
            if (!levels[c.to.nodeId] || levels[c.to.nodeId] < levels[nodeId] + 1) {
                levels[c.to.nodeId] = levels[nodeId] + 1;
                queue.push(c.to.nodeId);
            }
        });
    }

    const levelGroups = {};
    Object.entries(levels).forEach(([id, level]) => {
        if (!levelGroups[level]) levelGroups[level] = [];
        levelGroups[level].push(parseInt(id));
    });

    Object.entries(levelGroups).forEach(([level, ids]) => {
        ids.forEach((id, idx) => {
            const node = nodes.find(n => n.id === id);
            if (node) {
                node.x = 100 + level * 220;
                node.y = 100 + idx * 120;
                const el = document.getElementById(`node-${id}`);
                if (el) {
                    el.style.left = `${node.x}px`;
                    el.style.top = `${node.y}px`;
                }
            }
        });
    });

    drawConnections();
}

function updateStats() {
    document.getElementById('stat-nodes').textContent = nodes.length;
    document.getElementById('stat-connections').textContent = connections.length;
}

function updateArchitectureStats(stats) {
    // 可以在属性面板底部显示后端返回的统计信息
    console.log('架构统计:', stats);
}

function showValidationErrors(errors) {
    // 高亮显示错误节点或显示提示
    console.warn('架构验证错误:', errors);
}

function clearValidationErrors() {
    // 清除错误提示
}

// 防抖函数，避免频繁请求后端
let debounceTimer;
function debounceValidate() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => validateGraph(), 1000);
}

function debounceGenerate() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => fetchGeneratedCode(), 500);
}

function initKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        if ((e.key === 'Delete' || e.key === 'Backspace') &&
            selectedNodeId &&
            document.activeElement.tagName !== 'INPUT' &&
            document.activeElement.tagName !== 'TEXTAREA') {
            deleteNode(selectedNodeId);
        }

        if (e.key === 'Escape') {
            selectedNodeId = null;
            document.querySelectorAll('.node-component.selected').forEach(el => el.classList.remove('selected'));
            updatePropertiesPanel();
            closeExportModal();
            closeSaveModal();
        }
    });
}