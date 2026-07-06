import json
import subprocess
import time
import os
import boto3
from botocore.exceptions import ClientError
import psycopg2

class DbClient:
    def __init__(self, cfg_dir="configs", cfg_file="config.json"):
        root = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../.."))
        self.cfg_dir = os.path.join(root, cfg_dir)
        self.cfg_file = cfg_file
        self.cfg = self._load_cfg()

        self.verbose = self.cfg["verbose"]

        self.db_conn = self._start_db()
        self.s3_client = self._create_s3_client()
        self.minio_proc = self._start_minio()
        self._init_db()
        self._init_bucket()

    def _load_cfg(self):
        filepath = os.path.join(self.cfg_dir, self.cfg_file)
        if not os.path.exists(filepath):
            raise FileNotFoundError(f"配置文件不存在: {filepath}")
        with open(filepath, "r", encoding="utf-8") as f:
            cfg = json.load(f)

        # 读取用户配置文件
        user_cfg_file = cfg.get("user_config", "user_config.json")
        user_filepath = os.path.join(self.cfg_dir, user_cfg_file)

        if os.path.exists(user_filepath):
            with open(user_filepath, "r", encoding="utf-8") as f:
                user_cfg = json.load(f)

            # 覆盖 database 配置
            if "database" in user_cfg:
                db_override = user_cfg["database"]
                if "user" in db_override:
                    cfg["database"]["user"] = db_override["user"]
                if "password" in db_override:
                    cfg["database"]["password"] = db_override["password"]

            # 覆盖 minio 配置
            if "minio" in user_cfg:
                minio_override = user_cfg["minio"]
                if "access_key" in minio_override:
                    cfg["minio"]["access_key"] = minio_override["access_key"]
                if "secret_key" in minio_override:
                    cfg["minio"]["secret_key"] = minio_override["secret_key"]

            if cfg.get("verbose"):
                print(f"已加载用户配置")

        return cfg

    def _start_db(self):
        db_cfg = self.cfg['database']
        conn_params = {
            'host': db_cfg['host'],
            'port': db_cfg['port'],
            'dbname': db_cfg['dbname'],
            'user': db_cfg['user'],
            'password': db_cfg['password']
        }
        try:
            conn = psycopg2.connect(**conn_params)
            if self.verbose:
                print(f"数据库连接成功: {conn}")
            return conn
        except Exception as e:
            print(f"数据库连接失败: {e}")
            raise

    def _create_s3_client(self):
        minio_cfg = self.cfg['minio']
        endpoint_url = minio_cfg['endpoint_url']
        access_key = minio_cfg['access_key']
        secret_key = minio_cfg['secret_key']
        return boto3.client(
            's3',
            endpoint_url=endpoint_url,
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
            use_ssl=False,
            verify=False
        )

    def _start_minio(self):
        minio_cfg = self.cfg['minio']
        timeout = minio_cfg['timeout']
        script_path = os.path.join(os.path.dirname(__file__), "start_minio.bat")

        try:
            proc = subprocess.Popen(
                [script_path],
                creationflags=subprocess.CREATE_NEW_CONSOLE,
                shell=True
            )
            if self.verbose:
                print(f"MinIO 服务启动中 (PID: {proc.pid})...")
        except Exception as e:
            print(f"启动 MinIO 失败: {e}")
            raise

        # 等待 MinIO 服务就绪
        start_time = time.time()
        last_print = 0

        while time.time() - start_time < timeout:
            try:
                self.s3_client.list_buckets()
                if self.verbose:
                    print("MinIO 服务已就绪")
                return proc
            except Exception:
                elapsed = int(time.time() - start_time)
                if self.verbose and elapsed - last_print >= 2:
                    print(f"等待 MinIO 启动... ({elapsed}s)")
                    last_print = elapsed
                time.sleep(0.5)

        raise TimeoutError(f"MinIO 在 {timeout} 秒内未能启动")

    def _init_db(self):
        # 查询 datasets 表是否存在以检查数据库是否已经初始化
        cursor = self.db_conn.cursor()
        try:
            cursor.execute("""
                SELECT EXISTS (
                    SELECT 1 FROM information_schema.tables
                    WHERE table_name = 'datasets'
                );
            """)
            table_exists = cursor.fetchone()[0]
            if table_exists:
                if self.verbose:
                    print("数据库已初始化，跳过初始化脚本")
                return
        except Exception as e:
            print(f"检查数据库状态失败: {e}")
            raise
        finally:
            cursor.close()

        sql_path = os.path.join(os.path.dirname(__file__), 'init.sql')
        try:
            with open(sql_path, 'r', encoding='utf-8') as f:
                sql_script = f.read()
        except Exception as e:
            print(f"读取 SQL 文件失败: {e}")
            raise

        cursor = self.db_conn.cursor()
        try:
            # 直接执行整个 SQL 脚本，正确处理函数/触发器定义中的分号
            cursor.execute(sql_script)
            self.db_conn.commit()
            if self.verbose:
                print("数据库初始化完成")
        except Exception as e:
            self.db_conn.rollback()
            print(f"数据库初始化失败: {e}")
            raise
        finally:
            cursor.close()

    def _init_bucket(self):
        buckets_config = self.cfg.get("minio", {}).get("buckets", {})

        bucket_names = set(buckets_config.values())

        for bucket_name in bucket_names:
            try:
                self.s3_client.head_bucket(Bucket=bucket_name)
                if self.verbose:
                    print(f"存储桶 '{bucket_name}' 已存在")
            except ClientError as e:
                error_code = e.response['Error']['Code']
                if error_code == '404' or error_code == 'NoSuchBucket':
                    self.s3_client.create_bucket(Bucket=bucket_name)
                    print(f"存储桶 '{bucket_name}' 创建成功")
                else:
                    print(f"检查桶 '{bucket_name}' 时出错: {e}")
                    raise
            except Exception as e:
                print(f"初始化存储桶 '{bucket_name}' 失败: {e}")
                raise

    def stop_minio(self):
        if hasattr(self, "minio_proc"):
            self.minio_proc.terminate()
            print("MinIO 服务已停止")
        else:
            print("MinIO 进程未运行")

if __name__ == "__main__":
    dbClient = DbClient()