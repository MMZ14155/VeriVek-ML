# VeriVek ML

轻量级机器学习模型训练与管理平台，支持数据集版本管理、可视化模型架构设计、预处理流水线以及训练任务调度。


## 功能特性

- **数据集管理**：导入、版本控制、预处理流水线、目录结构可视化
- **模型仓库**：代码版本管理、分支管理、架构可视化编辑器
- **训练调度**：GPU 监控、异步训练执行、实时日志与指标采集
- **对象存储**：基于 MinIO 的数据集、模型权重存储
- **预处理执行**：用户上传自定义预处理脚本，后台异步执行并归档结果

## 项目结构

```
VeriVek-ML/
├── configs/              # 配置文件（数据库、MinIO、训练环境）
├── deploy/               # 部署脚本（初始化 PostgreSQL、MinIO）
├── examples/             # 示例数据集和模型代码
├── resources/            # 预置架构模板（AlexNet、LeNet-5、VGG11）
├── src/
│   ├── VerivekCore/      # 核心服务层
│   │   ├── AuthManager/  # 用户认证
│   │   ├── Database/     # 数据库连接与仓库
│   │   ├── DatasetManager/   # 数据集导入、预处理执行
│   │   ├── ModelManager/     # 模型版本与架构生成
│   │   └── Training/         # 训练管理、GPU监控、代码生成
│   └── VerivekWeb/       # Flask Web 应用
│       ├── static/       # CSS、JS 前端资源
│       └── templates/    # HTML 模板
└── minio-data/           # MinIO 本地数据目录
```

## 环境依赖

- Python >= 3.13
- PostgreSQL >= 18
- MinIO Server
- NVIDIA GPU（可选，用于训练加速）

## 快速开始

### 1. 安装 PostgreSQL

从 [postgresql.org/download](https://www.postgresql.org/download/) 下载并安装 PostgreSQL（建议 >= 18）。安装过程中记住设置的密码，后续配置需要用到。

安装完成后，使用 pgAdmin 或 psql 创建数据库：

```sql
CREATE DATABASE verivek;
```

### 2. 下载 MinIO

执行部署脚本自动下载 MinIO Server：

```bash
deploy/install_minio.bat
```

脚本会在项目根目录下载 `minio.exe`。如果下载失败，可手动从 [www.minio.org.cn/download](https://www.minio.org.cn/download.shtml#/windows) 下载 Windows 版本并放置于项目根目录。

### 3. 安装 Python 依赖

```bash
pip install -r requirements.txt
```

### 4. 配置数据库与对象存储

编辑 `configs/config.json`，填入你的 PostgreSQL 密码：

```json
{
    "database": {
        "host": "localhost",
        "port": 5432,
        "dbname": "verivek",
        "user": "postgres",
        "password": "你的密码"
    },
    "minio": {
        "endpoint_url": "http://localhost:9000",
        "access_key": "minioadmin",
        "secret_key": "minioadmin"
    }
}
```

> 敏感配置可放在 `configs/user_config.json`，会自动覆盖主配置中的同名字段。

### 5. 启动 MinIO

```bash
src/VerivekCore/Database/start_minio.bat
```

### 6. 初始化数据库

首次启动 `app.py` 时会自动执行 `src/VerivekCore/Database/init.sql` 完成表结构初始化。

### 7. 运行 Web 服务

```bash
cd src/VerivekWeb
python app.py
```

访问 http://localhost:5000

## 训练环境

训练任务默认使用独立虚拟环境，路径在配置中指定：

```json
{
    "training": {
        "venv_path": "C:/VeriVek/TaskEnv/venv"
    }
}
```

运行setup_task_env.py以确保该虚拟环境中安装 `torch`、`torchvision`。

## 主要 API

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/datasets` | GET/POST | 数据集列表/导入 |
| `/api/datasets/<id>/preprocess` | GET/POST | 预处理版本/创建预处理 |
| `/api/models` | GET | 模型列表 |
| `/api/models/<id>/commits` | GET/POST | 提交历史/新建提交 |
| `/api/trainings` | GET/POST | 训练任务列表/创建 |
| `/api/trainings/<id>/start` | POST | 启动训练 |
| `/api/trainings/<id>/logs` | GET | 实时日志 |
| `/api/gpu` | GET | GPU 状态监控 |

## 已知问题

- **预处理执行**：当前版本预处理模块存在问题，有时无法正确执行预处理操作，建议直接导入预处理好的数据集或等待后续修复。

## 技术栈

- **后端**：Flask + PostgreSQL + psycopg2
- **对象存储**：MinIO (S3 API via boto3)
- **前端**：Tailwind CSS + Chart.js + 原生 JavaScript
- **深度学习**：PyTorch
- **进程管理**：subprocess + threading