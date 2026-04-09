from typing import List, Dict, Optional

from ..Database.db_client import DbClient
from ..Database.model_repository import ModelRepository
from .model_importer import ModelImporter

class ModelManager:
    def __init__(
            self,
            db_client: DbClient
    ):
        self.db_client = db_client
        self.repo = ModelRepository(db_client)
        self.importer = ModelImporter(db_client)

    def import_model(
            self,
            model_name: str,
            branch_name: str,
            model_path: str,
            message: str = "",
            author: str = "",
            **kwargs
    ) -> int:
        return self.importer.import_model(
            model_name, branch_name, model_path, message, author, **kwargs
        )

    def list_models(self) -> List[Dict]:
        """查询所有模型及分支数统计"""
        return self.repo.list_models()

    def get_model_detail(
            self,
            model_id: int
    ) -> Dict:
        """获取模型详情"""
        model = self.repo.get_model_by_id(model_id)
        if not model:
            model = {"model_id": model_id}

        branches = self.repo.list_model_branches(model_id)
        return {
            "model_id": model_id,
            "model": model,
            "branches": branches,
            "branch_count": len(branches)
        }

    def get_commit_history(
            self,
            model_id: int,
            branch_name: str
    ) -> List[Dict]:
        branch = self.repo.get_branch(model_id, branch_name)
        if not branch or not branch["head_commit_id"]:
            return []
        return self.repo.get_commit_history(branch["head_commit_id"])

    def create_branch(
            self,
            model_id: int,
            branch_name: str,
            description: str = "",
            base_commit_id: Optional[int] = None
    ) -> int:
        # 检查分支是否已存在
        existing = self.repo.get_branch(model_id, branch_name)
        if existing:
            raise ValueError(f"分支 '{branch_name}' 已存在")

        # 创建分支
        branch_id = self.repo.create_branch(
            model_id=model_id,
            branch_name=branch_name,
            is_default=False,
            description=description
        )

        # 如果指定了基础commit，更新分支head
        if base_commit_id:
            self.repo.update_branch_head(branch_id, base_commit_id)

        return branch_id

    def delete_model(
            self,
            model_id: int
    ) -> None:
        # 获取所有需要清理的对象存储键
        object_keys = self.repo.get_commit_object_keys_by_model_id(model_id)

        # 清理 MinIO 对象
        for key in object_keys:
            self.repo.storage_delete(key, "verivek-models")
            print(f"已清理 MinIO 对象: {key}")

        # 删除数据库记录
        self.repo.delete_model(model_id)
        print(f"模型 {model_id} 已删除")