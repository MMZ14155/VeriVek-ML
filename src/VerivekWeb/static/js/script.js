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

// GPU 信息更新函数（全局通用）
function fetchGPUInfo() {
    fetch('/api/gpu')
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                console.error('GPU info error:', data.error);
                const gpuText = document.getElementById('gpu-memory-text');
                const gpuBar = document.getElementById('gpu-memory-bar');
                if (gpuText) gpuText.innerText = '无法获取';
                if (gpuBar) gpuBar.style.width = '0%';
                return;
            }

            // 更新显示文本 (单位转换 GB)
            const totalGB = (data.total_memory_mb / 1024).toFixed(1);
            const usedGB = (data.used_memory_mb / 1024).toFixed(1);

            const gpuText = document.getElementById('gpu-memory-text');
            if (gpuText) {
                gpuText.innerText = `${usedGB} / ${totalGB} GB`;
            }

            // 更新进度条宽度
            const percent = data.usage_percent;
            const gpuBar = document.getElementById('gpu-memory-bar');
            if (gpuBar) {
                gpuBar.style.width = `${percent}%`;
            }

            // 更新仪表板GPU显示（如果存在）
            const dashboardGpu = document.getElementById('dashboard-gpu-percent');
            if (dashboardGpu) {
                dashboardGpu.textContent = Math.round(percent) + '%';
            }

            const dashboardVram = document.getElementById('dashboard-vram-text');
            if (dashboardVram) {
                dashboardVram.innerHTML = `${usedGB}<span class="text-lg text-gray-500">/${totalGB} GB</span>`;
            }
        })
        .catch(err => {
            console.error('Fetch error:', err);
            const gpuText = document.getElementById('gpu-memory-text');
            const gpuBar = document.getElementById('gpu-memory-bar');
            if (gpuText) gpuText.innerText = '连接失败';
            if (gpuBar) gpuBar.style.width = '0%';
        });
}

// 通用工具函数（被多个页面使用）
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// 页面加载后初始化 GPU 监控
document.addEventListener('DOMContentLoaded', () => {
    fetchGPUInfo();
    setInterval(fetchGPUInfo, 2000);
});