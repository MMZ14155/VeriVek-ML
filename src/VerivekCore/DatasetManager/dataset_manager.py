from typing import List, Dict, Optional
import tempfile
import time
import shutil
import os
import zipfile
from threading import Thread
from ..Database.db_client import DbClient
from ..Database.dataset_repository import DatasetRepository
from .dataset_importer import DatasetImporter
from .preprocess_executor import PreprocessExecutor

class DatasetManager:
    def __init__(self, db_client: DbClient):
        self.db_client = db_client
        self.repo = DatasetRepository(db_client)
        self.bucket_name = "verivek-datasets"
        self.importer = DatasetImporter(self.repo, self.bucket_name)
        self.preprocess_executor = PreprocessExecutor(db_client)

    # 获取数据集列表
    def list_datasets(
            self,
            tag_filter: Optional[str] = None
    ) -> List[Dict]:
        return self.repo.list_datasets(tag_filter)

    # 获取数据集详情
    def get_dataset_detail(self, dataset_id: int) -> Dict:
        dataset = self.repo.get_dataset_by_id(dataset_id)
        if not dataset:
            raise ValueError(f"数据集 {dataset_id} 不存在")

        versions = self.repo.list_dataset_versions(dataset_id)

        return {
            "dataset_id": dataset_id,
            "dataset": dataset,
            "versions": versions,
            "version_count": len(versions)
        }

    def import_dataset(
            self,
            dataset_name: str,
            source_path: str,
            format: str = "auto",
            tags: str = "",
            description: str = "",
            message: str = "数据导入",
            created_by: int = 0,
            compression_format: str = "zip",
            visibility: str = "private") -> int:
        return self.importer.import_dataset(
            dataset_name=dataset_name,
            source_path=source_path,
            format=format,
            tags=tags,
            description=description,
            message=message,
            created_by=created_by,
            visibility=visibility
        )

    def append_patch(
            self,
            dataset_id: int,
            source_path: str,
            message: str = "追加数据",
            created_by: int = 0,
            update_mode: str = "append"
    ) -> int:
        dataset = self.repo.get_dataset_by_id(dataset_id)
        if not dataset:
            raise ValueError(f"数据集 {dataset_id} 不存在")

        return self.importer.import_dataset(
            dataset_name=dataset["dataset_name"],
            source_path=source_path,
            format=dataset.get("format", "auto"),
            tags=dataset.get("tags", ""),
            description=dataset.get("description", ""),
            message=message,
            created_by=created_by
        )

    # 根据id查询数据集信息
    def get_dataset_by_id(
            self,
            dataset_id: int
    ) -> Optional[Dict]:
        return self.repo.get_dataset_by_id(dataset_id)

    # 按时间正序获取数据集的 Patch 历史
    def get_dataset_patches(
            self,
            dataset_id: int
    ) -> List[Dict]:
        dataset = self.repo.get_dataset_by_id(dataset_id)
        if not dataset:
            return []

        head_version_id = dataset.get("head_version_id")
        if not head_version_id:
            return []

        history = self.repo.get_version_history(head_version_id, limit=100)

        patches = []
        for idx, item in enumerate(reversed(history)):
            full_version = self.repo.get_version(item["version_id"])
            if full_version:
                patches.append({
                    "patch_id": full_version["version_id"],
                    "version_id": full_version["version_id"],  # 兼容前端使用的字段
                    "version_number": idx + 1,  # P1, P2, P3...
                    "parent_patch_id": full_version["parent_version_id"],
                    "created_at": full_version["created_at"].isoformat() if hasattr(
                        full_version["created_at"],
                        'isoformat'
                    ) else str(
                        full_version["created_at"]
                    ),
                    "rows_count": full_version["cumulative_rows"],
                    "added_rows": full_version["added_rows"],
                    "size_bytes": full_version["uncompressed_size_bytes"],
                    "added_size_bytes": full_version["added_size_bytes"],
                    "message": full_version["message"],
                    "created_by": full_version["created_by"],
                    "checksum": full_version["checksum_sha256"][:8] + "..."
                })

        return patches

    def preprocess_dataset(
            self,
            dataset_id: int,
            name: str,
            script_path: str,
            source_version_id: Optional[int] = None,
            parent_preprocessed_id: Optional[int] = None,
            config: Optional[Dict] = None,
            created_by: int = 0
    ) -> int:
        """
        创建预处理任务并异步执行
        【当前】parent_preprocessed_id 仅用于内部测试，API 层当前不传
        """
        if parent_preprocessed_id is not None:
            parent = self.repo.get_preprocessed(parent_preprocessed_id)
            if not parent:
                raise ValueError(f"父预处理节点 {parent_preprocessed_id} 不存在")
            if parent['dataset_id'] != dataset_id:
                raise ValueError("链式预处理必须在同一数据集内进行")

        ts = int(time.time())
        script_key = None
        if script_path and os.path.exists(script_path):
            script_key = f"{dataset_id}/scripts/{name}_{ts}.py"
            if not self.repo.storage_upload(script_path, script_key):
                raise RuntimeError("脚本上传失败")

        # 初始data_key，执行完成后会更新
        data_key = f"{dataset_id}/preprocessed/{name}_{ts}.zip"

        preprocessed_id = self.repo.create_preprocessed(
            dataset_id=dataset_id,
            name=name,
            source_version_id=source_version_id,
            parent_preprocessed_id=parent_preprocessed_id,
            script_object_key=script_key,
            data_object_key=data_key,
            preprocessing_config=config or {},
            created_by=created_by
        )

        # 异步执行预处理脚本
        def run_preprocess_async():
            """在后台线程中执行预处理"""
            try:
                result = self.preprocess_executor.execute_preprocess(
                    preprocessed_id=preprocessed_id,
                    dataset_id=dataset_id,
                    source_version_id=source_version_id,
                    script_object_key=script_key,
                    progress_callback=lambda msg, pct: print(f"[Preprocess {preprocessed_id}] {msg} ({pct}%)")
                )
                if result['success']:
                    print(f"[Preprocess {preprocessed_id}] 执行成功: {result['output_path']}")
                else:
                    print(f"[Preprocess {preprocessed_id}] 执行失败: {result['error']}")
            except Exception as e:
                print(f"[Preprocess {preprocessed_id}] 执行异常: {e}")
                import traceback
                traceback.print_exc()

        # 启动后台线程执行预处理
        preprocess_thread = Thread(target=run_preprocess_async, daemon=True)
        preprocess_thread.start()

        return preprocessed_id

    def get_preprocessed_versions(self, dataset_id: int) -> List[Dict]:
        """获取预处理版本列表"""
        return self.repo.list_preprocessed(dataset_id)

    def get_preprocessed_detail(self, preprocessed_id: int) -> Dict:
        """获取预处理详情"""
        result = self.repo.get_preprocessed(preprocessed_id)
        if result:
            result['lineage'] = self.repo.get_preprocessed_lineage(preprocessed_id)
        return result

    def get_preprocessed_lineage(self, preprocessed_id: int) -> List[Dict]:
        """获取预处理谱系"""
        return self.repo.get_preprocessed_lineage(preprocessed_id)

    def extract_dataset_version(
            self,
            dataset_id: int,
            version_id: int,
            extract_path: Optional[str] = None) -> str:
        """解压数据集版本到本地"""
        version = self.repo.get_version(version_id)
        if not version or version["dataset_id"] != dataset_id:
            raise ValueError("版本不存在或不属于该数据集")

        temp_dir = tempfile.mkdtemp(prefix=f"dataset_{dataset_id}_")
        zip_path = os.path.join(temp_dir, "data.zip")

        try:
            self.db_client.s3_client.download_file(
                version["bucket_name"],
                version["object_key"],
                zip_path
            )

            if extract_path is None:
                extract_path = os.path.join(temp_dir, "extracted")

            with zipfile.ZipFile(zip_path, 'r') as zf:
                zf.extractall(extract_path)

            return extract_path

        except Exception as e:
            shutil.rmtree(temp_dir, ignore_errors=True)
            raise RuntimeError(f"解压失败: {e}")

    def delete_dataset(self, dataset_id: int) -> None:
        """删除数据集及其所有版本"""
        versions = self.repo.list_dataset_versions(dataset_id)
        for v in versions:
            if v.get("object_key"):
                self.repo.storage_delete(v["object_key"], self.bucket_name)
        self.repo.delete_dataset(dataset_id)

    def rollback_to_version(self, dataset_id: int, target_version_id: int) -> None:
        """回滚到指定版本"""
        target = self.repo.get_version(target_version_id)
        if not target or target["dataset_id"] != dataset_id:
            raise ValueError("目标版本不存在或不属于该数据集")

        self.repo.update_dataset_stats(
            dataset_id=dataset_id,
            head_version_id=target_version_id,
            total_rows=target["cumulative_rows"],
            total_size_bytes=target["cumulative_rows"] * target["uncompressed_size_bytes"] // target["added_rows"] if
            target["added_rows"] > 0 else 0
        )

    def get_version_history(self, dataset_id: int,
                            start_version_id: Optional[int] = None) -> List[Dict]:
        """获取版本历史"""
        dataset = self.repo.get_dataset_by_id(dataset_id)
        if not dataset:
            raise ValueError(f"数据集 {dataset_id} 不存在")

        if start_version_id:
            return self.repo.get_version_history(start_version_id)
        elif dataset.get("head_version_id"):
            return self.repo.get_version_history(dataset["head_version_id"])
        else:
            return []

    def compare_versions(self, version_id_1: int, version_id_2: int) -> Dict:
        """比较两个版本"""
        v1 = self.repo.get_version(version_id_1)
        v2 = self.repo.get_version(version_id_2)

        if not v1 or not v2:
            raise ValueError("版本不存在")

        if v1["dataset_id"] != v2["dataset_id"]:
            raise ValueError("无法比较不同数据集版本")

        return {
            "version_1": v1["version_id"],
            "version_2": v2["version_id"],
            "rows_diff": v2["cumulative_rows"] - v1["cumulative_rows"],
            "size_diff": v2["uncompressed_size_bytes"] - v1["uncompressed_size_bytes"],
            "compression_ratio_1": v1["compressed_size_bytes"] / v1["uncompressed_size_bytes"] if v1["uncompressed_size_bytes"] > 0 else 1,
            "compression_ratio_2": v2["compressed_size_bytes"] / v2["uncompressed_size_bytes"] if v2["uncompressed_size_bytes"] > 0 else 1
        }