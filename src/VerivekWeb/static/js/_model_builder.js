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

let isPanning = false;
let panStart = { x: 0, y: 0, scrollLeft: 0, scrollTop: 0 };
let dragBounds = null;
const CANVAS_PADDING = 200;
const NODE_WIDTH = 180;
const NODE_HEIGHT = 80;

// 组件默认配置（仅用于前端初始化，后端有完整配置）
const COMPONENT_DEFAULTS = {
    'Conv2d': { in_channels: 3, out_channels: 64, kernel_size: 3, stride: 1, padding: 0, inputs: ['in'], outputs: ['out'] },
    'MaxPool2d': { kernel_size: 2, stride: 2, padding: 0, inputs: ['in'], outputs: ['out'] },
    'AvgPool2d': { kernel_size: 2, stride: 2, padding: 0, inputs: ['in'], outputs: ['out'] },
    'AdaptiveAvgPool2d': { output_size: [1, 1], inputs: ['in'], outputs: ['out'] },
    'Linear': { in_features: 512, out_features: 10, bias: true, inputs: ['in'], outputs: ['out'] },
    'Dropout': { p: 0.5, inputs: ['in'], outputs: ['out'] },
    'ReLU': { inplace: false, inputs: ['in'], outputs: ['out'] },
    'Sigmoid': { inputs: ['in'], outputs: ['out'] },
    'Tanh': { inputs: ['in'], outputs: ['out'] },
    'Softmax': { dim: 1, inputs: ['in'], outputs: ['out'] },
    'GELU': { inputs: ['in'], outputs: ['out'] },
    'LeakyReLU': { negative_slope: 0.01, inplace: false, inputs: ['in'], outputs: ['out'] },
    'BatchNorm2d': { num_features: 64, eps: 1e-05, momentum: 0.1, inputs: ['in'], outputs: ['out'] },
    'LayerNorm': { normalized_shape: [64], eps: 1e-05, elementwise_affine: true, inputs: ['in'], outputs: ['out'] },
    'Flatten': { start_dim: 1, end_dim: -1, inputs: ['in'], outputs: ['out'] },
    'View': { shape: [-1, 512], inputs: ['in'], outputs: ['out'] },
    'Embedding': { num_embeddings: 1000, embedding_dim: 128, inputs: ['in'], outputs: ['out'] },
    'LSTM': { hidden_size: 128, num_layers: 1, bias: true, batch_first: true, dropout: 0, bidirectional: false, inputs: ['in'], outputs: ['out'] },
    'GRU': { hidden_size: 128, num_layers: 1, bias: true, batch_first: true, dropout: 0, bidirectional: false, inputs: ['in'], outputs: ['out'] },
    'Add': { inputs: ['in1', 'in2'], outputs: ['out'] },
    'Concat': { dim: 1, inputs: ['in1', 'in2'], outputs: ['out'] },
    'Input': { shape: [1, 3, 224, 224], inputs: [], outputs: ['out'] },
    'Output': { name: 'output', inputs: ['in'], outputs: [] }
};

const COMPONENT_NAMES = {
    'Conv2d': '二维卷积', 'MaxPool2d': '最大池化', 'AvgPool2d': '平均池化', 'AdaptiveAvgPool2d': '自适应平均池化',
    'Linear': '全连接层', 'Dropout': '随机失活', 'ReLU': 'ReLU激活',
    'Sigmoid': 'Sigmoid激活', 'Tanh': 'Tanh激活', 'Softmax': 'Softmax归一化',
    'GELU': 'GELU激活', 'LeakyReLU': 'LeakyReLU激活',
    'BatchNorm2d': '批归一化', 'LayerNorm': '层归一化',
    'Flatten': '展平层', 'View': '维度变换',
    'Embedding': '词嵌入', 'LSTM': 'LSTM', 'GRU': 'GRU',
    'Add': '相加', 'Concat': '拼接',
    'Input': '输入层', 'Output': '输出层'
};

