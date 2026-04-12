from typing import List, Dict, Optional, Any
import os
import time
import hashlib
import tempfile
from ..Database.db_client import DbClient
from ..Database.training_repository import TrainingRepository


class TrainingManager:
    def __init__(self, db_client: DbClient):
        self.db_client = db_client
        self.repo = TrainingRepository(db_client)

    def create_training(
            self,
            training_name: str,
            model_commit_id: int,
            hyperparameters: Dict[str, Any],
            dataset_id: Optional[int] = None,
            preprocessed_id: Optional[int] = None,
            description: str = "",
            created_by: int = 0,
            branch_id: Optional[int] = None,
            gpu_type: str = "",
            gpu_count: int = 0
    ) -> int:
        """创建新的训练任务"""
        training_id = self.repo.create_training(
            training_name=training_name,
            model_commit_id=model_commit_id,
            hyperparameters=hyperparameters,
            dataset_id=dataset_id,
            preprocessed_id=preprocessed_id,
            description=description,
            created_by=created_by,
            branch_id=branch_id,
            gpu_type=gpu_type,
            gpu_count=gpu_count
        )
        print(f"训练任务创建成功: training_id={training_id}")
        return training_id

    def start_training(self, training_id: int) -> None:
        """标记训练开始"""
        self.repo.update_training_status(training_id, status='running')
        print(f"训练 {training_id} 开始")

    def update_metrics(
            self,
            training_id: int,
            metrics: Dict[str, Any]
    ) -> None:
        """更新训练过程中的指标"""
        self.repo.update_training_status(training_id, status='running', metrics=metrics)

    def complete_training(
            self,
            training_id: int,
            final_metrics: Dict[str, Any],
            compute_time_seconds: int
    ) -> None:
        """标记训练完成，设置最终指标"""
        self.repo.update_training_status(training_id, status='completed')
        self.repo.update_final_metrics(training_id, final_metrics, compute_time_seconds)
        print(f"训练 {training_id} 完成")

    def fail_training(
            self,
            training_id: int,
            error_message: str,
            exit_code: int = -1
    ) -> None:
        """标记训练失败"""
        self.repo.update_training_status(
            training_id, status='failed',
            error_message=error_message, exit_code=exit_code
        )
        print(f"训练 {training_id} 失败: {error_message}")

    def cancel_training(self, training_id: int) -> None:
        """取消训练"""
        self.repo.update_training_status(training_id, status='cancelled')
        print(f"训练 {training_id} 已取消")

    def save_checkpoint(
            self,
            training_id: int,
            weight_path: str,
            epoch_number: int,
            step_number: Optional[int] = None,
            global_step: Optional[int] = None,
            metrics_snapshot: Optional[Dict] = None,
            note: str = "",
            is_best: bool = False
    ) -> Dict[str, int]:
        """
        保存训练检查点
        返回: {'checkpoint_id': int, 'best_id': int} (如果有best)
        """
        results = {}

        # 生成对象存储路径
        timestamp = int(time.time())
        weight_filename = os.path.basename(weight_path)
        object_key = f"{training_id}/{timestamp}_{weight_filename}"

        # 计算文件元数据
        size_bytes = os.path.getsize(weight_path)
        sha256_hash = self._calculate_sha256(weight_path)

        # 从文件名或路径推断格式
        format_ext = os.path.splitext(weight_path)[1].lower().lstrip('.')
        if format_ext in ['pt', 'pth', 'safetensors', 'h5', 'pb', 'onnx', 'checkpoint']:
            weight_format = format_ext
        else:
            weight_format = 'pt'  # 默认格式

        # 上传到对象存储
        if not self.repo.storage_upload(weight_path, object_key):
            raise RuntimeError(f"权重上传失败: {weight_path}")

        # 保存为 last 检查点 (覆盖)
        last_id = self.repo.create_weight(
            training_id=training_id,
            weight_type='last',
            epoch_number=epoch_number,
            object_key=object_key,
            format=weight_format,
            step_number=step_number,
            global_step=global_step,
            size_bytes=size_bytes,
            checksum_sha256=sha256_hash,
            metrics_snapshot=metrics_snapshot,
            note=note
        )
        results['checkpoint_id'] = last_id

        # 更新 training 的 checkpoint_weight_id
        self.repo.update_training_weights(training_id, checkpoint_weight_id=last_id)

        # 如果是最佳权重，同时保存为 best
        if is_best:
            best_id = self.repo.create_weight(
                training_id=training_id,
                weight_type='best',
                epoch_number=epoch_number,
                object_key=object_key,  # 复用同一个文件
                format=weight_format,
                step_number=step_number,
                global_step=global_step,
                size_bytes=size_bytes,
                checksum_sha256=sha256_hash,
                metrics_snapshot=metrics_snapshot,
                note=note or "Best checkpoint"
            )
            self.repo.update_training_weights(training_id, main_weight_id=best_id)
            results['best_id'] = best_id

        print(f"检查点保存成功: epoch={epoch_number}, key={object_key}")
        return results

    def get_training_detail(self, training_id: int) -> Dict:
        """获取训练详情，包含权重信息"""
        training = self.repo.get_training_by_id(training_id)
        if not training:
            raise ValueError(f"训练任务 {training_id} 不存在")

        weights = self.repo.get_weights_by_training(training_id)

        return {
            "training_id": training_id,
            "training": training,
            "weights": weights,
            "weight_count": len(weights)
        }

    def list_trainings(
            self,
            model_commit_id: Optional[int] = None,
            status_filter: Optional[str] = None
    ) -> List[Dict]:
        """列出训练任务"""
        return self.repo.list_trainings(model_commit_id, status_filter)

    def get_training_weights(self, training_id: int) -> List[Dict]:
        """获取训练任务的权重列表"""
        return self.repo.get_weights_by_training(training_id)

    def download_weight(
            self,
            weight_id: int,
            download_path: Optional[str] = None
    ) -> str:
        """下载权重到本地"""
        weight = self.repo.get_weight_by_id(weight_id)
        if not weight:
            raise ValueError(f"权重 {weight_id} 不存在")

        if download_path is None:
            download_path = tempfile.mktemp(suffix=f".{weight['format']}")

        self.db_client.s3_client.download_file(
            weight['bucket_name'],
            weight['object_key'],
            download_path
        )
        return download_path

    def delete_training(self, training_id: int) -> None:
        """删除训练任务及相关权重"""
        # 获取所有需要清理的对象存储键
        object_keys = self.repo.get_weight_object_keys_by_training(training_id)

        # 清理 MinIO 对象
        for key in object_keys:
            self.repo.storage_delete(key)
            print(f"已清理 MinIO 对象: {key}")

        # 删除数据库记录
        self.repo.delete_training(training_id)
        print(f"训练 {training_id} 已删除")

    def resume_from_checkpoint(self, training_id: int) -> Optional[Dict]:
        """
        获取用于恢复训练的检查点信息
        如果训练未完成，返回 last 权重信息
        """
        training = self.repo.get_training_by_id(training_id)
        if not training:
            raise ValueError(f"训练任务 {training_id} 不存在")

        if training['status'] == 'completed':
            print(f"训练 {training_id} 已完成，无法恢复")
            return None

        weights = self.repo.get_weights_by_training(training_id)
        last_weight = next((w for w in weights if w['weight_type'] == 'last'), None)

        if not last_weight:
            print(f"训练 {training_id} 没有检查点")
            return None

        return {
            "training_id": training_id,
            "training_name": training['training_name'],
            "hyperparameters": training['hyperparameters'],
            "checkpoint_weight": last_weight,
            "epoch_number": last_weight['epoch_number'],
            "metrics_snapshot": last_weight.get('metrics_snapshot', {})
        }

    def _calculate_sha256(self, file_path: str) -> str:
        """计算文件 SHA256 哈希"""
        sha256_hash = hashlib.sha256()
        with open(file_path, "rb") as f:
            for byte_block in iter(lambda: f.read(4096), b""):
                sha256_hash.update(byte_block)
        return sha256_hash.hexdigest()