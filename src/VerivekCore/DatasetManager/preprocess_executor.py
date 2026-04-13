import os
import sys
import subprocess
import tempfile
import zipfile
import shutil
import json
import time
from pathlib import Path
from typing import Dict, Optional, Callable
from threading import Thread


class PreprocessExecutor:
    """
    预处理执行器 - 执行用户上传的预处理脚本并将结果保存到 TaskEnv
    """

    def __init__(
        self,
        db_client,
        task_env_base: str = "C:/VeriVek/TaskEnv",
        bucket_name: str = "verivek-datasets"
    ):
        self.db_client = db_client
        self.task_env_base = Path(task_env_base)
        self.bucket_name = bucket_name

    def execute_preprocess(
        self,
        preprocessed_id: int,
        dataset_id: int,
        source_version_id: int,
        script_object_key: str,
        progress_callback: Optional[Callable[[str, float], None]] = None
    ) -> Dict:
        """
        执行预处理任务

        Args:
            preprocessed_id: 预处理记录ID
            dataset_id: 数据集ID
            source_version_id: 源数据版本ID
            script_object_key: 脚本在对象存储中的key
            progress_callback: 进度回调函数 (status, progress_percent)

        Returns:
            Dict: 执行结果，包含 success, output_path, error 等信息
        """
        start_time = time.time()
        temp_dirs = []

        try:
            # 更新状态为运行中
            self._update_status(preprocessed_id, 'running')
            if progress_callback:
                progress_callback('初始化环境...', 10)

            # 创建临时工作目录
            work_dir = tempfile.mkdtemp(prefix=f'preprocess_{preprocessed_id}_')
            temp_dirs.append(work_dir)

            # 步骤1: 下载并解压源数据
            if progress_callback:
                progress_callback('下载源数据...', 20)

            source_data_path = self._download_and_extract_version(
                dataset_id, source_version_id, work_dir
            )

            # 步骤2: 下载预处理脚本
            if progress_callback:
                progress_callback('下载预处理脚本...', 30)

            script_path = self._download_script(script_object_key, work_dir)

            # 步骤3: 创建输出目录 (在 TaskEnv 中)
            task_env_dataset_path = self.task_env_base / "datasets" / f"dataset_{dataset_id}"
            task_env_output_path = task_env_dataset_path / f"preprocessed_{preprocessed_id}"
            task_env_output_path.mkdir(parents=True, exist_ok=True)

            # 清理旧数据
            if task_env_output_path.exists():
                shutil.rmtree(task_env_output_path)
            task_env_output_path.mkdir(parents=True, exist_ok=True)

            # 步骤4: 执行预处理脚本
            if progress_callback:
                progress_callback('执行预处理脚本...', 40)

            # 创建预处理脚本包装器，注入环境变量
            wrapper_script = self._create_wrapper_script(
                script_path, source_data_path, task_env_output_path, work_dir
            )

            result = self._run_script(wrapper_script, work_dir, progress_callback)

            if result['returncode'] != 0:
                raise RuntimeError(f"脚本执行失败: {result['stderr']}")

            # 步骤5: 验证输出
            if progress_callback:
                progress_callback('验证输出...', 80)

            output_stats = self._validate_output(task_env_output_path)

            # 步骤6: 打包并上传到对象存储
            if progress_callback:
                progress_callback('打包结果...', 90)

            zip_path = self._pack_output(task_env_output_path, work_dir)

            # 上传到对象存储
            data_object_key = f"{dataset_id}/preprocessed/{preprocessed_id}_{int(time.time())}.zip"
            self._upload_to_storage(zip_path, data_object_key)

            # 更新数据库记录
            execution_time = int(time.time() - start_time)
            self._update_completed(
                preprocessed_id,
                data_object_key=data_object_key,
                output_stats=output_stats,
                execution_time=execution_time
            )

            if progress_callback:
                progress_callback('完成', 100)

            return {
                'success': True,
                'preprocessed_id': preprocessed_id,
                'output_path': str(task_env_output_path),
                'data_object_key': data_object_key,
                'stats': output_stats,
                'execution_time': execution_time
            }

        except Exception as e:
            error_msg = str(e)
            self._update_failed(preprocessed_id, error_msg)

            if progress_callback:
                progress_callback(f'失败: {error_msg}', 0)

            return {
                'success': False,
                'preprocessed_id': preprocessed_id,
                'error': error_msg
            }

        finally:
            # 清理临时目录
            for temp_dir in temp_dirs:
                try:
                    shutil.rmtree(temp_dir, ignore_errors=True)
                except:
                    pass

    def _download_and_extract_version(
        self, dataset_id: int, version_id: int, work_dir: str
    ) -> str:
        """下载并解压数据集版本"""
        # 查询版本信息
        with self.db_client.db_conn.cursor() as cur:
            cur.execute(
                """SELECT bucket_name, object_key FROM dataset_versions WHERE version_id = %s""",
                (version_id,)
            )
            row = cur.fetchone()
            if not row:
                raise ValueError(f"版本 {version_id} 不存在")

            bucket_name, object_key = row

        # 下载
        zip_path = os.path.join(work_dir, 'source_data.zip')
        self.db_client.s3_client.download_file(bucket_name, object_key, zip_path)

        # 解压
        extract_path = os.path.join(work_dir, 'source_data')
        with zipfile.ZipFile(zip_path, 'r') as zf:
            zf.extractall(extract_path)

        return extract_path

    def _download_script(self, script_object_key: str, work_dir: str) -> str:
        """下载预处理脚本"""
        script_path = os.path.join(work_dir, 'preprocess_script.py')
        self.db_client.s3_client.download_file(
            self.bucket_name, script_object_key, script_path
        )
        return script_path

    def _create_wrapper_script(
        self,
        script_path: str,
        input_path: str,
        output_path: Path,
        work_dir: str
    ) -> str:
        """创建脚本包装器，注入输入/输出路径环境变量"""
        wrapper_path = os.path.join(work_dir, 'wrapper.py')

        wrapper_content = f'''#!/usr/bin/env python3
"""
预处理脚本包装器 - 自动注入输入/输出路径
"""
import os
import sys

# 设置环境变量，供用户脚本使用
os.environ['PREPROCESS_INPUT_DIR'] = {repr(input_path)}
os.environ['PREPROCESS_OUTPUT_DIR'] = {repr(str(output_path))}
os.environ['PREPROCESS_WORK_DIR'] = {repr(work_dir)}

print(f"[TaskEnv] 输入目录: {{os.environ['PREPROCESS_INPUT_DIR']}}")
print(f"[TaskEnv] 输出目录: {{os.environ['PREPROCESS_OUTPUT_DIR']}}")
print(f"[TaskEnv] 工作目录: {{os.environ['PREPROCESS_WORK_DIR']}}")
print("=" * 50)

# 确保输出目录存在
os.makedirs(os.environ['PREPROCESS_OUTPUT_DIR'], exist_ok=True)

# 执行用户脚本
with open({repr(script_path)}, 'r', encoding='utf-8') as f:
    script_content = f.read()

# 修改脚本的工作目录
os.chdir(os.environ['PREPROCESS_WORK_DIR'])

# 执行脚本
exec(script_content, {{'__name__': '__main__'}})

print("=" * 50)
print("[TaskEnv] 预处理脚本执行完成")

# 验证输出
output_dir = os.environ['PREPROCESS_OUTPUT_DIR']
if os.path.exists(output_dir):
    total_files = 0
    for root, dirs, files in os.walk(output_dir):
        total_files += len(files)
    print(f"[TaskEnv] 输出目录共有 {{total_files}} 个文件")
else:
    print("[TaskEnv] 警告: 输出目录不存在")
'''

        with open(wrapper_path, 'w', encoding='utf-8') as f:
            f.write(wrapper_content)

        return wrapper_path

    def _run_script(
        self,
        wrapper_script: str,
        work_dir: str,
        progress_callback: Optional[Callable[[str, float], None]] = None
    ) -> Dict:
        """运行脚本并捕获输出"""
        # 检测虚拟环境
        venv_python = self._get_venv_python()

        # 创建进程
        process = subprocess.Popen(
            [venv_python, wrapper_script],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            cwd=work_dir,
            encoding='utf-8',
            errors='replace'
        )

        stdout_lines = []
        stderr_lines = []

        # 实时读取输出
        def read_output(pipe, lines_list):
            for line in iter(pipe.readline, ''):
                line = line.rstrip()
                lines_list.append(line)
                print(f"[Preprocess] {line}")
                # 更新进度（基于输出内容）
                if progress_callback and '处理' in line and '%' in line:
                    try:
                        import re
                        percent_match = re.search(r'(\d+)%', line)
                        if percent_match:
                            percent = 40 + int(percent_match.group(1)) * 0.4
                            progress_callback('执行预处理脚本...', percent)
                    except:
                        pass

        # 启动输出读取线程
        stdout_thread = Thread(target=read_output, args=(process.stdout, stdout_lines))
        stderr_thread = Thread(target=read_output, args=(process.stderr, stderr_lines))
        stdout_thread.start()
        stderr_thread.start()

        # 等待完成
        returncode = process.wait()
        stdout_thread.join()
        stderr_thread.join()

        return {
            'returncode': returncode,
            'stdout': '\n'.join(stdout_lines),
            'stderr': '\n'.join(stderr_lines)
        }

    def _get_venv_python(self) -> str:
        """获取虚拟环境的Python解释器路径"""
        # 优先使用 TaskEnv 中的虚拟环境
        task_env_venv = self.task_env_base / "venv"

        if os.name == 'nt':  # Windows
            python_path = task_env_venv / "Scripts" / "python.exe"
        else:
            python_path = task_env_venv / "bin" / "python"

        if python_path.exists():
            return str(python_path)

        # 回退到系统Python
        return sys.executable

    def _validate_output(self, output_path: Path) -> Dict:
        """验证输出目录并返回统计信息"""
        if not output_path.exists():
            raise RuntimeError("预处理未生成输出目录")

        total_files = 0
        total_size = 0
        file_types = {}

        for root, dirs, files in os.walk(output_path):
            for file in files:
                file_path = Path(root) / file
                total_files += 1
                total_size += file_path.stat().st_size

                ext = file_path.suffix.lower()
                file_types[ext] = file_types.get(ext, 0) + 1

        # 检查是否有训练所需的目录结构
        has_train = (output_path / "train").exists()
        has_val = (output_path / "val").exists()

        return {
            'total_files': total_files,
            'total_size_bytes': total_size,
            'file_types': file_types,
            'has_train_folder': has_train,
            'has_val_folder': has_val,
            'output_path': str(output_path)
        }

    def _pack_output(self, output_path: Path, work_dir: str) -> str:
        """打包输出目录为zip"""
        zip_path = os.path.join(work_dir, 'preprocessed_output.zip')

        with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
            for file_path in output_path.rglob('*'):
                if file_path.is_file():
                    arcname = file_path.relative_to(output_path)
                    zf.write(file_path, arcname)

        return zip_path

    def _upload_to_storage(self, zip_path: str, object_key: str):
        """上传结果到对象存储"""
        self.db_client.s3_client.upload_file(
            zip_path, self.bucket_name, object_key
        )

    def _update_status(self, preprocessed_id: int, status: str):
        """更新预处理状态"""
        with self.db_client.db_conn.cursor() as cur:
            cur.execute(
                """UPDATE datasets_preprocess 
                   SET status = %s, updated_at = CURRENT_TIMESTAMP 
                   WHERE preprocessed_id = %s""",
                (status, preprocessed_id)
            )
            self.db_client.db_conn.commit()

    def _update_completed(
        self,
        preprocessed_id: int,
        data_object_key: str,
        output_stats: Dict,
        execution_time: int
    ):
        """更新预处理完成状态 - 只更新存在的字段"""
        # 注：根据当前init.sql，只更新status和data_object_key
        with self.db_client.db_conn.cursor() as cur:
            cur.execute(
                """UPDATE datasets_preprocess
                   SET status = %s,
                       data_object_key = %s,
                       updated_at = CURRENT_TIMESTAMP
                   WHERE preprocessed_id = %s""",
                ('completed', data_object_key, preprocessed_id)
            )
            self.db_client.db_conn.commit()

    def _update_failed(self, preprocessed_id: int, error_message: str):
        """更新预处理失败状态 - 只更新存在的字段"""
        # 注：根据当前init.sql，error_message字段不存在，只更新status
        # 错误信息通过print输出到日志
        print(f"[Preprocess {preprocessed_id}] 错误: {error_message}")
        with self.db_client.db_conn.cursor() as cur:
            cur.execute(
                """UPDATE datasets_preprocess
                   SET status = %s,
                       updated_at = CURRENT_TIMESTAMP
                   WHERE preprocessed_id = %s""",
                ('failed', preprocessed_id)
            )
            self.db_client.db_conn.commit()

    def get_preprocess_status(self, preprocessed_id: int) -> Optional[Dict]:
        """获取预处理状态 - 只查询存在的字段"""
        with self.db_client.db_conn.cursor() as cur:
            cur.execute(
                """SELECT preprocessed_id, name, status, data_object_key
                   FROM datasets_preprocess
                   WHERE preprocessed_id = %s""",
                (preprocessed_id,)
            )
            row = cur.fetchone()
            if row:
                return {
                    'preprocessed_id': row[0],
                    'name': row[1],
                    'status': row[2],
                    'data_object_key': row[3]
                }
            return None