// ==================== 初始化 ====================
document.addEventListener('DOMContentLoaded', () => {
    initDragAndDrop();
    initCanvasEvents();
    initKeyboardShortcuts();
    updateStats();
    loadArchitectures();

    // 点击页面其他地方关闭架构下拉菜单
    document.addEventListener('click', (e) => {
        const dropdown = document.getElementById('arch-dropdown');
        if (dropdown && !dropdown.contains(e.target)) {
            document.getElementById('arch-menu')?.classList.add('hidden');
        }
    });
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
    updateCanvasBounds();

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
        dragBounds = getDragBounds();
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
    updateCanvasBounds();
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
    updateCanvasBounds();
}

// ==================== 画布交互 ====================
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
            const canvasContainer = document.getElementById('canvas-container');
            const rect = canvasContainer.getBoundingClientRect();
            tempConnection.x = e.clientX - rect.left + canvasContainer.scrollLeft;
            tempConnection.y = e.clientY - rect.top + canvasContainer.scrollTop;
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
    svg.innerHTML = '';

    connections.forEach(conn => {
        const fromNodeData = nodes.find(n => n.id === conn.from.nodeId);
        const toNodeData = nodes.find(n => n.id === conn.to.nodeId);
        if (!fromNodeData || !toNodeData) return;

        const fromPortIdx = fromNodeData.outputs.indexOf(conn.from.port);
        const toPortIdx = toNodeData.inputs.indexOf(conn.to.port);
        if (fromPortIdx === -1 || toPortIdx === -1) return;

        // 直接基于节点属性计算端口中心坐标（避免 getBoundingClientRect 受滚动影响）
        const x1 = fromNodeData.x + NODE_WIDTH + 6;
        const y1 = fromNodeData.y + 20 + fromPortIdx * 25 + 6;
        const x2 = toNodeData.x - 6;
        const y2 = toNodeData.y + 20 + toPortIdx * 25 + 6;

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
        const fromNodeData = nodes.find(n => n.id === tempConnection.from.nodeId);
        if (!fromNodeData) return;

        const fromPortIdx = fromNodeData.outputs.indexOf(tempConnection.from.port);
        if (fromPortIdx === -1) return;

        const x1 = fromNodeData.x + NODE_WIDTH + 6;
        const y1 = fromNodeData.y + 20 + fromPortIdx * 25 + 6;

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', `M ${x1} ${y1} L ${tempConnection.x} ${tempConnection.y}`);
        path.setAttribute('class', 'connection-line temp');
        svg.appendChild(path);
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
            // 显示详细的保存成功信息
            const paramsInfo = result.params ? `\n参数量: ${result.params.total_params}\n模型大小: ${result.params.model_size_mb} MB` : '';
            alert(`架构保存成功！\n\n模型名称: ${result.model_name}${paramsInfo}\n\n已自动保存为私有架构，可在"模型管理"中查看。`);
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

// ==================== 辅助功能 ====================
function updateCanvasBounds() {
    const container = document.getElementById('nodes-container');
    if (!container || nodes.length === 0) return;

    let maxX = 0;
    let maxY = 0;
    nodes.forEach(n => {
        maxX = Math.max(maxX, n.x + NODE_WIDTH + CANVAS_PADDING);
        maxY = Math.max(maxY, n.y + NODE_HEIGHT + CANVAS_PADDING);
    });

    const parent = container.parentElement;
    if (parent) {
        const minW = Math.max(parent.clientWidth, maxX);
        const minH = Math.max(parent.clientHeight, maxY);
        container.style.minWidth = `${minW}px`;
        container.style.minHeight = `${minH}px`;
        const svg = document.getElementById('connections-svg');
        if (svg) {
            svg.style.width = `${minW}px`;
            svg.style.height = `${minH}px`;
        }
    }
}

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
    // 架构变化时自动计算参数量
    debounceCalculateParams();
}

function updateArchitectureStats(stats) {
    // 可以在属性面板底部显示后端返回的统计信息
    console.log('架构统计:', stats);
}

// ==================== 参数量计算 ====================

let paramsDebounceTimer;

function debounceCalculateParams() {
    clearTimeout(paramsDebounceTimer);
    paramsDebounceTimer = setTimeout(() => calculateParams(), 800);
}

async function calculateParams() {
    // 检查是否有足够的节点
    if (nodes.length < 2) {
        updateParamsDisplay(null);
        return;
    }

    const statusEl = document.getElementById('params-status');
    if (statusEl) {
        statusEl.textContent = '计算中...';
        statusEl.className = 'text-xs text-yellow-500';
    }

    try {
        // 获取输入节点配置
        const inputNode = nodes.find(n => n.type === 'Input');
        let inputChannels = 3;
        let inputSize = [224, 224];

        if (inputNode && inputNode.properties) {
            const shape = inputNode.properties.shape || [1, 3, 224, 224];
            if (shape.length >= 3) {
                inputChannels = shape[1] || 3;
                inputSize = [shape[2] || 224, shape[3] || 224];
            }
        }

        const response = await fetch('/api/architecture/params', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                graph_structure: exportGraph(),
                input_channels: inputChannels,
                input_size: inputSize
            })
        });

        const data = await response.json();

        if (data.success) {
            updateParamsDisplay(data.params);
        } else {
            updateParamsDisplay(null, data.error || '计算失败');
        }
    } catch (err) {
        console.error('参数量计算错误:', err);
        updateParamsDisplay(null, '网络错误');
    }
}

