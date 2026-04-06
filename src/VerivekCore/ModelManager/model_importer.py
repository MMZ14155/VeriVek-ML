import os
import time
import zipfile
import tempfile
from ..Database.model_repository import ModelRepository
from ..Database.db_client import DbClient

class ModelImporter:
    def __init__(self, db_client: DbClient):
        self.repo = ModelRepository(db_client)
        self.bucket_name = "verivek-models"

    def import_model(self, model_name: str, branch_name: str, model_path: str,
                     message: str = "", author: str = "", tags: str = "",
                     description: str = "") -> int:
        try:
            model = self.repo.get_model_by_name(model_name)
            if model:
                model_id = model["model_id"]
            else:
                model_id = self.repo.create_model(model_name, description, tags)
                print(f"新建模型 model_id={model_id}")

            branch = self.repo.get_branch(model_id, branch_name)
            if branch:
                branch_id = branch["branch_id"]
                parent_commit_id = branch["head_commit_id"]
            else:
                branch_id = self.repo.create_branch(
                    model_id, branch_name, is_default=False,
                    description=f"Branch {branch_name}"
                )
                parent_commit_id = None
                print(f"新建分支 branch_id={branch_id}")

            object_key = self._prepare_and_upload(model_id, branch_name, model_path)

            commit_id = self.repo.create_commit(
                model_id, message, author, self.bucket_name, object_key
            )

            if parent_commit_id:
                self.repo.add_commit_parent(commit_id, parent_commit_id)

            self.repo.update_branch_head(branch_id, commit_id)

            print(f"模型导入成功: commit_id={commit_id}")
            return commit_id

        except Exception as e:
            if 'object_key' in locals():
                self.repo.storage_delete(object_key, self.bucket_name)
            raise e

    def _prepare_and_upload(self, model_id: int, branch_name: str, model_path: str) -> str:
        """上传单个 .py 模型定义文件，返回 object_key"""
        import time
        timestamp = int(time.time())
        object_key = f"{model_id}/{branch_name}/{timestamp}.py"

        success = self.repo.storage_upload(model_path, object_key, self.bucket_name)
        if not success:
            raise RuntimeError("文件上传失败")
        print(f"已上传至 MinIO: {object_key}")
        return object_key