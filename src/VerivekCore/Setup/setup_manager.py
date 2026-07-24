import json
import os
import subprocess
import time
import psycopg2
import psycopg2.extras

from VerivekCore.AuthManager.auth_service import AuthService

def _safe_str(value):
    """安全地将值转换为字符串，处理非 UTF-8 编码字节。"""
    if isinstance(value, bytes):
        for encoding in ('utf-8', 'utf-8-sig', 'gbk', 'cp936', 'latin-1'):
            try:
                return value.decode(encoding)
            except UnicodeDecodeError:
                continue
        return value.decode('utf-8', errors='replace')
    return str(value)

class SetupManager:
    """首次启动配置管理器：负责检测是否需要初始化、保存配置、初始化数据库和管理员账户。"""

    def __init__(self, cfg_dir="configs", setup_file="setup.json", config_file="config.json"):
        root = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../.."))
        self.cfg_dir = os.path.join(root, cfg_dir)
        self.setup_path = os.path.join(self.cfg_dir, setup_file)
        self.config_path = os.path.join(self.cfg_dir, config_file)
        os.makedirs(self.cfg_dir, exist_ok=True)

    # 状态查询
    def get_setup_status(self):
        """返回当前 setup 状态。"""
        if not os.path.exists(self.setup_path):
            return {"setup_completed": False, "exists": False}
        try:
            with open(self.setup_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            return {
                "setup_completed": bool(data.get("setup_completed", False)),
                "exists": True,
                "data": data
            }
        except Exception as e:
            return {"setup_completed": False, "exists": True, "error": str(e)}

    def is_setup_complete(self):
        return self.get_setup_status().get("setup_completed", False)

    # 配置读写
    def _load_json(self, path):
        if not os.path.exists(path):
            return {}
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)

    def _save_json(self, path, data):
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=4)

    def build_config(self, db_config, minio_config=None, training_config=None):
        """根据用户填写的表单生成完整 config.json 内容。"""
        base = self._load_json(self.config_path)

        base.setdefault("verbose", True)
        base.setdefault("user_config", "user_config.json")

        base["database"] = {
            "host": db_config.get("host", "localhost").strip(),
            "port": int(db_config.get("port", 5432)),
            "dbname": db_config.get("dbname", "verivek").strip(),
            "user": db_config.get("user", "postgres").strip(),
            "password": db_config.get("password", ""),
            "service_name": db_config.get("service_name", "").strip(),
            "start_command": db_config.get("start_command", "").strip(),
        }

        base.setdefault("minio", {
            "timeout": 30,
            "endpoint_url": "http://localhost:9000",
            "buckets": {
                "models": "verivek-models",
                "datasets": "verivek-datasets",
                "weights": "verivek-weights"
            },
            "access_key": "minioadmin",
            "secret_key": "minioadmin"
        })
        if minio_config:
            base["minio"] = {
                "timeout": int(minio_config.get("timeout", 30)),
                "endpoint_url": minio_config.get("endpoint_url", "http://localhost:9000").strip(),
                "buckets": minio_config.get("buckets", {
                    "models": "verivek-models",
                    "datasets": "verivek-datasets",
                    "weights": "verivek-weights"
                }),
                "access_key": minio_config.get("access_key", "minioadmin").strip(),
                "secret_key": minio_config.get("secret_key", "minioadmin").strip(),
            }

        base.setdefault("training", {
            "venv_path": "C:/VeriVek/TaskEnv/venv"
        })
        if training_config:
            base["training"] = {
                "venv_path": training_config.get("venv_path", "C:/VeriVek/TaskEnv/venv").strip()
            }

        return base

    def save_config(self, config):
        self._save_json(self.config_path, config)

    def mark_setup_complete(self, deployment_mode='multi_user', admin_role='root'):
        """标记首次配置已完成，并记录部署模式与初始化管理员角色（供未来扩展）。"""
        data = self._load_json(self.setup_path)
        data["setup_completed"] = True
        data["setup_completed_at"] = time.strftime("%Y-%m-%dT%H:%M:%S")
        if not data.get("first_run_at"):
            data["first_run_at"] = data["setup_completed_at"]
        # 单用户模式目前仅做记录，不实现后端逻辑；未来接入 SQLite 时使用
        data["deployment_mode"] = deployment_mode
        data["init_admin_role"] = admin_role
        self._save_json(self.setup_path, data)

    # 数据库连接与服务启动
    @staticmethod
    def _test_connection(db_cfg, timeout=5):
        """测试数据库连接，返回 (success, error_message)。"""
        # 强制 PostgreSQL 客户端消息使用 UTF-8，避免中文 Windows 下 GBK 解码失败
        env_backup = os.environ.get("PGCLIENTENCODING")
        os.environ["PGCLIENTENCODING"] = "UTF8"
        try:
            conn = psycopg2.connect(
                host=db_cfg["host"],
                port=int(db_cfg["port"]),
                dbname=db_cfg["dbname"],
                user=db_cfg["user"],
                password=db_cfg["password"],
                connect_timeout=timeout
            )
            conn.close()
            return True, None
        except UnicodeDecodeError as e:
            # psycopg2 内部无法解码服务端错误消息时，手动用 GBK 解码原始字节
            raw = e.object if hasattr(e, 'object') else b''
            for encoding in ('gbk', 'cp936', 'gb2312', 'latin-1'):
                try:
                    decoded = raw.decode(encoding)
                    return False, decoded.strip()
                except UnicodeDecodeError:
                    continue
            return False, _safe_str(e)
        except Exception as e:
            return False, _safe_str(e)
        finally:
            if env_backup is None:
                os.environ.pop("PGCLIENTENCODING", None)
            else:
                os.environ["PGCLIENTENCODING"] = env_backup

    @staticmethod
    def _start_database_service(db_cfg):
        """尝试启动本地 PostgreSQL 服务。仅在 Windows 下生效。"""
        service_name = db_cfg.get("service_name", "").strip()
        start_command = db_cfg.get("start_command", "").strip()

        errors = []

        # 自定义启动命令（最高优先级）
        if start_command:
            try:
                proc = subprocess.run(
                    start_command,
                    shell=True,
                    capture_output=True,
                    text=False,
                    timeout=30
                )
                if proc.returncode == 0:
                    return True, None
                stderr = _safe_str(proc.stderr)
                stdout = _safe_str(proc.stdout)
                errors.append(f"自定义启动命令失败: {stderr or stdout}")
            except Exception as e:
                errors.append(f"自定义启动命令异常: {_safe_str(e)}")

        # Windows 服务名启动
        if service_name:
            try:
                proc = subprocess.run(
                    ["net", "start", service_name],
                    capture_output=True,
                    text=False,
                    timeout=30
                )
                # 0 表示成功，2 可能表示服务已经在运行
                if proc.returncode in (0, 2):
                    return True, None
                stderr = _safe_str(proc.stderr)
                stdout = _safe_str(proc.stdout)
                errors.append(f"net start {service_name} 失败: {stderr or stdout}")
            except Exception as e:
                errors.append(f"启动服务异常: {_safe_str(e)}")
            return False, "; ".join(errors)

        # 尝试常见服务名
        common_services = ["postgresql-x64-16", "postgresql-x64-15", "postgresql-x64-14", "postgresql", "postgres"]
        for name in common_services:
            try:
                proc = subprocess.run(
                    ["net", "start", name],
                    capture_output=True,
                    text=False,
                    timeout=30
                )
                if proc.returncode in (0, 2):
                    return True, None
            except Exception:
                continue

        errors.append("未提供 PostgreSQL 服务名，且尝试常见服务名均失败")
        return False, "; ".join(errors)

    @staticmethod
    def start_database_if_needed(db_cfg, max_wait=30):
        """如果数据库未运行，尝试启动并等待就绪。"""
        # 先测试连接
        ok, err = SetupManager._test_connection(db_cfg)
        if ok:
            return True, None

        # 尝试启动服务
        started, start_err = SetupManager._start_database_service(db_cfg)
        if not started:
            return False, start_err

        # 等待服务就绪
        deadline = time.time() + max_wait
        while time.time() < deadline:
            ok, err = SetupManager._test_connection(db_cfg)
            if ok:
                return True, None
            time.sleep(0.5)
        return False, f"数据库服务启动后仍无法在 {max_wait}s 内连接: {err}"

    # 初始化数据库表和管理员
    def initialize_schema(self, db_cfg):
        """连接数据库并执行 init.sql；若已初始化则跳过。"""
        sql_path = os.path.join(
            os.path.dirname(__file__), "..", "Database", "init.sql"
        )
        sql_path = os.path.abspath(sql_path)

        conn = psycopg2.connect(
            host=db_cfg["host"],
            port=int(db_cfg["port"]),
            dbname=db_cfg["dbname"],
            user=db_cfg["user"],
            password=db_cfg["password"]
        )
        try:
            cursor = conn.cursor()
            # 检查核心表是否已存在（与 DbClient 保持一致）
            cursor.execute("""
                SELECT EXISTS (
                    SELECT 1 FROM information_schema.tables
                    WHERE table_name = 'datasets'
                );
            """)
            table_exists = cursor.fetchone()[0]
            cursor.close()
            if table_exists:
                print("数据库已初始化，跳过初始化脚本")
                return

            with open(sql_path, "r", encoding="utf-8") as f:
                sql_script = f.read()
            cursor = conn.cursor()
            cursor.execute(sql_script)
            conn.commit()
            cursor.close()
        finally:
            conn.close()

    def create_admin_user(self, db_cfg, username, password, role='root'):
        """创建初始化管理员账户。role 仅允许 root 或 admin。"""
        if role not in ('root', 'admin'):
            raise ValueError(f"不支持的初始化管理员角色: {role}")

        conn = psycopg2.connect(
            host=db_cfg["host"],
            port=int(db_cfg["port"]),
            dbname=db_cfg["dbname"],
            user=db_cfg["user"],
            password=db_cfg["password"]
        )
        try:
            auth = AuthService(conn)
            password_hash = AuthService.hash_password(password)

            # 如果已存在 root，则不允许再次初始化覆盖
            if role == 'root' and auth.has_root():
                raise ValueError("系统中已存在 root，不允许重复初始化")

            cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

            # 检查目标用户名是否已存在
            cursor.execute(
                "SELECT user_id, password FROM users WHERE username = %s",
                (username,)
            )
            existing = cursor.fetchone()

            if existing:
                # 更新现有用户为初始化管理员角色并设置新密码
                cursor2 = conn.cursor()
                cursor2.execute(
                    "UPDATE users SET password = %s, role = %s WHERE user_id = %s",
                    (password_hash, role, existing["user_id"])
                )
                conn.commit()
                cursor2.close()
                user_id = existing["user_id"]
            else:
                # 创建新管理员（绕过 register_user 对 root 的限制）
                cursor.execute(
                    """
                    INSERT INTO users (username, password, role)
                    VALUES (%s, %s, %s)
                    RETURNING user_id
                    """,
                    (username, password_hash, role)
                )
                result = cursor.fetchone()
                conn.commit()
                user_id = result["user_id"]

            # 如果用户没有使用默认 'admin' 用户名，删除默认 admin 账户（避免残留默认口令）
            if username != 'admin':
                cursor.execute(
                    "SELECT user_id FROM users WHERE username = 'admin' AND password = 'verivek-admin'"
                )
                default_admin = cursor.fetchone()
                if default_admin:
                    cursor2 = conn.cursor()
                    cursor2.execute("DELETE FROM users WHERE user_id = %s", (default_admin["user_id"],))
                    conn.commit()
                    cursor2.close()

            cursor.close()
            return user_id
        finally:
            conn.close()