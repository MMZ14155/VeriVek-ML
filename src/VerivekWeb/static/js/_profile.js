let profileChart = null;

const ROLE_MAP = {
    root: { label: '超级管理员', class: 'bg-rose-500/20 text-rose-400 border-rose-500/30' },
    admin: { label: '管理员', class: 'bg-red-500/20 text-red-400 border-red-500/30' },
    researcher: { label: '研究员', class: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30' },
    guest: { label: '访客', class: 'bg-gray-500/20 text-gray-400 border-gray-500/30' }
};

function formatDate(dateStr) {
    if (!dateStr) return '--';
    const d = new Date(dateStr);
    if (isNaN(d)) return dateStr;
    return d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

async function loadProfile() {
    try {
        const response = await fetch('/api/profile');
        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || '加载失败');
        }

        renderProfile(data.user);
        renderChart(data.user);
    } catch (err) {
        console.error('Error loading profile:', err);
        document.getElementById('profile-username').textContent = '加载失败';
    }
}

function renderProfile(user) {
    const roleInfo = ROLE_MAP[user.role] || ROLE_MAP.guest;
    const initials = user.username ? user.username.substring(0, 2).toUpperCase() : '??';
    const hue = (user.user_id * 137) % 360;
    const avatarStyle = `linear-gradient(135deg, hsl(${hue}, 70%, 60%), hsl(${hue + 40}, 70%, 50%))`;

    document.getElementById('profile-avatar').textContent = initials;
    document.getElementById('profile-avatar').style.background = avatarStyle;
    document.getElementById('profile-username').textContent = user.username;

    const roleEl = document.getElementById('profile-role');
    roleEl.textContent = roleInfo.label;
    roleEl.className = `px-2.5 py-0.5 text-xs rounded-full border ${roleInfo.class}`;

    document.getElementById('profile-joined').textContent = `加入于 ${formatDate(user.created_at)}`;
    document.getElementById('profile-total').textContent = user.total_contributions || 0;

    document.getElementById('stat-datasets').textContent = user.dataset_contributions;
    document.getElementById('stat-models').textContent = user.model_contributions;
    document.getElementById('stat-trainings').textContent = user.training_count;

    // 管理员或超级管理员显示用户管理区域
    if (user.role === 'admin' || user.role === 'root') {
        document.getElementById('admin-section').classList.remove('hidden');
        loadAdminUsers();
    }
}

function renderChart(user) {
    const ctx = document.getElementById('profile-chart').getContext('2d');

    if (profileChart) {
        profileChart.destroy();
    }

    profileChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['数据集版本', '模型提交', '训练任务'],
            datasets: [{
                data: [user.dataset_contributions, user.model_contributions, user.training_count],
                backgroundColor: [
                    'rgba(16, 185, 129, 0.8)',
                    'rgba(168, 85, 247, 0.8)',
                    'rgba(249, 115, 22, 0.8)'
                ],
                borderColor: [
                    'rgba(16, 185, 129, 1)',
                    'rgba(168, 85, 247, 1)',
                    'rgba(249, 115, 22, 1)'
                ],
                borderWidth: 2,
                hoverOffset: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '60%',
            plugins: {
                legend: {
                    position: 'right',
                    labels: {
                        color: '#9ca3af',
                        font: { size: 13 },
                        padding: 20,
                        usePointStyle: true
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(19, 19, 31, 0.95)',
                    titleColor: '#fff',
                    bodyColor: '#d1d5db',
                    borderColor: 'rgba(255,255,255,0.1)',
                    borderWidth: 1,
                    cornerRadius: 8,
                    callbacks: {
                        label: function(context) {
                            const label = context.label || '';
                            const value = context.parsed || 0;
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const pct = total > 0 ? Math.round((value / total) * 100) : 0;
                            return ` ${label}: ${value} (${pct}%)`;
                        }
                    }
                }
            }
        }
    });
}

// ==================== 管理员功能 ====================

async function loadAdminUsers() {
    try {
        const response = await fetch('/api/admin/users');
        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || '加载失败');
        }

        renderAdminUsers(data.users);
    } catch (err) {
        console.error('Error loading admin users:', err);
        document.getElementById('admin-users-table').innerHTML = `
            <tr>
                <td colspan="5" class="px-6 py-8 text-center text-gray-500">
                    <span class="text-sm">加载用户列表失败</span>
                </td>
            </tr>
        `;
    }
}

function renderAdminUsers(users) {
    const tbody = document.getElementById('admin-users-table');
    const currentUserId = null; // 后端会阻止删除自己

    if (users.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="px-6 py-8 text-center text-gray-500">
                    <span class="text-sm">暂无用户</span>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = users.map(user => {
        const roleInfo = ROLE_MAP[user.role] || ROLE_MAP.guest;
        return `
            <tr class="border-b border-white/5 hover:bg-white/5 transition-colors">
                <td class="px-6 py-4 text-sm text-gray-400 font-mono">${user.user_id}</td>
                <td class="px-6 py-4 font-medium">${escapeHtml(user.username)}</td>
                <td class="px-6 py-4">
                    <span class="px-2 py-0.5 text-xs rounded-full border ${roleInfo.class}">${roleInfo.label}</span>
                </td>
                <td class="px-6 py-4 text-sm text-gray-400">${formatDate(user.created_at)}</td>
                <td class="px-6 py-4 text-right">
                    <button onclick="deleteUser(${user.user_id}, '${escapeHtml(user.username)}')"
                            class="px-3 py-1.5 text-xs bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors border border-red-500/20">
                        注销
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

function openCreateUserModal() {
    document.getElementById('create-user-modal').classList.remove('hidden');
    document.getElementById('create-user-error').classList.add('hidden');
    document.getElementById('create-user-form').reset();
}

function closeCreateUserModal() {
    document.getElementById('create-user-modal').classList.add('hidden');
}

async function createUser() {
    const username = document.getElementById('new-username').value.trim();
    const password = document.getElementById('new-password').value;
    const role = document.getElementById('new-role').value;
    const errorEl = document.getElementById('create-user-error');

    if (!username || !password) {
        errorEl.textContent = '用户名和密码不能为空';
        errorEl.classList.remove('hidden');
        return;
    }

    if (password.length < 6) {
        errorEl.textContent = '密码长度至少6位';
        errorEl.classList.remove('hidden');
        return;
    }

    try {
        const response = await fetch('/api/admin/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, role })
        });
        const data = await response.json();

        if (!data.success) {
            errorEl.textContent = data.error || '创建失败';
            errorEl.classList.remove('hidden');
            return;
        }

        closeCreateUserModal();
        loadAdminUsers();
    } catch (err) {
        errorEl.textContent = '网络错误，请重试';
        errorEl.classList.remove('hidden');
    }
}

async function deleteUser(userId, username) {
    if (!confirm(`确定要注销用户 "${username}" 吗？此操作不可撤销。`)) {
        return;
    }

    try {
        const response = await fetch(`/api/admin/users/${userId}`, {
            method: 'DELETE'
        });
        const data = await response.json();

        if (!data.success) {
            alert(data.error || '注销失败');
            return;
        }

        loadAdminUsers();
    } catch (err) {
        alert('网络错误，请重试');
    }
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

document.addEventListener('DOMContentLoaded', () => {
    loadProfile();
});
