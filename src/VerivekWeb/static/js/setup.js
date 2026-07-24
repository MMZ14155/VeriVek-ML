(function () {
    'use strict';

    let currentStep = 1;
    const totalSteps = 3;
    let currentMode = 'multi_user';

    // DOM 元素
    const sections = {
        1: document.getElementById('section1'),
        2: document.getElementById('section2'),
        3: document.getElementById('section3')
    };
    const dots = {
        1: document.getElementById('stepDot1'),
        2: document.getElementById('stepDot2'),
        3: document.getElementById('stepDot3')
    };
    const labels = {
        1: document.getElementById('stepLabel1'),
        2: document.getElementById('stepLabel2'),
        3: document.getElementById('stepLabel3')
    };

    const globalError = document.getElementById('globalError');
    const setupStatus = document.getElementById('setupStatus');
    const statusText = document.getElementById('statusText');
    const statusIcon = document.getElementById('statusIcon');

    // 输入元素
    const inputs = {
        dbHost: document.getElementById('dbHost'),
        dbPort: document.getElementById('dbPort'),
        dbName: document.getElementById('dbName'),
        dbUser: document.getElementById('dbUser'),
        dbPassword: document.getElementById('dbPassword'),
        adminUsername: document.getElementById('adminUsername'),
        adminPassword: document.getElementById('adminPassword'),
        adminPasswordConfirm: document.getElementById('adminPasswordConfirm')
    };

    // 步骤切换
    function showStep(step) {
        if (step < 1 || step > totalSteps) return;
        currentStep = step;

        for (let i = 1; i <= totalSteps; i++) {
            sections[i].classList.remove('active');
            dots[i].classList.remove('active', 'completed');
            labels[i].classList.remove('active');
            dots[i].textContent = i;
        }

        sections[step].classList.add('active');

        for (let i = 1; i < step; i++) {
            dots[i].classList.add('completed');
            dots[i].innerHTML = '✓';
            labels[i].classList.add('active');
        }

        dots[step].classList.add('active');
        labels[step].classList.add('active');

        document.getElementById('stepLineProgress').style.width = ((step - 1) / (totalSteps - 1) * 100) + '%';
    }

    // 显示/隐藏错误
    function showError(elementId, show) {
        const el = document.getElementById(elementId);
        if (el) el.classList.toggle('show', show);
    }

    function showGlobalError(message) {
        globalError.textContent = message;
        globalError.classList.add('show');
    }

    function hideGlobalError() {
        globalError.classList.remove('show');
    }

    function setStatus(success, message) {
        setupStatus.classList.remove('success');
        statusText.classList.remove('text-emerald-400', 'text-red-400');
        statusIcon.classList.remove('text-emerald-400', 'text-red-400');

        if (success) {
            setupStatus.classList.add('success');
            statusText.classList.add('text-emerald-400');
            statusIcon.classList.add('text-emerald-400');
            statusIcon.innerHTML = `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>`;
        } else {
            statusText.classList.add('text-red-400');
            statusIcon.classList.add('text-red-400');
            statusIcon.innerHTML = `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>`;
        }
        statusText.textContent = message;
    }

    // 验证步骤 1
    function validateStep1() {
        let valid = true;

        const host = inputs.dbHost.value.trim();
        if (!host) {
            inputs.dbHost.classList.add('error');
            showError('dbHostError', true);
            valid = false;
        } else {
            inputs.dbHost.classList.remove('error');
            showError('dbHostError', false);
        }

        const port = inputs.dbPort.value.trim();
        if (!port || isNaN(port) || parseInt(port) <= 0 || parseInt(port) > 65535) {
            inputs.dbPort.classList.add('error');
            showError('dbPortError', true);
            valid = false;
        } else {
            inputs.dbPort.classList.remove('error');
            showError('dbPortError', false);
        }

        const dbName = inputs.dbName.value.trim();
        if (!dbName) {
            inputs.dbName.classList.add('error');
            showError('dbNameError', true);
            valid = false;
        } else {
            inputs.dbName.classList.remove('error');
            showError('dbNameError', false);
        }

        const user = inputs.dbUser.value.trim();
        if (!user) {
            inputs.dbUser.classList.add('error');
            showError('dbUserError', true);
            valid = false;
        } else {
            inputs.dbUser.classList.remove('error');
            showError('dbUserError', false);
        }

        if (!inputs.dbPassword.value) {
            inputs.dbPassword.classList.add('error');
            showError('dbPasswordError', true);
            valid = false;
        } else {
            inputs.dbPassword.classList.remove('error');
            showError('dbPasswordError', false);
        }

        return valid;
    }

    // 验证步骤 2
    function validateStep2() {
        let valid = true;

        const username = inputs.adminUsername.value.trim();
        if (username.length < 3) {
            inputs.adminUsername.classList.add('error');
            showError('adminUsernameError', true);
            valid = false;
        } else {
            inputs.adminUsername.classList.remove('error');
            showError('adminUsernameError', false);
        }

        const password = inputs.adminPassword.value;
        if (password.length < 6) {
            inputs.adminPassword.classList.add('error');
            showError('adminPasswordError', true);
            valid = false;
        } else {
            inputs.adminPassword.classList.remove('error');
            showError('adminPasswordError', false);
        }

        const confirm = inputs.adminPasswordConfirm.value;
        if (confirm !== password || !confirm) {
            inputs.adminPasswordConfirm.classList.add('error');
            showError('adminPasswordConfirmError', true);
            valid = false;
        } else {
            inputs.adminPasswordConfirm.classList.remove('error');
            showError('adminPasswordConfirmError', false);
        }

        return valid;
    }

    // 清除错误样式
    Object.values(inputs).forEach(input => {
        if (!input) return;
        input.addEventListener('input', function () {
            this.classList.remove('error', 'success');
            const errorId = this.id + 'Error';
            showError(errorId, false);
        });
    });

    // 测试数据库连接
    async function testDbConnection() {
        if (!validateStep1()) return;

        const testBtn = document.getElementById('testDbBtn');
        const testText = document.getElementById('testDbText');
        const loader = document.getElementById('testDbLoader');

        testBtn.disabled = true;
        testText.classList.add('hidden');
        loader.classList.remove('hidden');
        hideGlobalError();

        try {
            const res = await fetch('/api/setup/test-db', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    database: getDbConfig()
                })
            });

            const data = await res.json();
            if (data.success) {
                ['dbHost', 'dbPort', 'dbName', 'dbUser', 'dbPassword'].forEach(id => {
                    inputs[id].classList.remove('error');
                    inputs[id].classList.add('success');
                });
                setStatus(true, '数据库连接测试成功');
            } else {
                setStatus(false, data.error || '数据库连接失败');
                showGlobalError(data.error || '数据库连接失败');
            }
        } catch (err) {
            setStatus(false, '请求失败：' + err.message);
            showGlobalError('请求失败：' + err.message);
        } finally {
            testBtn.disabled = false;
            testText.classList.remove('hidden');
            loader.classList.add('hidden');
        }
    }

    document.getElementById('testDbBtn').addEventListener('click', testDbConnection);

    // 收集数据库配置
    function getDbConfig() {
        const port = parseInt(inputs.dbPort.value.trim(), 10);
        return {
            host: inputs.dbHost.value.trim(),
            port: isNaN(port) ? 5432 : port,
            dbname: inputs.dbName.value.trim(),
            user: inputs.dbUser.value.trim(),
            password: inputs.dbPassword.value,
            service_name: '',
            start_command: ''
        };
    }

    // 下一步
    document.getElementById('toStep2').addEventListener('click', function () {
        if (validateStep1()) {
            hideGlobalError();
            showStep(2);
        }
    });

    document.getElementById('backToStep1').addEventListener('click', function () {
        hideGlobalError();
        showStep(1);
    });

    // 完成配置
    document.getElementById('finishBtn').addEventListener('click', async function () {
        if (!validateStep2()) return;

        const finishBtn = document.getElementById('finishBtn');
        const finishText = document.getElementById('finishBtnText');
        const loader = document.getElementById('finishBtnLoader');

        finishBtn.disabled = true;
        finishText.classList.add('hidden');
        loader.classList.remove('hidden');
        hideGlobalError();
        setStatus(false, '正在初始化，请稍候...');

        try {
            const res = await fetch('/api/setup/finish', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    database: getDbConfig(),
                    admin: {
                        username: inputs.adminUsername.value.trim(),
                        password: inputs.adminPassword.value,
                        mode: currentMode,
                        role: 'root'
                    }
                })
            });

            const data = await res.json();
            if (data.success) {
                setStatus(true, data.message || '配置完成');
                showStep(3);
            } else {
                setStatus(false, data.error || '配置失败');
                showGlobalError(data.error || '配置失败');
                finishBtn.disabled = false;
                finishText.classList.remove('hidden');
                loader.classList.add('hidden');
            }
        } catch (err) {
            setStatus(false, '请求失败：' + err.message);
            showGlobalError('请求失败：' + err.message);
            finishBtn.disabled = false;
            finishText.classList.remove('hidden');
            loader.classList.add('hidden');
        }
    });

    // 初始化
    showStep(1);

    // 运行模式选择
    const modeCards = {
        multi_user: document.getElementById('modeMulti'),
        single_user: document.getElementById('modeSingle')
    };

    function selectMode(mode) {
        currentMode = mode;
        const singleUserNotice = document.getElementById('singleUserNotice');
        if (singleUserNotice) {
            singleUserNotice.classList.toggle('hidden', mode !== 'single_user');
        }
        Object.keys(modeCards).forEach(key => {
            const card = modeCards[key];
            if (!card) return;
            const dot = card.querySelector('.mode-dot');
            const circle = card.querySelector('.rounded-full.border-2');
            if (key === mode) {
                card.classList.add('selected');
                card.classList.remove('border-white/10', 'bg-white/5');
                card.classList.add('border-indigo-500', 'bg-indigo-500/10');
                if (dot) {
                    dot.classList.remove('bg-transparent');
                    dot.classList.add('bg-indigo-500');
                }
                if (circle) {
                    circle.classList.remove('border-white/30');
                    circle.classList.add('border-indigo-500');
                }
            } else {
                card.classList.remove('selected');
                card.classList.remove('border-indigo-500', 'bg-indigo-500/10');
                card.classList.add('border-white/10', 'bg-white/5');
                if (dot) {
                    dot.classList.add('bg-transparent');
                    dot.classList.remove('bg-indigo-500');
                }
                if (circle) {
                    circle.classList.remove('border-indigo-500');
                    circle.classList.add('border-white/30');
                }
            }
        });
    }

    Object.keys(modeCards).forEach(key => {
        const card = modeCards[key];
        if (!card) return;
        card.addEventListener('click', function () {
            selectMode(key);
        });
    });

    selectMode('multi_user');
})();
