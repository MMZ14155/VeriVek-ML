from typing import Optional, List, Dict
import psycopg2
from .db_client import DbClient

class DatasetRepository:
    def __init__(self, db_client: DbClient):
        self.db = db_client

    # 用数据集名称查询数据集
    def get_dataset(self, dataset_name: str) -> Optional[Dict]:
        with self.db.db_conn.cursor() as cur:
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
                   WHERE dataset_name = %s""",
                (dataset_name,)
            )
            row = cur.fetchone()
            if row:
                return {
                    "dataset_id": row[0], "dataset_name": row[1],
                    "description": row[2], "format": row[3], "tags": row[4],
                    "head_version_id": row[5], "total_rows": row[6],
                    "total_size_bytes": row[7], "created_at": row[8]
                }
            return None

    # 用数据集id查询数据集
    def get_dataset_by_id(self, dataset_id: int) -> Optional[Dict]:
        with self.db.db_conn.cursor() as cur:
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
            if row:
                return {
                    "dataset_id": row[0], "dataset_name": row[1],
                    "description": row[2], "format": row[3], "tags": row[4],
                    "head_version_id": row[5], "total_rows": row[6],
                    "total_size_bytes": row[7], "created_at": row[8]
                }
            return None

    # 获取数据集列表
    def list_datasets(self, tag_filter: Optional[str] = None) -> List[Dict]:
        with self.db.db_conn.cursor() as cur:
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

    def create_dataset(self, dataset_name: str, description: str = "",
                       format: str = "", tags: str = "") -> int:
        with self.db.db_conn.cursor() as cur:
            cur.execute(
                """INSERT INTO datasets (dataset_name, description, format, tags,
                                         total_rows, total_size_bytes)
                   VALUES (%s, %s, %s, %s, 0, 0)
                   RETURNING dataset_id""",
                (dataset_name, description, format, tags)
            )
            dataset_id = cur.fetchone()[0]
            self.db.db_conn.commit()
            return dataset_id

    def delete_dataset(self, dataset_id: int) -> List[Dict]:
        with self.db.db_conn.cursor() as cur:
            cur.execute(
                """SELECT version_id, object_key
                   FROM dataset_versions
                   WHERE dataset_id = %s""",
                (dataset_id,)
            )
            versions = cur.fetchall()
            cur.execute("DELETE FROM datasets WHERE dataset_id = %s", (dataset_id,))
            self.db.db_conn.commit()
            return [{"version_id": v[0], "object_key": v[1]} for v in versions]

    def update_dataset_stats(self, dataset_id: int, head_version_id: int,
                             total_rows: int, total_size_bytes: int) -> None:
        with self.db.db_conn.cursor() as cur:
            cur.execute(
                """UPDATE datasets
                   SET head_version_id  = %s,
                       total_rows       = %s,
                       total_size_bytes = %s,
                       updated_at       = CURRENT_TIMESTAMP
                   WHERE dataset_id = %s""",
                (head_version_id, total_rows, total_size_bytes, dataset_id)
            )
            self.db.db_conn.commit()

    def get_version(self, version_id: int) -> Optional[Dict]:
        with self.db.db_conn.cursor() as cur:
            cur.execute(
                """SELECT version_id,
                          dataset_id,
                          parent_version_id,
                          bucket_name,
                          object_key,
                          compression_format,
                          compressed_size_bytes,
                          uncompressed_size_bytes,
                          checksum_sha256,
                          added_rows,
                          added_size_bytes,
                          cumulative_rows,
                          message,
                          created_by,
                          created_at
                   FROM dataset_versions
                   WHERE version_id = %s""",
                (version_id,)
            )
            row = cur.fetchone()
            if row:
                return {
                    "version_id": row[0], "dataset_id": row[1], "parent_version_id": row[2],
                    "bucket_name": row[3], "object_key": row[4],
                    "compression_format": row[5], "compressed_size_bytes": row[6],
                    "uncompressed_size_bytes": row[7], "checksum_sha256": row[8],
                    "added_rows": row[9], "added_size_bytes": row[10],
                    "cumulative_rows": row[11], "message": row[12],
                    "created_by": row[13], "created_at": row[14]
                }
            return None

    def create_version(self, dataset_id: int, parent_version_id: Optional[int],
                       bucket_name: str, object_key: str,
                       compression_format: str, compressed_size_bytes: int,
                       uncompressed_size_bytes: int, checksum_sha256: str,
                       added_rows: int, added_size_bytes: int, cumulative_rows: int,
                       message: str = "", created_by: str = "") -> int:
        with self.db.db_conn.cursor() as cur:
            cur.execute(
                """INSERT INTO dataset_versions
                   (dataset_id, parent_version_id, bucket_name, object_key,
                    compression_format, compressed_size_bytes, uncompressed_size_bytes,
                    checksum_sha256, added_rows, added_size_bytes, cumulative_rows,
                    message, created_by)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                   RETURNING version_id""",
                (dataset_id, parent_version_id, bucket_name, object_key,
                 compression_format, compressed_size_bytes, uncompressed_size_bytes,
                 checksum_sha256, added_rows, added_size_bytes, cumulative_rows,
                 message, created_by)
            )
            version_id = cur.fetchone()[0]
            self.db.db_conn.commit()
            return version_id

    def list_dataset_versions(self, dataset_id: int) -> List[Dict]:
        with self.db.db_conn.cursor() as cur:
            cur.execute(
                """SELECT version_id,
                          parent_version_id,
                          compression_format,
                          compressed_size_bytes,
                          cumulative_rows,
                          message,
                          created_by,
                          created_at
                   FROM dataset_versions
                   WHERE dataset_id = %s
                   ORDER BY created_at DESC""",
                (dataset_id,)
            )
            return [
                {
                    "version_id": r[0], "parent_version_id": r[1],
                    "compression_format": r[2], "compressed_size_bytes": r[3],
                    "cumulative_rows": r[4], "message": r[5],
                    "created_by": r[6], "created_at": r[7]
                }
                for r in cur.fetchall()
            ]

    def get_version_history(self, version_id: int, limit: int = 100) -> List[Dict]:
        with self.db.db_conn.cursor() as cur:
            cur.execute("""
                        WITH RECURSIVE version_lineage AS (SELECT version_id,
                                                                  parent_version_id,
                                                                  message,
                                                                  created_by,
                                                                  created_at,
                                                                  checksum_sha256,
                                                                  added_rows,
                                                                  cumulative_rows,
                                                                  0 as depth
                                                           FROM dataset_versions
                                                           WHERE version_id = %s

                                                           UNION

                                                           SELECT v.version_id,
                                                                  v.parent_version_id,
                                                                  v.message,
                                                                  v.created_by,
                                                                  v.created_at,
                                                                  v.checksum_sha256,
                                                                  v.added_rows,
                                                                  v.cumulative_rows,
                                                                  vl.depth + 1
                                                           FROM dataset_versions v
                                                                    INNER JOIN version_lineage vl ON v.version_id = vl.parent_version_id
                                                           WHERE vl.depth < %s)
                        SELECT *
                        FROM version_lineage
                        ORDER BY depth ASC
                        """, (version_id, limit))

            return [
                {
                    "version_id": r[0], "parent_version_id": r[1], "message": r[2],
                    "created_by": r[3], "created_at": r[4], "checksum_sha256": r[5],
                    "added_rows": r[6], "cumulative_rows": r[7], "depth": r[8]
                }
                for r in cur.fetchall()
            ]

    def storage_upload(self, local_path: str, object_key: str,
                       bucket: str = "verivek-datasets") -> bool:
        try:
            self.db.s3_client.upload_file(local_path, bucket, object_key)
            return True
        except Exception as e:
            print(f"上传失败: {e}")
            return False

    def storage_delete(self, object_key: str, bucket: str = "verivek-datasets") -> bool:
        try:
            self.db.s3_client.delete_object(Bucket=bucket, Key=object_key)
            return True
        except Exception as e:
            print(f"删除失败: {e}")
            return False