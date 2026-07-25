from typing import Optional, Dict
import os
import hashlib
import time
import zipfile
import tempfile
from pathlib import Path
from ..Database.dataset_repository import DatasetRepository

class DatasetImporter:
    def __init__(self, repo: DatasetRepository, bucket_name: str):
        self.repo = repo
        self.bucket_name = bucket_name

    def import_dataset(
            self,
            dataset_name: str,
            source_path: str,
            format: str = "auto",
            tags: str = "",
            description: str = "",
            message: str = "数据导入",
            created_by: int = 0,
            visibility: str = "private"
    ) -> int:

        existing = self.repo.get_dataset(dataset_name)

        if existing:
            dataset_id = existing["dataset_id"]
            parent_version_id = existing["head_version_id"]
            cumulative_rows_before = existing["total_rows"]
            existing_total_size = existing["total_size_bytes"]
        else:
            dataset_id = self.repo.create_dataset(dataset_name, description, format, tags, visibility, owner_id=created_by)
            parent_version_id = None
            cumulative_rows_before = 0
            existing_total_size = 0

        temp_zip_path = None
        try:
            # 准备文件（打包或直接读取）
            if os.path.isdir(source_path):
                temp_zip_path = self._pack_folder_to_zip(source_path)
                zip_path = temp_zip_path
                uncompressed_size = self._calc_folder_size(source_path)
            elif os.path.isfile(source_path) and source_path.endswith('.zip'):
                zip_path = source_path
                uncompressed_size = self._estimate_uncompressed_size(source_path)
            else:
                raise ValueError("source_path 必须是文件夹或 .zip 文件")

            # 计算元数据
            compressed_size = os.path.getsize(zip_path)
            sha256_hash = self._calculate_sha256(zip_path)
            added_rows = self._count_samples(source_path, format)
            cumulative_rows = cumulative_rows_before + added_rows

            # 上传到对象存储
            timestamp = int(time.time())
            object_key = f"{dataset_id}/{timestamp}.zip"

            success = self.repo.storage_upload(zip_path, object_key, self.bucket_name)
            if not success:
                raise RuntimeError(f"上传失败: {object_key}")

            # 创建版本记录
            version_id = self.repo.create_version(
                dataset_id=dataset_id,
                parent_version_id=parent_version_id,
                bucket_name=self.bucket_name,
                object_key=object_key,
                compression_format="zip",
                compressed_size_bytes=compressed_size,
                uncompressed_size_bytes=uncompressed_size,
                checksum_sha256=sha256_hash,
                added_rows=added_rows,
                added_size_bytes=uncompressed_size,
                cumulative_rows=cumulative_rows,
                message=message,
                created_by=created_by
            )

            # 更新数据集统计
            self.repo.update_dataset_stats(
                dataset_id=dataset_id,
                head_version_id=version_id,
                total_rows=cumulative_rows,
                total_size_bytes=uncompressed_size + existing_total_size
            )

            return version_id

        finally:
            if temp_zip_path and os.path.exists(temp_zip_path):
                os.remove(temp_zip_path)

    def _pack_folder_to_zip(self, folder_path: str) -> str:
        """将文件夹打包为临时 zip 文件"""
        fd, temp_zip = tempfile.mkstemp(suffix='.zip', prefix='dataset_')
        os.close(fd)

        folder_path = Path(folder_path)
        with zipfile.ZipFile(temp_zip, 'w', zipfile.ZIP_DEFLATED) as zf:
            for file_path in folder_path.rglob('*'):
                if file_path.is_file():
                    arcname = file_path.relative_to(folder_path)
                    zf.write(file_path, arcname)

        return temp_zip

    def _calc_folder_size(self, folder_path: str) -> int:
        """计算文件夹总大小（字节）"""
        total_size = 0
        for dirpath, dirnames, filenames in os.walk(folder_path):
            for f in filenames:
                fp = os.path.join(dirpath, f)
                if os.path.exists(fp):
                    total_size += os.path.getsize(fp)
        return total_size

    def _count_samples(self, source_path: str, format: str) -> int:
        """根据格式统计样本数量"""
        if os.path.isfile(source_path) and source_path.endswith('.zip'):
            return self._count_samples_in_zip(source_path, format)

        if not os.path.isdir(source_path):
            return 1

        format_lower = format.lower()

        if format_lower in ['csv']:
            total_rows = 0
            for file_path in Path(source_path).rglob('*.csv'):
                with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                    lines = sum(1 for _ in f)
                    total_rows += max(0, lines - 1)
            return total_rows

        elif format_lower in ['json', 'jsonl']:
            if format_lower == 'jsonl':
                total_rows = 0
                for file_path in Path(source_path).rglob('*.jsonl'):
                    with open(file_path, 'r', encoding='utf-8') as f:
                        total_rows += sum(1 for _ in f)
                return total_rows
            else:
                return len(list(Path(source_path).rglob('*.json')))

        elif format_lower in ['image', 'image_folder', 'coco', 'yolo', 'voc']:
            image_exts = {'.jpg', '.jpeg', '.png', '.bmp', '.gif', '.tiff', '.webp'}
            count = 0
            for file_path in Path(source_path).rglob('*'):
                if file_path.is_file() and file_path.suffix.lower() in image_exts:
                    count += 1
            return count

        else:
            return len([f for f in Path(source_path).rglob('*') if f.is_file()])

    def _count_samples_in_zip(self, zip_path: str, format: str) -> int:
        """估算 zip 文件中的样本数"""
        try:
            with zipfile.ZipFile(zip_path, 'r') as zf:
                file_list = zf.namelist()
                format_lower = format.lower()

                if format_lower in ['csv']:
                    csv_files = [f for f in file_list if f.endswith('.csv')]
                    return len(csv_files) * 1000
                elif format_lower in ['image', 'image_folder', 'coco', 'yolo']:
                    image_exts = ('.jpg', '.jpeg', '.png', '.bmp', '.gif')
                    return len([f for f in file_list if f.lower().endswith(image_exts)])
                else:
                    return len(file_list)
        except:
            return 0

    def _estimate_uncompressed_size(self, zip_path: str) -> int:
        """估算 zip 文件解压后的大小"""
        try:
            with zipfile.ZipFile(zip_path, 'r') as zf:
                return sum(info.file_size for info in zf.infolist())
        except:
            return 0

    def _calculate_sha256(self, file_path: str) -> str:
        """计算文件 SHA256 哈希"""
        sha256_hash = hashlib.sha256()
        with open(file_path, "rb") as f:
            for byte_block in iter(lambda: f.read(4096), b""):
                sha256_hash.update(byte_block)
        return sha256_hash.hexdigest()