function updateParamsDisplay(params, error) {
    const paramsEl = document.getElementById('stat-params');
    const sizeEl = document.getElementById('stat-model-size');
    const statusEl = document.getElementById('params-status');
    const layerListEl = document.getElementById('params-layer-list');

    if (error) {
        if (paramsEl) paramsEl.textContent = '-';
        if (sizeEl) sizeEl.textContent = '模型大小: -';
        if (statusEl) {
            statusEl.textContent = error;
            statusEl.className = 'text-xs text-red-500';
        }
        return;
    }

    if (!params || params.total_params === 0) {
        if (paramsEl) paramsEl.textContent = '-';
        if (sizeEl) sizeEl.textContent = '模型大小: -';
        if (statusEl) {
            statusEl.textContent = '无参数层';
            statusEl.className = 'text-xs text-gray-500';
        }
        if (layerListEl) layerListEl.innerHTML = '';
        return;
    }

    // 更新总参数量
    if (paramsEl) {
        paramsEl.textContent = params.total_params_formatted || formatParams(params.total_params);
    }

    // 更新模型大小
    if (sizeEl) {
        sizeEl.textContent = `模型大小: ${params.total_size_mb} MB (FP32) / ${params.total_size_mb_fp16} MB (FP16)`;
    }

    // 更新状态
    if (statusEl) {
        statusEl.textContent = `${params.layer_count} 个可训练层`;
        statusEl.className = 'text-xs text-emerald-500';
    }

    // 更新层详情列表
    if (layerListEl && params.layer_details) {
        layerListEl.innerHTML = params.layer_details.map(layer => `
            <div class="flex justify-between items-center p-1.5 bg-white/5 rounded hover:bg-white/10 transition-colors">
                <div class="flex items-center space-x-2">
                    <span class="text-indigo-400 font-medium">${layer.type}</span>
                    <span class="text-gray-600">#${layer.node_id}</span>
                </div>
                <div class="text-right">
                    <div class="text-gray-300">${formatParams(layer.params)}</div>
                </div>
            </div>
        `).join('');
    }
}

function formatParams(num) {
    if (num >= 1000000) {
        return (num / 1000000).toFixed(2) + 'M';
    } else if (num >= 1000) {
        return (num / 1000).toFixed(2) + 'K';
    }
    return num.toString();
}

function toggleParamsDetails() {
    const detailsEl = document.getElementById('params-details');
    const iconEl = document.getElementById('params-details-icon');
    const textEl = document.getElementById('params-details-text');

    if (detailsEl.classList.contains('hidden')) {
        detailsEl.classList.remove('hidden');
        iconEl.style.transform = 'rotate(90deg)';
        textEl.textContent = '收起详情';
    } else {
        detailsEl.classList.add('hidden');
        iconEl.style.transform = 'rotate(0deg)';
        textEl.textContent = '查看详情';
    }
}

function showValidationErrors(errors) {
    // 高亮显示错误节点或显示提示
    console.warn('架构验证错误:', errors);
}

function clearValidationErrors() {
    // 清除错误提示
}

