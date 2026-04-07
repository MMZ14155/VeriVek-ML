from typing import List, Dict, Optional
import os
import hashlib
import time
import zipfile
import tempfile
import shutil
from pathlib import Path
from ..Database.db_client import DbClient
from ..Database.dataset_repository import DatasetRepository

class DatasetManager:
    def __init__(self, db_client: DbClient):
        self.db_client = db_client
        self.repo = DatasetRepository(db_client)
        self.bucket_name = "verivek-datasets"

    def list_datasets(self, tag_filter: Optional[str] = None) -> List[Dict]:
        with self.db_client.db_conn.cursor() as cur:
            cur.execute("""
                        SELECT d.dataset_id,
                               d.dataset_name,
                               d.description,
                               d.format,
                               d.tags,
                               d.total_rows,
                               d.total_size_bytes,
                               d.created_at,
                               d.head_version_id,
                               COUNT(v.version_id) as version_count
                        FROM datasets d
                                 LEFT JOIN dataset_versions v ON d.dataset_id = v.dataset_id
                        GROUP BY d.dataset_id
                        ORDER BY d.created_at DESC
                        """)

            datasets = []
            for row in cur.fetchall():
                dataset = {
                    "dataset_id": row[0], "dataset_name": row[1], "description": row[2],
                    "format": row[3], "tags": row[4], "total_rows": row[5],
                    "total_size_bytes": row[6], "created_at": row[7],
                    "head_version_id": row[8], "version_count": row[9]
                }
                if tag_filter and (not dataset["tags"] or tag_filter not in dataset["tags"]):
                    continue
                datasets.append(dataset)
            return datasets

    def get_dataset_detail(self, dataset_id: int) -> Dict:
        with self.db_client.db_conn.cursor() as cur:
            cur.execute(
                """SELECT dataset_id,
                          dataset_name,
                          description,
                          format,
                          tags,
                          head_version_id,
                          total_rows,
                          total_size_bytes,
                          created_at
                   FROM datasets
                   WHERE dataset_id = %s""",
                (dataset_id,)
            )
            row = cur.fetchone()
            if not row:
                raise ValueError(f"数据集 {dataset_id} 不存在")

            dataset = {
                "dataset_id": row[0], "dataset_name": row[1], "description": row[2],
                "format": row[3], "tags": row[4], "head_version_id": row[5],
                "total_rows": row[6], "total_size_bytes": row[7], "created_at": row[8]
            }

        versions = self.repo.list_dataset_versions(dataset_id)

        return {
            "dataset_id": dataset_id,
            "dataset": dataset,
            "versions": versions,
            "version_count": len(versions)
        }

    def import_dataset(self,
                       dataset_name: str,
                       source_path: str,
                       format: str = "auto",
                       tags: str = "",
                       description: str = "",
                       message: str = "数据导入",
                       created_by: str = "anonymous",
                       compression_format: str = "zip") -> int:

        existing = self.repo.get_dataset(dataset_name)

        if existing:
            dataset_id = existing["dataset_id"]
            parent_version_id = existing["head_version_id"]
            cumulative_rows_before = existing["total_rows"]
        else:
            dataset_id = self.repo.create_dataset(dataset_name, description, format, tags)
            parent_version_id = None
            cumulative_rows_before = 0

        temp_zip_path = None
        try:
            if os.path.isdir(source_path):
                temp_zip_path = self._pack_folder_to_zip(source_path)
                zip_path = temp_zip_path
                uncompressed_size = self._calc_folder_size(source_path)
            elif os.path.isfile(source_path) and source_path.endswith('.zip'):
                zip_path = source_path
                uncompressed_size = self._estimate_uncompressed_size(source_path)
            else:
                raise ValueError("source_path 必须是文件夹或 .zip 文件")

            compressed_size = os.path.getsize(zip_path)
            sha256_hash = self._calculate_sha256(zip_path)
            added_rows = self._count_samples(source_path, format)
            cumulative_rows = cumulative_rows_before + added_rows

            timestamp = int(time.time())
            object_key = f"{dataset_id}/{timestamp}.zip"

            success = self.repo.storage_upload(zip_path, object_key, self.bucket_name)
            if not success:
                raise RuntimeError(f"上传失败: {object_key}")

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

            self.repo.update_dataset_stats(
                dataset_id=dataset_id,
                head_version_id=version_id,
                total_rows=cumulative_rows,
                total_size_bytes=uncompressed_size + (existing["total_size_bytes"] if existing else 0)
            )

            return version_id

        finally:
            if temp_zip_path and os.path.exists(temp_zip_path):
                os.remove(temp_zip_path)

    def _pack_folder_to_zip(self, folder_path: str) -> str:
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
        total_size = 0
        for dirpath, dirnames, filenames in os.walk(folder_path):
            for f in filenames:
                fp = os.path.join(dirpath, f)
                if os.path.exists(fp):
                    total_size += os.path.getsize(fp)
        return total_size

    def _count_samples(self, source_path: str, format: str) -> int:
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
        try:
            with zipfile.ZipFile(zip_path, 'r') as zf:
                return sum(info.file_size for info in zf.infolist())
        except:
            return 0

    def extract_dataset_version(self,
                                dataset_id: int,
                                version_id: int,
                                extract_path: Optional[str] = None) -> str:

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
        versions = self.repo.list_dataset_versions(dataset_id)
        for v in versions:
            if v.get("object_key"):
                self.repo.storage_delete(v["object_key"], self.bucket_name)
        self.repo.delete_dataset(dataset_id)

    def rollback_to_version(self, dataset_id: int, target_version_id: int) -> None:
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
        dataset = self.get_dataset_detail(dataset_id)

        if start_version_id:
            return self.repo.get_version_history(start_version_id)
        elif dataset["dataset"]["head_version_id"]:
            return self.repo.get_version_history(dataset["dataset"]["head_version_id"])
        else:
            return []

    def compare_versions(self, version_id_1: int, version_id_2: int) -> Dict:
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
            "compression_ratio_1": v1["compressed_size_bytes"] / v1["uncompressed_size_bytes"] if v1[
                                                                                                      "uncompressed_size_bytes"] > 0 else 1,
            "compression_ratio_2": v2["compressed_size_bytes"] / v2["uncompressed_size_bytes"] if v2[
                                                                                                      "uncompressed_size_bytes"] > 0 else 1
        }

    def _calculate_sha256(self, file_path: str) -> str:
        sha256_hash = hashlib.sha256()
        with open(file_path, "rb") as f:
            for byte_block in iter(lambda: f.read(4096), b""):
                sha256_hash.update(byte_block)
        return sha256_hash.hexdigest()