from typing import Optional, List, Dict, Any
import json
from .db_client import DbClient

class TrainingRepository:
    def __init__(self, db_client: DbClient):
        self.db = db_client
        self.bucket_name = "verivek-weights"

    def can_access_training(self, user_id: int, training_id: int) -> bool:
        """检查用户是否有权访问训练任务"""
        with self.db.db_conn.cursor() as cur:
            cur.execute("SELECT can_access_training(%s, %s)", (user_id, training_id))
            return cur.fetchone()[0]

    def can_modify_training(self, user_id: int, training_id: int) -> bool:
        """检查用户是否有权修改训练任务"""
        with self.db.db_conn.cursor() as cur:
            cur.execute("SELECT can_modify_training(%s, %s)", (user_id, training_id))
            return cur.fetchone()[0]

    def get_training_by_id(self, training_id: int) -> Optional[Dict]:
        """通过ID获取训练任务详情"""
        with self.db.db_conn.cursor() as cur:
            cur.execute("""
                        SELECT training_id,
                               training_name,
                               description,
                               created_by,
                               model_commit_id,
                               branch_id,
                               dataset_id,
                               preprocessed_id,
                               hyperparameters,
                               status,
                               metrics,
                               final_metrics,
                               main_weight_id,
                               checkpoint_weight_id,
                               compute_time_seconds,
                               gpu_type,
                               gpu_count,
                               started_at,
                               completed_at,
                               error_message,
                               exit_code,
                               created_at,
                               updated_at
                        FROM trainings
                        WHERE training_id = %s
                        """, (training_id,))
            row = cur.fetchone()
            if row:
                return {
                    "training_id": row[0], "training_name": row[1], "description": row[2],
                    "created_by": row[3], "model_commit_id": row[4], "branch_id": row[5],
                    "dataset_id": row[6], "preprocessed_id": row[7],
                    "hyperparameters": row[8], "status": row[9], "metrics": row[10],
                    "final_metrics": row[11], "main_weight_id": row[12], "checkpoint_weight_id": row[13],
                    "compute_time_seconds": row[14], "gpu_type": row[15], "gpu_count": row[16],
                    "started_at": row[17], "completed_at": row[18], "error_message": row[19],
                    "exit_code": row[20], "created_at": row[21], "updated_at": row[22]
                }
            return None

    def list_trainings(
            self,
            model_commit_id: Optional[int] = None,
            status_filter: Optional[str] = None
    ) -> List[Dict]:
        """查询训练任务列表"""
        with self.db.db_conn.cursor() as cur:
            sql = """
                  SELECT training_id, \
                         training_name, \
                         created_by, \
                         model_commit_id,
                         dataset_id,
                         preprocessed_id,
                         status, \
                         started_at, \
                         completed_at, \
                         created_at
                  FROM trainings
                  WHERE 1 = 1 \
                  """
            params = []

            if model_commit_id:
                sql += " AND model_commit_id = %s"
                params.append(model_commit_id)

            if status_filter:
                sql += " AND status = %s"
                params.append(status_filter)

            sql += " ORDER BY created_at DESC"

            cur.execute(sql, params)
            return [
                {
                    "training_id": r[0], "training_name": r[1], "created_by": r[2],
                    "model_commit_id": r[3], "dataset_id": r[4], "preprocessed_id": r[5],
                    "status": r[6], "started_at": r[7],
                    "completed_at": r[8], "created_at": r[9]
                }
                for r in cur.fetchall()
            ]

    def get_training_trends(self, days: int = 7) -> List[Dict]:
        """查询最近 N 天每天的训练统计（按 created_at 日期分组）"""
        with self.db.db_conn.cursor() as cur:
            cur.execute("""
                SELECT
                    DATE(created_at) AS date,
                    COUNT(*) AS total_count,
                    COUNT(*) FILTER (WHERE status = 'completed') AS completed_count
                FROM trainings
                WHERE created_at >= CURRENT_DATE - INTERVAL '%s days'
                GROUP BY DATE(created_at)
                ORDER BY date ASC
            """, (days,))
            return [
                {
                    "date": str(r[0]),
                    "total_count": r[1],
                    "completed_count": r[2]
                }
                for r in cur.fetchall()
            ]

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
        """创建训练任务"""
        with self.db.db_conn.cursor() as cur:
            cur.execute("""
                        INSERT INTO trainings (
                            training_name, description, created_by, model_commit_id,
                            branch_id, dataset_id, preprocessed_id, hyperparameters, 
                            status, gpu_type, gpu_count
                        )
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 'pending', %s, %s)
                        RETURNING training_id
                        """, (training_name, description, created_by, model_commit_id,
                              branch_id, dataset_id, preprocessed_id, json.dumps(hyperparameters),
                              gpu_type, gpu_count))
            training_id = cur.fetchone()[0]
            self.db.db_conn.commit()
            return training_id

    def update_training_status(
            self,
            training_id: int,
            status: str,
            metrics: Optional[Dict] = None,
            error_message: str = "",
            exit_code: Optional[int] = None
    ) -> None:
        """更新训练状态"""
        with self.db.db_conn.cursor() as cur:
            if status == 'running':
                cur.execute("""
                            UPDATE trainings
                            SET status     = %s,
                                started_at = CURRENT_TIMESTAMP,
                                updated_at = CURRENT_TIMESTAMP
                            WHERE training_id = %s
                            """, (status, training_id))
            elif status in ['completed', 'failed', 'cancelled']:
                cur.execute("""
                            UPDATE trainings
                            SET status       = %s,
                                completed_at = CURRENT_TIMESTAMP,
                                updated_at   = CURRENT_TIMESTAMP
                            WHERE training_id = %s
                            """, (status, training_id))
            else:
                cur.execute("""
                            UPDATE trainings
                            SET status     = %s,
                                updated_at = CURRENT_TIMESTAMP
                            WHERE training_id = %s
                            """, (status, training_id))

            if metrics:
                cur.execute("""
                            UPDATE trainings
                            SET metrics = %s
                            WHERE training_id = %s
                            """, (json.dumps(metrics), training_id))

            if error_message:
                cur.execute("""
                            UPDATE trainings
                            SET error_message = %s
                            WHERE training_id = %s
                            """, (error_message, training_id))

            if exit_code is not None:
                cur.execute("""
                            UPDATE trainings
                            SET exit_code = %s
                            WHERE training_id = %s
                            """, (exit_code, training_id))

            self.db.db_conn.commit()

    def update_final_metrics(
            self,
            training_id: int,
            final_metrics: Dict[str, Any],
            compute_time_seconds: int
    ) -> None:
        """更新最终指标和计算时间"""
        with self.db.db_conn.cursor() as cur:
            cur.execute("""
                        UPDATE trainings
                        SET final_metrics        = %s,
                            compute_time_seconds = %s,
                            updated_at           = CURRENT_TIMESTAMP
                        WHERE training_id = %s
                        """, (json.dumps(final_metrics), compute_time_seconds, training_id))
            self.db.db_conn.commit()

    def update_training_weights(
            self,
            training_id: int,
            main_weight_id: Optional[int] = None,
            checkpoint_weight_id: Optional[int] = None
    ) -> None:
        """更新训练关联的权重ID"""
        with self.db.db_conn.cursor() as cur:
            if main_weight_id:
                cur.execute("""
                            UPDATE trainings
                            SET main_weight_id = %s
                            WHERE training_id = %s
                            """, (main_weight_id, training_id))
            if checkpoint_weight_id:
                cur.execute("""
                            UPDATE trainings
                            SET checkpoint_weight_id = %s
                            WHERE training_id = %s
                            """, (checkpoint_weight_id, training_id))
            self.db.db_conn.commit()

    def delete_training(self, training_id: int) -> None:
        """删除训练任务（级联删除权重）"""
        with self.db.db_conn.cursor() as cur:
            cur.execute("DELETE FROM trainings WHERE training_id = %s", (training_id,))
            self.db.db_conn.commit()

    # ============== Weight Methods ==============

    def create_weight(
            self,
            training_id: int,
            weight_type: str,  # 'best' or 'last'
            epoch_number: int,
            object_key: str,
            format: str = "pt",
            step_number: Optional[int] = None,
            global_step: Optional[int] = None,
            size_bytes: Optional[int] = None,
            checksum_sha256: str = "",
            metrics_snapshot: Optional[Dict] = None,
            note: str = ""
    ) -> int:
        """创建权重记录"""
        with self.db.db_conn.cursor() as cur:
            cur.execute("""
                        INSERT INTO training_weights (training_id, weight_type, epoch_number, step_number,
                                                      global_step, bucket_name, object_key, format,
                                                      size_bytes, checksum_sha256, metrics_snapshot, note)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                        ON CONFLICT (training_id, weight_type) DO UPDATE SET epoch_number     = EXCLUDED.epoch_number,
                                                                             step_number      = EXCLUDED.step_number,
                                                                             global_step      = EXCLUDED.global_step,
                                                                             object_key       = EXCLUDED.object_key,
                                                                             format           = EXCLUDED.format,
                                                                             size_bytes       = EXCLUDED.size_bytes,
                                                                             checksum_sha256  = EXCLUDED.checksum_sha256,
                                                                             metrics_snapshot = EXCLUDED.metrics_snapshot,
                                                                             note             = EXCLUDED.note,
                                                                             created_at       = CURRENT_TIMESTAMP
                        RETURNING weight_id
                        """, (training_id, weight_type, epoch_number, step_number, global_step,
                              self.bucket_name, object_key, format, size_bytes, checksum_sha256,
                              json.dumps(metrics_snapshot) if metrics_snapshot else '{}', note))
            weight_id = cur.fetchone()[0]
            self.db.db_conn.commit()
            return weight_id

    def get_weight_by_id(self, weight_id: int) -> Optional[Dict]:
        """获取权重详情"""
        with self.db.db_conn.cursor() as cur:
            cur.execute("""
                        SELECT weight_id,
                               training_id,
                               weight_type,
                               epoch_number,
                               step_number,
                               global_step,
                               bucket_name,
                               object_key,
                               format,
                               size_bytes,
                               checksum_sha256,
                               metrics_snapshot,
                               note,
                               created_at
                        FROM training_weights
                        WHERE weight_id = %s
                        """, (weight_id,))
            row = cur.fetchone()
            if row:
                return {
                    "weight_id": row[0], "training_id": row[1], "weight_type": row[2],
                    "epoch_number": row[3], "step_number": row[4], "global_step": row[5],
                    "bucket_name": row[6], "object_key": row[7], "format": row[8],
                    "size_bytes": row[9], "checksum_sha256": row[10],
                    "metrics_snapshot": row[11], "note": row[12], "created_at": row[13]
                }
            return None

    def get_weights_by_training(self, training_id: int) -> List[Dict]:
        """获取训练任务的所有权重"""
        with self.db.db_conn.cursor() as cur:
            cur.execute("""
                        SELECT weight_id,
                               weight_type,
                               epoch_number,
                               step_number,
                               global_step,
                               object_key,
                               format,
                               size_bytes,
                               metrics_snapshot,
                               created_at
                        FROM training_weights
                        WHERE training_id = %s
                        ORDER BY weight_type, epoch_number DESC
                        """, (training_id,))
            return [
                {
                    "weight_id": r[0], "weight_type": r[1], "epoch_number": r[2],
                    "step_number": r[3], "global_step": r[4], "object_key": r[5],
                    "format": r[6], "size_bytes": r[7], "metrics_snapshot": r[8],
                    "created_at": r[9]
                }
                for r in cur.fetchall()
            ]

    def get_weight_object_keys_by_training(self, training_id: int) -> List[str]:
        """获取训练任务下所有权重的对象存储键（用于删除时清理）"""
        with self.db.db_conn.cursor() as cur:
            cur.execute("""
                        SELECT object_key
                        FROM training_weights
                        WHERE training_id = %s
                        """, (training_id,))
            return [r[0] for r in cur.fetchall()]

    # ============== Storage Operations ==============

    def storage_upload(self, local_path: str, object_key: str, bucket: str = None) -> bool:
        """上传权重到对象存储"""
        bucket = bucket or self.bucket_name
        try:
            self.db.s3_client.upload_file(local_path, bucket, object_key)
            return True
        except Exception as e:
            print(f"上传失败: {e}")
            return False

    def storage_delete(self, object_key: str, bucket: str = None) -> bool:
        """从对象存储删除权重"""
        bucket = bucket or self.bucket_name
        try:
            self.db.s3_client.delete_object(Bucket=bucket, Key=object_key)
            return True
        except Exception as e:
            print(f"删除失败: {e}")
            return False