// ==================== 架构加载 ====================
function toggleArchDropdown() {
    const menu = document.getElementById('arch-menu');
    if (menu) {
        menu.classList.toggle('hidden');
    }
}

async function loadArchitectures() {
    try {
        const response = await fetch('/api/architecture/list');
        const data = await response.json();
        const listEl = document.getElementById('arch-list');

        if (data.success && data.architectures && data.architectures.length > 0) {
            listEl.innerHTML = data.architectures.map(arch => `
                <button onclick="loadArchitecture('${arch.name}')"
                    class="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-white/10 hover:text-white transition-colors flex items-center space-x-2">
                    <svg class="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                            d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"/>
                    </svg>
                    <span>${arch.display_name}</span>
                </button>
            `).join('');
        } else {
            listEl.innerHTML = '<div class="px-4 py-2 text-xs text-gray-500">暂无架构</div>';
        }
    } catch (err) {
        console.error('加载架构列表失败:', err);
        const listEl = document.getElementById('arch-list');
        if (listEl) {
            listEl.innerHTML = '<div class="px-4 py-2 text-xs text-red-500">加载失败</div>';
        }
    }
}

async function loadArchitecture(name) {
    const menu = document.getElementById('arch-menu');
    if (menu) menu.classList.add('hidden');

    if (nodes.length > 0) {
        if (!confirm('加载架构将清空当前画布，是否继续？')) return;
    }

    try {
        const response = await fetch(`/api/architecture/load/${name}`);
        const data = await response.json();

        if (!data.success || !data.graph) {
            alert('加载失败: ' + (data.error || '未知错误'));
            return;
        }

        // 清空当前画布
        nodes = [];
        connections = [];
        selectedNodeId = null;
        document.getElementById('nodes-container').innerHTML = '';

        const graph = data.graph;

        // 重建节点
        let maxNodeId = 0;
        graph.nodes.forEach(nodeData => {
            const defaults = COMPONENT_DEFAULTS[nodeData.type] || { inputs: ['in'], outputs: ['out'] };
            const node = {
                id: nodeData.id,
                type: nodeData.type,
                x: nodeData.x,
                y: nodeData.y,
                properties: { ...(nodeData.properties || {}) },
                inputs: [...(defaults.inputs || [])],
                outputs: [...(defaults.outputs || [])]
            };
            nodes.push(node);
            renderNode(node);
            if (node.id > maxNodeId) maxNodeId = node.id;
        });
        nodeIdCounter = maxNodeId;

        // 重建连接
        let maxConnId = 0;
        graph.connections.forEach((connData, idx) => {
            connections.push({
                id: idx + 1,
                from: { ...connData.from },
                to: { ...connData.to }
            });
            maxConnId = idx + 1;
        });
        connectionIdCounter = maxConnId;

        drawConnections();
        updateStats();
        updatePropertiesPanel();
        updateCanvasBounds();
        debounceValidate();

        // 如果在代码模式，自动重新生成代码
        if (!document.getElementById('code-mode').classList.contains('hidden')) {
            debounceGenerate();
        }

    } catch (err) {
        console.error('加载经典架构失败:', err);
        alert('加载失败: ' + err.message);
    }
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
            closeAiSettings();
        }
    });
}

// ==================== AI 侧边栏 ====================
let aiSidebarExpanded = false;

function toggleAiSidebar() {
    aiSidebarExpanded = !aiSidebarExpanded;
    const sidebar = document.getElementById('ai-sidebar');
    const collapsed = document.getElementById('ai-sidebar-collapsed');
    const expanded = document.getElementById('ai-sidebar-expanded');

    if (!sidebar || !collapsed || !expanded) return;

    if (aiSidebarExpanded) {
        sidebar.style.width = '320px';
        collapsed.classList.add('hidden');
        expanded.classList.remove('hidden');
    } else {
        sidebar.style.width = '48px';
        collapsed.classList.remove('hidden');
        expanded.classList.add('hidden');
    }
}

function openAiSettings() {
    document.getElementById('ai-settings-modal').classList.remove('hidden');
    loadAiSettingsToForm();
}

function closeAiSettings() {
    document.getElementById('ai-settings-modal').classList.add('hidden');
}

