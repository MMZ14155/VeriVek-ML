import ast
import importlib.util
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

    @staticmethod
    def validate_model_file(model_path: str) -> dict:
        """
        校验模型文件的语法和可导入性
        返回: {'valid': bool, 'class_name': str, 'error': str, 'warnings': list}
        """
        result = {'valid': False, 'class_name': None, 'error': None, 'warnings': []}

        # 1. 语法校验 (AST解析)
        try:
            with open(model_path, 'r', encoding='utf-8') as f:
                source = f.read()
            tree = ast.parse(source)
        except SyntaxError as e:
            result['error'] = f"语法错误 (第{e.lineno}行): {e.msg}"
            return result
        except Exception as e:
            result['error'] = f"文件读取失败: {str(e)}"
            return result

        # 2. 检查是否包含 nn.Module 子类
        module_classes = []
        for node in ast.walk(tree):
            if isinstance(node, ast.ClassDef):
                for base in node.bases:
                    base_name = None
                    if isinstance(base, ast.Name):
                        base_name = base.id
                    elif isinstance(base, ast.Attribute):
                        base_name = base.attr
                    if base_name in ('Module', 'nn.Module'):
                        module_classes.append(node.name)

        if not module_classes:
            result['error'] = "未找到继承自 nn.Module 的类定义"
            return result

        result['class_name'] = module_classes[0]
        if len(module_classes) > 1:
            result['warnings'].append(f"发现多个 nn.Module 子类，将使用第一个: {module_classes[0]}")

        # 3. 尝试动态导入并实例化
        try:
            spec = importlib.util.spec_from_file_location("verivek_model_temp", model_path)
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            model_class = getattr(module, result['class_name'])
            instance = model_class()
            # 检查 forward 方法是否存在
            if not hasattr(instance, 'forward'):
                result['warnings'].append("模型类缺少 forward 方法")
        except Exception as e:
            result['error'] = f"动态导入失败: {str(e)}"
            return result

        result['valid'] = True
        return result

    def import_model(self, model_name: str, branch_name: str, model_path: str,
                     message: str = "", author: int = 0, tags: str = "",
                     description: str = "", visibility: str = "private") -> int:

        validation = self.validate_model_file(model_path)

        try:
            model = self.repo.get_model_by_name(model_name, owner_id=author)
            if model:
                model_id = model["model_id"]
            else:
                model_id = self.repo.create_model(model_name, description, tags, visibility, owner_id=author)
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