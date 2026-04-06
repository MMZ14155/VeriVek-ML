from typing import List, Dict, Optional

from ..Database.db_client import DbClient
from ..Database.model_repository import ModelRepository
from .model_importer import ModelImporter

class ModelManager:
    def __init__(self, db_client: DbClient):
        self.db_client = db_client
        self.repo = ModelRepository(db_client)
        self.importer = ModelImporter(db_client)

    def import_model(self, model_name: str, branch_name: str, model_path: str,
                     message: str = "", author: str = "", **kwargs) -> int:
        """委托给 ModelImporter"""
        return self.importer.import_model(
            model_name, branch_name, model_path, message, author, **kwargs
        )

    def list_models(self) -> List[Dict]:
        """查询所有模型及分支数统计"""
        with self.db_client.db_conn.cursor() as cur:
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

    def get_model_detail(self, model_id: int) -> Dict:
        with self.db_client.db_conn.cursor() as cur:
            cur.execute(
                "SELECT model_id, model_name, description, tags FROM models WHERE model_id = %s",
                (model_id,)
            )
            row = cur.fetchone()
            model = {
                "model_id": row[0], "model_name": row[1],
                "description": row[2], "tags": row[3]
            } if row else {"model_id": model_id}

        branches = self.repo.list_model_branches(model_id)
        return {
            "model_id": model_id,
            "model": model,
            "branches": branches,
            "branch_count": len(branches)
        }

    def get_commit_history(self, model_id: int, branch_name: str) -> List[Dict]:
        """获取某分支的提交历史"""
        branch = self.repo.get_branch(model_id, branch_name)
        if not branch or not branch["head_commit_id"]:
            return []
        return self.repo.get_commit_history(branch["head_commit_id"])

    def delete_model(self, model_id: int) -> None:
        with self.db_client.db_conn.cursor() as cur:
            cur.execute(
                "SELECT object_key FROM model_commits WHERE model_id = %s",
                (model_id,)
            )
            object_keys = [r[0] for r in cur.fetchall()]

        for key in object_keys:
            self.repo.storage_delete(key, "verivek-models")
            print(f"已清理 MinIO 对象: {key}")

        self.repo.delete_model(model_id)
        print(f"模型 {model_id} 已删除")