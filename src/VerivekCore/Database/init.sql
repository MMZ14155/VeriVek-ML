CREATE TABLE IF NOT EXISTS users (
    user_id SERIAL PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password VARCHAR(255),

    -- 用户角色（root 仅可由初始化创建）
    role VARCHAR(20) NOT NULL DEFAULT 'researcher'
        CHECK (role IN ('root', 'admin', 'researcher', 'guest')),

    -- 用户状态
    last_login_at TIMESTAMP,

    -- 用户配置
    preferences JSONB DEFAULT '{}',

    -- 用户贡献统计
    dataset_contributions INTEGER DEFAULT 0,
    model_contributions INTEGER DEFAULT 0,
    training_count INTEGER DEFAULT 0,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT guest_no_password CHECK (
        (role = 'guest' AND password IS NULL) OR
        (role != 'guest')
    )
);

CREATE TABLE IF NOT EXISTS datasets (
    dataset_id SERIAL PRIMARY KEY,
    dataset_name VARCHAR(100) NOT NULL,
    description TEXT,
    format VARCHAR(20), -- csv, json等
    tags TEXT, -- CV, NLP等

    -- 所有者（唯一，可转移；ON DELETE SET NULL 保留历史资源）
    owner_id INTEGER REFERENCES users(user_id) ON DELETE SET NULL,

    visibility VARCHAR(10) DEFAULT 'private' CHECK (visibility IN ('public', 'private')),

    head_version_id INTEGER, -- 最新提交的ID

    total_rows BIGINT DEFAULT 0, -- 累计数据量（条目数量/图片数量）
    total_size_bytes BIGINT DEFAULT 0,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS dataset_versions (
    version_id SERIAL PRIMARY KEY,
    dataset_id INTEGER NOT NULL REFERENCES datasets(dataset_id) ON DELETE CASCADE,

    -- 版本谱系（只允许追加，单线历史）
    parent_version_id INTEGER REFERENCES dataset_versions(version_id),

    -- 压缩补丁存储位置
    bucket_name VARCHAR(63) DEFAULT 'verivek-datasets',
    object_key VARCHAR(255) NOT NULL, -- 对象路径

    -- 压缩元数据
    compression_format VARCHAR(10) DEFAULT 'zstd', -- zstd, gzip, lz4, snappy
    compressed_size_bytes BIGINT NOT NULL, -- 压缩后大小（字节）
    uncompressed_size_bytes BIGINT, -- 解压后大小（新增内容原始大小）

    -- 数据完整性
    checksum_sha256 VARCHAR(64) NOT NULL, -- 内容SHA256校验和
    content_type VARCHAR(50) DEFAULT 'application/octet-stream',

    -- 变更统计
    added_rows BIGINT DEFAULT 0, -- 本次新增行数
    added_size_bytes BIGINT DEFAULT 0, -- 本次新增原始字节数
    cumulative_rows BIGINT NOT NULL, -- 截至本版本的累计总行数（快速查询用）

    -- 版本注释
    message TEXT,  -- 变更说明
    created_by INTEGER REFERENCES users(user_id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- 防止自环
    CONSTRAINT no_self_parent CHECK (version_id != parent_version_id)
);

CREATE TABLE IF NOT EXISTS datasets_preprocess (
    preprocessed_id SERIAL PRIMARY KEY,
    dataset_id INTEGER NOT NULL REFERENCES datasets(dataset_id) ON DELETE CASCADE,
    source_version_id INTEGER REFERENCES dataset_versions(version_id),

    -- 当前 API 层不开放链式预处理支持的参数
    parent_preprocessed_id INTEGER REFERENCES datasets_preprocess(preprocessed_id),

    name VARCHAR(100) NOT NULL,
    script_object_key VARCHAR(255),
    data_object_key VARCHAR(255) NOT NULL,
    preprocessing_config JSONB DEFAULT '{}',
    status VARCHAR(20) DEFAULT 'pending'
        CHECK (status IN ('pending', 'running', 'completed', 'failed')),

    created_by INTEGER REFERENCES users(user_id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT no_self_parent_preprocessed CHECK (preprocessed_id != parent_preprocessed_id)
);

CREATE TABLE IF NOT EXISTS models (
    model_id SERIAL PRIMARY KEY,
    model_name VARCHAR(20),
    description TEXT,
    tags TEXT, -- CV, NLP等

    -- 所有者（唯一，可转移；ON DELETE SET NULL 保留历史资源）
    owner_id INTEGER REFERENCES users(user_id) ON DELETE SET NULL,

    visibility VARCHAR(10) DEFAULT 'private' CHECK (visibility IN ('public', 'private')),

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- 名称在单个用户命名空间内唯一，允许不同用户同名
    UNIQUE (owner_id, model_name)
);

CREATE TABLE IF NOT EXISTS model_branches (
    branch_id SERIAL PRIMARY KEY,
    model_id INTEGER NOT NULL REFERENCES models(model_id) ON DELETE CASCADE,
    branch_name VARCHAR(20) NOT NULL,
    is_default BOOLEAN,
    head_commit_id INTEGER, -- 当前分支最新提交的ID
    description TEXT,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE (model_id, branch_name)
);

CREATE TABLE IF NOT EXISTS model_commits (
    commit_id SERIAL PRIMARY KEY,
    model_id INTEGER NOT NULL REFERENCES models(model_id) ON DELETE CASCADE,
    message TEXT,
    author INTEGER REFERENCES users(user_id) ON DELETE SET NULL,

    bucket_name VARCHAR(63) DEFAULT 'verivek-models',
    object_key VARCHAR(255) NOT NULL, -- MinIO对象键

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS commit_parents (
    commit_id INTEGER NOT NULL REFERENCES model_commits(commit_id) ON DELETE CASCADE,
    parent_id INTEGER NOT NULL REFERENCES model_commits(commit_id) ON DELETE CASCADE,
    PRIMARY KEY (commit_id, parent_id),
    CHECK (commit_id != parent_id) -- 防止自环
);

ALTER TABLE model_branches ADD FOREIGN KEY (head_commit_id) REFERENCES model_commits(commit_id) ON DELETE SET NULL;

-- 资源协作者：私有资源的共享授权（read 仅查看/引用，write 可推版本/提交）
CREATE TABLE IF NOT EXISTS resource_collaborators (
    resource_type VARCHAR(10) NOT NULL CHECK (resource_type IN ('model', 'dataset')),
    resource_id   INTEGER NOT NULL,
    user_id       INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    permission    VARCHAR(10) NOT NULL CHECK (permission IN ('read', 'write')),

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (resource_type, resource_id, user_id)
);

CREATE TABLE IF NOT EXISTS trainings (
    training_id SERIAL PRIMARY KEY,

    -- 基础信息
    training_name VARCHAR(100),
    description TEXT,
    created_by INTEGER REFERENCES users(user_id) ON DELETE SET NULL,

    -- 关联模型
    model_commit_id INTEGER NOT NULL REFERENCES model_commits(commit_id),
    branch_id INTEGER REFERENCES model_branches(branch_id),

    -- 关联数据源（二选一，互斥且必须选其一）
    dataset_id INTEGER REFERENCES datasets(dataset_id) ON DELETE SET NULL,
    preprocessed_id INTEGER REFERENCES datasets_preprocess(preprocessed_id) ON DELETE SET NULL,

    -- 超参数配置
    hyperparameters JSONB NOT NULL DEFAULT '{}',

    -- 是否为断点由该字段控制：status != 'completed' 时，last 权重即为断点
    status VARCHAR(20) DEFAULT 'pending'
        CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),

    visibility VARCHAR(10) DEFAULT 'private' CHECK (visibility IN ('public', 'private')),

    -- 训练指标
    metrics JSONB DEFAULT '{}',
    final_metrics JSONB DEFAULT '{}',

    -- 权重外键引用
    main_weight_id INTEGER, -- 对应 weight_type='best'（最佳指标权重或断点前最佳）
    checkpoint_weight_id INTEGER, -- 对应 weight_type='last'（最后epoch或断点）

    -- 计算资源消耗
    compute_time_seconds INTEGER,
    gpu_type VARCHAR(50),
    gpu_count INTEGER,

    -- 时间戳
    started_at TIMESTAMP,
    completed_at TIMESTAMP,

    -- 失败信息
    error_message TEXT,
    exit_code INTEGER,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT chk_exclusive_data_source CHECK (
        (dataset_id IS NOT NULL AND preprocessed_id IS NULL) OR
        (dataset_id IS NULL AND preprocessed_id IS NOT NULL)
    )
);

CREATE TABLE IF NOT EXISTS training_weights (
    weight_id SERIAL PRIMARY KEY,
    training_id INTEGER NOT NULL REFERENCES trainings(training_id) ON DELETE CASCADE,

    -- 当 trainings.status != 'completed' 时，last 代表断点权重
    weight_type VARCHAR(20) NOT NULL
        CHECK (weight_type IN ('best', 'last')),

    -- 训练进度标记
    epoch_number INTEGER NOT NULL,
    step_number INTEGER,
    global_step BIGINT,

    -- 存储位置
    bucket_name VARCHAR(63) DEFAULT 'verivek-weights',
    object_key VARCHAR(255) NOT NULL,

    -- 文件元数据
    format VARCHAR(20)
        CHECK (format IN ('pt', 'pth', 'safetensors', 'h5', 'pb', 'onnx', 'checkpoint')),
    size_bytes BIGINT,
    checksum_sha256 VARCHAR(64),
    content_type VARCHAR(50) DEFAULT 'application/octet-stream',

    -- 原始指标快照
    metrics_snapshot JSONB DEFAULT '{}',

    -- 版本注释
    note TEXT,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- 一个训练只能有一个 best 和一个 last
    UNIQUE (training_id, weight_type)
);

ALTER TABLE trainings
    ADD CONSTRAINT fk_training_main_weight
    FOREIGN KEY (main_weight_id) REFERENCES training_weights(weight_id) ON DELETE SET NULL,
    ADD CONSTRAINT fk_training_checkpoint_weight
    FOREIGN KEY (checkpoint_weight_id) REFERENCES training_weights(weight_id) ON DELETE SET NULL;

-- 所有权统一由 owner_id 列承载（datasets/models），trainings 使用 created_by 列。
-- 旧的 *_with_creator 视图（从首个 version/commit 推断创建者）已随 owner_id 落地而废弃删除。

-- 数据集贡献数触发器函数
CREATE OR REPLACE FUNCTION update_dataset_contributions()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE users
        SET dataset_contributions = dataset_contributions + 1
        WHERE user_id = NEW.created_by;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE users
        SET dataset_contributions = GREATEST(dataset_contributions - 1, 0)
        WHERE user_id = OLD.created_by;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- 模型贡献数触发器函数
CREATE OR REPLACE FUNCTION update_model_contributions()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE users
        SET model_contributions = model_contributions + 1
        WHERE user_id = NEW.author;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE users
        SET model_contributions = GREATEST(model_contributions - 1, 0)
        WHERE user_id = OLD.author;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- 训练数量触发器函数
CREATE OR REPLACE FUNCTION update_training_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE users
        SET training_count = training_count + 1
        WHERE user_id = NEW.created_by;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE users
        SET training_count = GREATEST(training_count - 1, 0)
        WHERE user_id = OLD.created_by;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- 创建触发器：数据集版本
CREATE TRIGGER trg_dataset_versions_contributions
    AFTER INSERT OR DELETE ON dataset_versions
    FOR EACH ROW
    EXECUTE FUNCTION update_dataset_contributions();

-- 创建触发器：模型提交
CREATE TRIGGER trg_model_commits_contributions
    AFTER INSERT OR DELETE ON model_commits
    FOR EACH ROW
    EXECUTE FUNCTION update_model_contributions();

-- 创建触发器：训练任务
CREATE TRIGGER trg_trainings_count
    AFTER INSERT OR DELETE ON trainings
    FOR EACH ROW
    EXECUTE FUNCTION update_training_count();

-- 检查用户是否有权访问数据集
CREATE OR REPLACE FUNCTION can_access_dataset(p_user_id INTEGER, p_dataset_id INTEGER)
RETURNS BOOLEAN AS $$
DECLARE
    v_user_role VARCHAR(20);
    v_is_public BOOLEAN;
    v_is_owner BOOLEAN;
    v_is_collaborator BOOLEAN;
BEGIN
    -- 获取用户角色
    SELECT role INTO v_user_role FROM users WHERE user_id = p_user_id;

    -- 管理员可以访问所有资源
    IF v_user_role IN ('admin', 'root') THEN
        RETURN TRUE;
    END IF;

    -- 获取数据集可见性和所有权
    SELECT
        d.visibility = 'public',
        d.owner_id = p_user_id
    INTO v_is_public, v_is_owner
    FROM datasets d
    WHERE d.dataset_id = p_dataset_id;

    -- 公共数据集或所有者可访问
    IF v_is_public OR v_is_owner THEN
        RETURN TRUE;
    END IF;

    -- 协作者（read 或 write）可访问
    SELECT EXISTS(
        SELECT 1 FROM resource_collaborators rc
        WHERE rc.resource_type = 'dataset'
          AND rc.resource_id = p_dataset_id
          AND rc.user_id = p_user_id
    ) INTO v_is_collaborator;

    RETURN v_is_collaborator;
END;
$$ LANGUAGE plpgsql;

-- 检查用户是否有权访问模型
CREATE OR REPLACE FUNCTION can_access_model(p_user_id INTEGER, p_model_id INTEGER)
RETURNS BOOLEAN AS $$
DECLARE
    v_user_role VARCHAR(20);
    v_is_public BOOLEAN;
    v_is_owner BOOLEAN;
    v_is_collaborator BOOLEAN;
BEGIN
    -- 获取用户角色
    SELECT role INTO v_user_role FROM users WHERE user_id = p_user_id;

    -- 管理员可以访问所有资源
    IF v_user_role IN ('admin', 'root') THEN
        RETURN TRUE;
    END IF;

    -- 获取模型可见性和所有权
    SELECT
        m.visibility = 'public',
        m.owner_id = p_user_id
    INTO v_is_public, v_is_owner
    FROM models m
    WHERE m.model_id = p_model_id;

    -- 公共模型或所有者可访问
    IF v_is_public OR v_is_owner THEN
        RETURN TRUE;
    END IF;

    -- 协作者（read 或 write）可访问
    SELECT EXISTS(
        SELECT 1 FROM resource_collaborators rc
        WHERE rc.resource_type = 'model'
          AND rc.resource_id = p_model_id
          AND rc.user_id = p_user_id
    ) INTO v_is_collaborator;

    RETURN v_is_collaborator;
END;
$$ LANGUAGE plpgsql;

-- 检查用户是否有权访问训练任务
CREATE OR REPLACE FUNCTION can_access_training(p_user_id INTEGER, p_training_id INTEGER)
RETURNS BOOLEAN AS $$
DECLARE
    v_user_role VARCHAR(20);
    v_is_public BOOLEAN;
    v_is_creator BOOLEAN;
BEGIN
    -- 获取用户角色
    SELECT role INTO v_user_role FROM users WHERE user_id = p_user_id;

    -- 管理员可以访问所有资源
    IF v_user_role IN ('admin', 'root') THEN
        RETURN TRUE;
    END IF;

    -- 获取训练任务可见性和创建者信息（trainings.created_by 即所有者，语义不变）
    SELECT
        t.visibility = 'public',
        t.created_by = p_user_id
    INTO v_is_public, v_is_creator
    FROM trainings t
    WHERE t.training_id = p_training_id;

    -- 公共训练或创建者可以访问
    RETURN v_is_public OR v_is_creator;
END;
$$ LANGUAGE plpgsql;

-- 检查用户是否有权修改数据集（owner、write 协作者或管理员）
CREATE OR REPLACE FUNCTION can_modify_dataset(p_user_id INTEGER, p_dataset_id INTEGER)
RETURNS BOOLEAN AS $$
DECLARE
    v_user_role VARCHAR(20);
BEGIN
    -- 获取用户角色
    SELECT role INTO v_user_role FROM users WHERE user_id = p_user_id;

    -- 管理员可以修改所有资源
    IF v_user_role IN ('admin', 'root') THEN
        RETURN TRUE;
    END IF;

    -- 访客不能修改任何资源
    IF v_user_role = 'guest' THEN
        RETURN FALSE;
    END IF;

    -- 所有者可修改
    IF EXISTS(
        SELECT 1 FROM datasets d
        WHERE d.dataset_id = p_dataset_id AND d.owner_id = p_user_id
    ) THEN
        RETURN TRUE;
    END IF;

    -- write 协作者可修改（推版本等写操作）
    RETURN EXISTS(
        SELECT 1 FROM resource_collaborators rc
        WHERE rc.resource_type = 'dataset'
          AND rc.resource_id = p_dataset_id
          AND rc.user_id = p_user_id
          AND rc.permission = 'write'
    );
END;
$$ LANGUAGE plpgsql;

-- 检查用户是否有权修改模型（owner、write 协作者或管理员）
CREATE OR REPLACE FUNCTION can_modify_model(p_user_id INTEGER, p_model_id INTEGER)
RETURNS BOOLEAN AS $$
DECLARE
    v_user_role VARCHAR(20);
BEGIN
    -- 获取用户角色
    SELECT role INTO v_user_role FROM users WHERE user_id = p_user_id;

    -- 管理员可以修改所有资源
    IF v_user_role IN ('admin', 'root') THEN
        RETURN TRUE;
    END IF;

    -- 访客不能修改任何资源
    IF v_user_role = 'guest' THEN
        RETURN FALSE;
    END IF;

    -- 所有者可修改
    IF EXISTS(
        SELECT 1 FROM models m
        WHERE m.model_id = p_model_id AND m.owner_id = p_user_id
    ) THEN
        RETURN TRUE;
    END IF;

    -- write 协作者可修改（推 commit、建分支等写操作）
    RETURN EXISTS(
        SELECT 1 FROM resource_collaborators rc
        WHERE rc.resource_type = 'model'
          AND rc.resource_id = p_model_id
          AND rc.user_id = p_user_id
          AND rc.permission = 'write'
    );
END;
$$ LANGUAGE plpgsql;

-- 检查用户是否有权修改训练任务（仅创建者或管理员；训练任务无协作者概念）
CREATE OR REPLACE FUNCTION can_modify_training(p_user_id INTEGER, p_training_id INTEGER)
RETURNS BOOLEAN AS $$
DECLARE
    v_user_role VARCHAR(20);
BEGIN
    -- 获取用户角色
    SELECT role INTO v_user_role FROM users WHERE user_id = p_user_id;
    
    -- 管理员可以修改所有资源
    IF v_user_role IN ('admin', 'root') THEN
        RETURN TRUE;
    END IF;
    
    -- 访客不能修改任何资源
    IF v_user_role = 'guest' THEN
        RETURN FALSE;
    END IF;
    
    -- 检查是否是创建者
    RETURN EXISTS(
        SELECT 1 FROM trainings t 
        WHERE t.training_id = p_training_id AND t.created_by = p_user_id
    );
END;
$$ LANGUAGE plpgsql;

-- 存储过程：创建训练任务并初始化权重槽位，要么全部成功，要么全部回滚
CREATE OR REPLACE PROCEDURE create_training(
    IN p_user_id INTEGER,
    IN p_training_name VARCHAR(100),
    IN p_model_commit_id INTEGER,
    IN p_dataset_id INTEGER,
    OUT p_training_id INTEGER,
    IN p_hyperparameters JSONB DEFAULT '{}',
    IN p_description TEXT DEFAULT NULL
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_model_id INTEGER;
    v_has_access BOOLEAN;
BEGIN
    -- 获取模型commit对应的model_id
    SELECT model_id INTO v_model_id 
    FROM model_commits 
    WHERE commit_id = p_model_commit_id;
    
    IF v_model_id IS NULL THEN
        RAISE EXCEPTION '模型提交不存在: %', p_model_commit_id;
    END IF;
    
    -- 验证用户是否有权访问该模型
    SELECT can_access_model(p_user_id, v_model_id) INTO v_has_access;
    IF NOT v_has_access THEN
        RAISE EXCEPTION '无权访问该模型';
    END IF;
    
    -- 验证用户是否有权访问该数据集
    SELECT can_access_dataset(p_user_id, p_dataset_id) INTO v_has_access;
    IF NOT v_has_access THEN
        RAISE EXCEPTION '无权访问该数据集';
    END IF;
    
    -- 插入训练记录
    INSERT INTO trainings (
        training_name,
        description,
        created_by,
        model_commit_id,
        dataset_id,
        hyperparameters,
        status
    ) VALUES (
        p_training_name,
        p_description,
        p_user_id,
        p_model_commit_id,
        p_dataset_id,
        p_hyperparameters,
        'pending'
    )
    RETURNING training_id INTO p_training_id;
    
    -- 创建 best 权重槽位（初始为空，指向训练开始前的状态）
    INSERT INTO training_weights (
        training_id,
        weight_type,
        epoch_number,
        object_key
    ) VALUES (
        p_training_id,
        'best',
        0,
        'verivek-weights/training_' || p_training_id || '/best'
    );
    
    -- 创建 last 权重槽位（用于断点续训）
    INSERT INTO training_weights (
        training_id,
        weight_type,
        epoch_number,
        object_key
    ) VALUES (
        p_training_id,
        'last',
        0,
        'verivek-weights/training_' || p_training_id || '/last'
    );
    
    -- 更新训练记录的外键引用
    UPDATE trainings 
    SET 
        main_weight_id = (SELECT weight_id FROM training_weights WHERE training_id = p_training_id AND weight_type = 'best'),
        checkpoint_weight_id = (SELECT weight_id FROM training_weights WHERE training_id = p_training_id AND weight_type = 'last')
    WHERE training_id = p_training_id;
    
EXCEPTION
    WHEN OTHERS THEN
        -- 发生错误时回滚（自动回滚当前事务）
        RAISE EXCEPTION '创建训练任务失败: %', SQLERRM;
END;
$$;

-- 存储过程：级联删除数据集（删除数据集及其所有版本、预处理记录）
-- 用于管理员清理数据或用户删除自己的数据集
CREATE OR REPLACE PROCEDURE delete_dataset_cascade(
    IN p_user_id INTEGER,
    IN p_dataset_id INTEGER
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_can_modify BOOLEAN;
    v_version RECORD;
BEGIN
    -- 验证用户是否有权删除该数据集
    SELECT can_modify_dataset(p_user_id, p_dataset_id) INTO v_can_modify;
    IF NOT v_can_modify THEN
        RAISE EXCEPTION '无权删除该数据集';
    END IF;
    
    -- 删除所有预处理记录（先删除子表）
    DELETE FROM datasets_preprocess WHERE dataset_id = p_dataset_id;
    
    -- 删除所有版本记录
    DELETE FROM dataset_versions WHERE dataset_id = p_dataset_id;
    
    -- 删除数据集主记录
    DELETE FROM datasets WHERE dataset_id = p_dataset_id;
    
    -- 返回删除成功信息
    RAISE NOTICE '数据集 % 及其所有版本已删除', p_dataset_id;
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION '删除数据集失败: %', SQLERRM;
END;
$$;