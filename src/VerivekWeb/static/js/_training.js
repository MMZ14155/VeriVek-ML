function startTraining() {
    const btn = event.target.closest('button');
    if (!btn) return;

    const originalContent = btn.innerHTML;

    btn.innerHTML = '<svg class="animate-spin w-6 h-6 mr-2" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg><span>启动中...</span>';
    btn.disabled = true;

    setTimeout(() => {
        btn.innerHTML = '<svg class="w-6 h-6 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg><span>已启动</span>';
        btn.classList.remove('from-indigo-600', 'to-purple-600');
        btn.classList.add('from-emerald-600', 'to-emerald-500');

        // 显示训练徽章（侧边栏）
        const badge = document.getElementById('training-badge');
        if (badge) badge.classList.remove('hidden');

        // 2秒后返回仪表板
        setTimeout(() => {
            window.location.href = "/dashboard";
        }, 1500);
    }, 2000);
}