function toggleApiKeyVisibility() {
    const input = document.getElementById('ai-api-key');
    const eye = document.getElementById('api-key-eye');
    if (!input || !eye) return;

    if (input.type === 'password') {
        input.type = 'text';
        eye.innerHTML = `
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/>
        `;
    } else {
        input.type = 'password';
        eye.innerHTML = `
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
        `;
    }
}

function saveAiSettings() {
    const apiKey = document.getElementById('ai-api-key').value.trim();
    const provider = document.getElementById('ai-provider').value;
    const customUrl = document.getElementById('ai-custom-url').value.trim();

    const settings = {
        apiKey: apiKey,
        provider: provider,
        customUrl: customUrl
    };

    try {
        localStorage.setItem('verivek_ai_settings', JSON.stringify(settings));
        updateAiStatus();
        closeAiSettings();
    } catch (e) {
        alert('保存失败：浏览器可能禁用了本地存储');
    }
}

function clearAiSettings() {
    if (!confirm('确定要清除所有 AI 助手配置吗？')) return;

    localStorage.removeItem('verivek_ai_settings');
    document.getElementById('ai-api-key').value = '';
    document.getElementById('ai-provider').value = 'openai';
    document.getElementById('ai-custom-url').value = '';
    document.getElementById('ai-custom-url-wrapper').classList.add('hidden');
    updateAiStatus();
    closeAiSettings();
}

function loadAiSettings() {
    try {
        const raw = localStorage.getItem('verivek_ai_settings');
        if (raw) {
            const settings = JSON.parse(raw);
            return settings || {};
        }
    } catch (e) {
        console.error('加载 AI 设置失败:', e);
    }
    return {};
}

function loadAiSettingsToForm() {
    const settings = loadAiSettings();
    const apiKeyInput = document.getElementById('ai-api-key');
    const providerSelect = document.getElementById('ai-provider');
    const customUrlInput = document.getElementById('ai-custom-url');
    const customUrlWrapper = document.getElementById('ai-custom-url-wrapper');

    if (apiKeyInput) apiKeyInput.value = settings.apiKey || '';
    if (providerSelect) providerSelect.value = settings.provider || 'openai';
    if (customUrlInput) customUrlInput.value = settings.customUrl || '';

    if (customUrlWrapper) {
        if (settings.provider === 'custom') {
            customUrlWrapper.classList.remove('hidden');
        } else {
            customUrlWrapper.classList.add('hidden');
        }
    }
}

function updateAiStatus() {
    const settings = loadAiSettings();
    const statusEl = document.getElementById('ai-api-status');
    const inputEl = document.getElementById('ai-chat-input');
    const sendBtn = inputEl?.parentElement?.querySelector('button');

    if (!statusEl) return;

    if (settings.apiKey) {
        statusEl.innerHTML = `
            <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            <span>已配置 (${getProviderLabel(settings.provider)})</span>
        `;
        if (inputEl) {
            inputEl.placeholder = '输入消息与 AI 对话...';
            inputEl.classList.remove('cursor-not-allowed');
        }
    } else {
        statusEl.innerHTML = `
            <span class="w-1.5 h-1.5 rounded-full bg-gray-600"></span>
            <span>未配置 API Key</span>
        `;
        if (inputEl) {
            inputEl.placeholder = '请先配置 API Key...';
            inputEl.classList.add('cursor-not-allowed');
        }
    }
}

function getProviderLabel(provider) {
    const labels = {
        openai: 'OpenAI',
        anthropic: 'Claude',
        google: 'Gemini',
        custom: '自定义'
    };
    return labels[provider] || provider;
}

// Provider 切换时显示/隐藏自定义 URL
document.addEventListener('DOMContentLoaded', () => {
    const providerSelect = document.getElementById('ai-provider');
    if (providerSelect) {
        providerSelect.addEventListener('change', (e) => {
            const wrapper = document.getElementById('ai-custom-url-wrapper');
            if (wrapper) {
                if (e.target.value === 'custom') {
                    wrapper.classList.remove('hidden');
                } else {
                    wrapper.classList.add('hidden');
                }
            }
        });
    }

    updateAiStatus();
});