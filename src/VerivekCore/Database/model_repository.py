from typing import Optional, List, Dict, Any
import psycopg2
from .db_client import DbClient

class ModelRepository:
    def __init__(self, db_client: DbClient):
        self.db = db_client

    def get_model_by_name(self, model_name: str) -> Optional[Dict]:
        with self.db.db_conn.cursor() as cur:
            cur.execute("SELECT model_id, description, tags FROM models WHERE model_name = %s",
                        (model_name,))
            row = cur.fetchone()
            if row:
                return {"model_id": row[0], "description": row[1], "tags": row[2]}
            return None

    def get_model_by_id(self, model_id: int) -> Optional[Dict]:
        """通过ID获取模型详情"""
        with self.db.db_conn.cursor() as cur:
            cur.execute(
                "SELECT model_id, model_name, description, tags FROM models WHERE model_id = %s",
                (model_id,)
            )
            row = cur.fetchone()
            if row:
                return {
                    "model_id": row[0], "model_name": row[1],
                    "description": row[2], "tags": row[3]
                }
            return None

    def list_models(self) -> List[Dict]:
        """查询所有模型及分支数统计"""
        with self.db.db_conn.cursor() as cur:
            cur.execute("""
                        SELECT m.model_id,
                               m.model_name,
                               m.description,
                               m.tags,
                               m.created_at,
                               COUNT(b.branch_id) as branch_count
                        FROM models m
                                 LEFT JOIN model_branches b ON m.model_id = b.model_id
                        GROUP BY m.model_id
                        ORDER BY m.created_at DESC
                        """)
            return [{
                "model_id": r[0], "model_name": r[1], "description": r[2],
                "tags": r[3], "created_at": r[4], "branch_count": r[5]
            } for r in cur.fetchall()]

    def create_model(self, model_name: str, description: str = "", tags: str = "") -> int:
        with self.db.db_conn.cursor() as cur:
            cur.execute(
                "INSERT INTO models (model_name, description, tags) VALUES (%s, %s, %s) RETURNING model_id",
                (model_name, description, tags)
            )
            model_id = cur.fetchone()[0]
            self.db.db_conn.commit()
            return model_id

    def delete_model(self, model_id: int) -> None:
        with self.db.db_conn.cursor() as cur:
            cur.execute("DELETE FROM models WHERE model_id = %s", (model_id,))
            self.db.db_conn.commit()

    def get_commit_object_keys_by_model_id(self, model_id: int) -> List[str]:
        """获取模型下所有提交的对象存储键（用于删除时清理）"""
        with self.db.db_conn.cursor() as cur:
            cur.execute(
                "SELECT object_key FROM model_commits WHERE model_id = %s",
                (model_id,)
            )
            return [r[0] for r in cur.fetchall()]

    def get_branch(self, model_id: int, branch_name: str) -> Optional[Dict]:
        with self.db.db_conn.cursor() as cur:
            cur.execute(
                "SELECT branch_id, head_commit_id FROM model_branches WHERE model_id = %s AND branch_name = %s",
                (model_id, branch_name)
            )
            row = cur.fetchone()
            if row:
                return {"branch_id": row[0], "head_commit_id": row[1]}
            return None

    def create_branch(self, model_id: int, branch_name: str, is_default: bool = False,
                      description: str = "") -> int:
        with self.db.db_conn.cursor() as cur:
            cur.execute(
                """INSERT INTO model_branches (model_id, branch_name, is_default, description)
                   VALUES (%s, %s, %s, %s) RETURNING branch_id""",
                (model_id, branch_name, is_default, description)
            )
            branch_id = cur.fetchone()[0]
            self.db.db_conn.commit()
            return branch_id

    def update_branch_head(self, branch_id: int, commit_id: int) -> None:
        with self.db.db_conn.cursor() as cur:
            cur.execute(
                "UPDATE model_branches SET head_commit_id = %s, updated_at = CURRENT_TIMESTAMP WHERE branch_id = %s",
                (commit_id, branch_id)
            )
            self.db.db_conn.commit()

    def list_model_branches(self, model_id: int) -> List[Dict]:
        with self.db.db_conn.cursor() as cur:
            cur.execute(
                "SELECT branch_id, branch_name, is_default, head_commit_id FROM model_branches WHERE model_id = %s",
                (model_id,)
            )
            return [{"branch_id": r[0], "branch_name": r[1], "is_default": r[2], "head_commit_id": r[3]}
                    for r in cur.fetchall()]

    def create_commit(self, model_id: int, message: str, author: str,
                      bucket_name: str, object_key: str) -> int:
        with self.db.db_conn.cursor() as cur:
            cur.execute(
                """INSERT INTO model_commits (model_id, message, author, bucket_name, object_key)
                   VALUES (%s, %s, %s, %s, %s) RETURNING commit_id""",
                (model_id, message, author, bucket_name, object_key)
            )
            commit_id = cur.fetchone()[0]
            self.db.db_conn.commit()
            return commit_id

    def add_commit_parent(self, commit_id: int, parent_id: int) -> None:
        with self.db.db_conn.cursor() as cur:
            cur.execute(
                "INSERT INTO commit_parents (commit_id, parent_id) VALUES (%s, %s)",
                (commit_id, parent_id)
            )
            self.db.db_conn.commit()

    def get_commit(self, commit_id: int) -> Optional[Dict]:
        with self.db.db_conn.cursor() as cur:
            cur.execute(
                "SELECT commit_id, model_id, message, author, object_key FROM model_commits WHERE commit_id = %s",
                (commit_id,)
            )
            row = cur.fetchone()
            if row:
                return {
                    "commit_id": row[0], "model_id": row[1], "message": row[2],
                    "author": row[3], "object_key": row[4]
                }
            return None

    def get_commit_history(self, commit_id: int, limit: int = 100) -> List[Dict]:
        with self.db.db_conn.cursor() as cur:
            cur.execute("""
                        WITH RECURSIVE history AS (SELECT commit_id, message, author, created_at, 0 as depth
                                                   FROM model_commits
                                                   WHERE commit_id = %s
                                                   UNION
                                                   SELECT c.commit_id, c.message, c.author, c.created_at, h.depth + 1
                                                   FROM model_commits c
                                                            JOIN commit_parents cp ON c.commit_id = cp.parent_id
                                                            JOIN history h ON cp.commit_id = h.commit_id
                                                   WHERE h.depth < %s)
                        SELECT *
                        FROM history
                        ORDER BY depth
                        """, (commit_id, limit))
            return [{"commit_id": r[0], "message": r[1], "author": r[2], "created_at": r[3]}
                    for r in cur.fetchall()]

    def storage_upload(self, local_path: str, object_key: str, bucket: str = "verivek-models") -> bool:
        try:
            self.db.s3_client.upload_file(local_path, bucket, object_key)
            return True
        except Exception as e:
            print(f"上传失败: {e}")
            return False

    def storage_delete(self, object_key: str, bucket: str = "verivek-models") -> bool:
        try:
            self.db.s3_client.delete_object(Bucket=bucket, Key=object_key)
            return True
        except Exception as e:
            print(f"删除失败: {e}")
            return False