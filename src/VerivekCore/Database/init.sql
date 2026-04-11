CREATE TABLE IF NOT EXISTS users (
    user_id SERIAL PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password VARCHAR(255),

    -- 用户角色
    role VARCHAR(20) NOT NULL DEFAULT 'researcher'
        CHECK (role IN ('admin', 'researcher', 'guest')),

    -- 用户状态
    last_login_at TIMESTAMP,

    -- 用户配置
    preferences JSONB DEFAULT '{}',

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT guest_no_password CHECK (
        (role = 'guest' AND password IS NULL) OR
        (role != 'guest')
    )
);

INSERT INTO users (username, password, role) VALUES
('admin', 'verivek-admin', 'admin');

CREATE TABLE IF NOT EXISTS datasets (
    dataset_id SERIAL PRIMARY KEY,
    dataset_name VARCHAR(100) NOT NULL,
    description TEXT,
    format VARCHAR(20), -- csv, json等
    tags TEXT, -- CV, NLP等

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
    created_by VARCHAR(50),
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
    status VARCHAR(20) DEFAULT 'pending',
    created_by VARCHAR(50) DEFAULT 'anonymous',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT no_self_parent_preprocessed CHECK (preprocessed_id != parent_preprocessed_id)
);

CREATE TABLE IF NOT EXISTS models (
    model_id SERIAL PRIMARY KEY,
    model_name VARCHAR(20),
    description TEXT,
    tags TEXT, -- CV, NLP等

    visibility VARCHAR(10) DEFAULT 'private' CHECK (visibility IN ('public', 'private')),

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
    author VARCHAR(50),

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

CREATE TABLE IF NOT EXISTS trainings (
    training_id SERIAL PRIMARY KEY,

    -- 基础信息
    training_name VARCHAR(100),
    description TEXT,
    created_by VARCHAR(50),

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

-- 取每个数据集的第一个版本的提交者作为创建者
CREATE OR REPLACE VIEW datasets_with_creator AS
SELECT
    d.*,
    dv.created_by AS creator,
    dv.created_at AS first_version_time
FROM datasets d
LEFT JOIN (
    SELECT DISTINCT ON (dataset_id)
        dataset_id,
        created_by,
        created_at
    FROM dataset_versions
    ORDER BY dataset_id, version_id ASC
) dv ON d.dataset_id = dv.dataset_id;

-- 取每个模型的根提交的 author 作为创建者
CREATE OR REPLACE VIEW models_with_creator AS
SELECT
    m.*,
    mc.author AS creator,
    mc.created_at AS first_commit_time
FROM models m
LEFT JOIN LATERAL (
    SELECT author, created_at
    FROM model_commits mc
    WHERE mc.model_id = m.model_id
      AND NOT EXISTS (
          -- 没有作为 commit_id 出现在 commit_parents 中，即为根提交
          SELECT 1 FROM commit_parents cp WHERE cp.commit_id = mc.commit_id
      )
    ORDER BY mc.commit_id ASC
    LIMIT 1
) mc ON true;

CREATE OR REPLACE VIEW trainings_with_creator AS
SELECT
    t.*,
    created_by AS creator
FROM trainings t;