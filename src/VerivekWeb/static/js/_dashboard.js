document.addEventListener('DOMContentLoaded', function() {
    // 初始化训练趋势图表
    const chartCanvas = document.getElementById('trainingChart');
    if (!chartCanvas) return;

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
});