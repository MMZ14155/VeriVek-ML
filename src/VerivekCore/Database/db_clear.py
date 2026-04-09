import json
import os
import psycopg2

def clear_database():
    """清除 PostgreSQL 数据库中的所有内容（不依赖外部 DbClient）"""
    cfg = _load_config()
    verbose = cfg.get("verbose", True)

    conn = _connect_db(cfg["database"])
    try:
        _clear_database(conn, verbose)
    finally:
        conn.close()

    if verbose:
        print("数据库清理完成")

def _load_config(cfg_dir="configs", cfg_file="config.json"):
    """加载配置文件"""
    root = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../.."))
    cfg_path = os.path.join(root, cfg_dir, cfg_file)
    if not os.path.exists(cfg_path):
        raise FileNotFoundError(f"配置文件不存在: {cfg_path}")
    with open(cfg_path, "r", encoding="utf-8") as f:
        return json.load(f)

def _connect_db(db_cfg):
    """创建 PostgreSQL 连接"""
    try:
        conn = psycopg2.connect(
            host=db_cfg['host'],
            port=db_cfg['port'],
            dbname=db_cfg['dbname'],
            user=db_cfg['user'],
            password=db_cfg['password']
        )
        return conn
    except Exception as e:
        print(f"数据库连接失败: {e}")
        raise

def _clear_database(conn, verbose):
    """
    清空当前数据库 public schema 中的所有内容（表、序列、视图、函数等）
    采用删除并重建 public schema 的方式，确保彻底清除
    """
    cursor = conn.cursor()
    try:
        cursor.execute("SET session_replication_role = 'replica';")
        cursor.execute("DROP SCHEMA IF EXISTS public CASCADE;")
        cursor.execute("CREATE SCHEMA public;")
        cursor.execute("GRANT ALL ON SCHEMA public TO public;")
        cursor.execute("GRANT ALL ON ALL TABLES IN SCHEMA public TO public;")
        cursor.execute("SET session_replication_role = 'origin';")

        conn.commit()

        if verbose:
            print("已删除 public schema 中的所有内容并重建空 schema")

    except Exception as e:
        conn.rollback()
        print(f"数据库清理失败: {e}")
        raise
    finally:
        cursor.close()

if __name__ == "__main__":
    clear_database()