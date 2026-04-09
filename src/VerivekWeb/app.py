import os
import sys
import json
from flask import Flask, jsonify, request, render_template, redirect, url_for
from werkzeug.utils import secure_filename
import tempfile

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from VerivekCore import get_gpu_info, get_total_usage
from VerivekCore.Database.db_client import DbClient
from VerivekCore.ModelManager.model_manager import ModelManager
from VerivekCore.DatasetManager.dataset_manager import DatasetManager

app = Flask(__name__)

db_client = DbClient()
dataset_manager = DatasetManager(db_client)
model_manager = ModelManager(db_client)

ALLOWED_EXTENSIONS = {'py'}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@app.route('/')
def index():
    """根路径重定向到仪表板"""
    return redirect(url_for('dashboard'))

@app.route('/dashboard')
def dashboard():
    """仪表板页面 - 训练概览"""
    return render_template('_dashboard.html')

@app.route('/datasets')
def datasets():
    """数据集管理页面"""
    return render_template('_datasets.html')

@app.route('/models')
def models():
    """模型仓库页面"""
    return render_template('_models.html')

@app.route('/training')
def training():
    """训练配置页面"""
    return render_template('_training.html')

@app.route('/api/datasets', methods=['GET'])
def get_datasets():
    """获取数据集列表"""
    try:
        tag_filter = request.args.get('tag')
        datasets = dataset_manager.list_datasets(tag_filter=tag_filter)

        return jsonify({
            'success': True,
            'datasets': datasets,
            'total': len(datasets)
        })

    except Exception as e:
        import traceback
        print(traceback.format_exc())
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/datasets', methods=['POST'])
def create_dataset():
    """创建新数据集（支持文件夹压缩成 ZIP）"""
    try:
        # 支持多文件上传（文件夹）或单 zip 文件
        files = request.files.getlist('files')
        if not files or all(f.filename == '' for f in files):
            return jsonify({'error': '未选择文件'}), 400

        dataset_name = request.form.get('dataset_name', '').strip()
        if not dataset_name:
            return jsonify({'error': '数据集名称不能为空'}), 400

        # 创建临时目录存放上传的文件
        with tempfile.TemporaryDirectory() as temp_dir:
            source_folder = os.path.join(temp_dir, 'source')
            os.makedirs(source_folder)

            # 保存所有文件（保持相对路径结构）
            for file in files:
                if file.filename == '':
                    continue

                # webkitRelativePath 包含文件夹结构
                relative_path = file.filename
                file_path = os.path.join(source_folder, relative_path)

                # 创建子目录
                os.makedirs(os.path.dirname(file_path), exist_ok=True)
                file.save(file_path)

            # 参数
            format_type = request.form.get('format', 'auto').strip()
            description = request.form.get('description', '').strip()
            tags = request.form.get('tags', '').strip()
            message = request.form.get('message', 'Initial import').strip()
            created_by = request.form.get('created_by', 'anonymous').strip()

            # 调用 DatasetManager 导入（自动打包成 zip）
            version_id = dataset_manager.import_dataset(
                dataset_name=dataset_name,
                source_path=source_folder,  # 传入文件夹路径
                format=format_type,
                tags=tags,
                description=description,
                message=message,
                created_by=created_by,
                compression_format='zip'  # 强制使用 zip
            )

            return jsonify({
                'success': True,
                'version_id': version_id,
                'dataset_name': dataset_name,
                'message': '数据集导入成功（已自动压缩为 ZIP）'
            })

    except Exception as e:
        import traceback
        print(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

@app.route('/api/datasets/<int:dataset_id>/versions', methods=['GET'])
def get_dataset_versions(dataset_id: int):
    """获取数据集的版本历史（用于可视化谱系）"""
    try:
        # 获取数据集基本信息
        dataset = dataset_manager.get_dataset_by_id(dataset_id)
        if not dataset:
            return jsonify({'success': False, 'error': '数据集不存在'}), 404

        # 获取版本历史=
        versions = dataset_manager.get_dataset_patches(dataset_id)

        # 数据集存在但没有版本时返回空数组
        if not versions:
            # 返回数据集基本信息，versions 为空
            return jsonify({
                'success': True,
                'dataset': {
                    'dataset_id': dataset_id,
                    'dataset_name': dataset['dataset_name'],
                    'total_rows': dataset['total_rows'] or 0,
                    'total_size_bytes': dataset['total_size_bytes'] or 0,
                    'format': dataset['format'],
                    'description': dataset['description']
                },
                'versions': []
            })

        return jsonify({
            'success': True,
            'dataset': {
                'dataset_id': dataset_id,
                'dataset_name': dataset['dataset_name'],
                'total_rows': dataset['total_rows'] or versions[-1]['rows_count'] if versions else 0,
                'total_size_bytes': dataset['total_size_bytes'] or 0,
                'format': dataset['format'],
                'description': dataset['description']
            },
            'versions': versions
        })

    except Exception as e:
        import traceback
        print(traceback.format_exc())
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/datasets/<int:dataset_id>/versions', methods=['POST'])
def create_dataset_version(dataset_id):
    """追加新版本数据"""
    try:
        files = request.files.getlist('files')
        message = request.form.get('message', '追加数据版本')
        parent_version = request.form.get('parent_version', 'latest')
        update_mode = request.form.get('update_mode', 'append')

        if not files or all(f.filename == '' for f in files):
            return jsonify({'success': False, 'error': '未选择文件'}), 400

        # 创建临时目录存放上传的文件
        with tempfile.TemporaryDirectory() as temp_dir:
            source_folder = os.path.join(temp_dir, 'source')
            os.makedirs(source_folder)

            # 保存所有文件（保持相对路径结构）
            for file in files:
                if file.filename == '':
                    continue

                relative_path = file.filename
                file_path = os.path.join(source_folder, relative_path)

                # 创建子目录
                os.makedirs(os.path.dirname(file_path), exist_ok=True)
                file.save(file_path)

            # 调用 DatasetManager 追加版本
            version_id = dataset_manager.append_patch(
                dataset_id=dataset_id,
                source_path=source_folder,
                message=message,
                created_by=request.form.get('created_by', 'anonymous'),
                update_mode=update_mode
            )

            return jsonify({
                'success': True,
                'version_id': version_id,
                'message': '版本追加成功'
            })

    except Exception as e:
        import traceback
        print(traceback.format_exc())
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/datasets/<int:dataset_id>/preprocess', methods=['POST'])
def create_preprocess_job(dataset_id: int):
    """
    创建预处理任务
    【当前限制】仅支持基于原始数据版本（source_version_id），不提供链式参数
    """
    try:
        script = request.files.get('script')
        name = request.form.get('name', '').strip()
        source_version = request.form.get('source_version_id', type=int)
        config = json.loads(request.form.get('config', '{}'))

        if not name or not script:
            return jsonify({'error': '名称和脚本不能为空'}), 400

        # 【关键】完全不读取 parent_preprocessed_id，也不提供此参数给 Manager
        # 未来启用时，只需添加：
        # parent_id = request.form.get('parent_preprocessed_id', type=int)

        with tempfile.TemporaryDirectory() as temp_dir:
            script_path = os.path.join(temp_dir, secure_filename(script.filename))
            script.save(script_path)

            # 调用 Manager，不传 parent_preprocessed_id（默认为 None）
            preprocessed_id = dataset_manager.preprocess_dataset(
                dataset_id=dataset_id,
                name=name,
                script_path=script_path,
                source_version_id=source_version,  # 仅支持基于原始版本
                # parent_preprocessed_id 不传，强制为 None
                config=config,
                created_by=request.form.get('created_by', 'anonymous')
            )

            return jsonify({
                'success': True,
                'preprocessed_id': preprocessed_id,
                'message': '预处理任务已创建（基于原始数据版本）'
            })

    except Exception as e:
        import traceback
        print(traceback.format_exc())
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/datasets/<int:dataset_id>/preprocess', methods=['GET'])
def get_preprocess_versions(dataset_id: int):
    """获取预处理版本列表（包含链式结构信息，但当前所有 parent 为 NULL）"""
    try:
        versions = dataset_manager.get_preprocessed_versions(dataset_id)
        return jsonify({
            'success': True,
            'dataset_id': dataset_id,
            'versions': versions,
            'note': '当前版本仅支持基于原始数据的预处理'
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/preprocess/<int:preprocessed_id>/lineage', methods=['GET'])
def get_preprocess_lineage(preprocessed_id: int):
    """获取预处理谱系（当前为单层，链式功能预留）"""
    try:
        lineage = dataset_manager.get_preprocessed_lineage(preprocessed_id)
        return jsonify({
            'success': True,
            'preprocessed_id': preprocessed_id,
            'lineage': lineage,
            'is_chain': len([n for n in lineage if n['type'] == 'preprocessed']) > 1
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/models', methods=['GET'])
def get_models():
    """获取模型列表"""
    try:
        tag_filter = request.args.get('tag')
        models = model_manager.list_models()

        if tag_filter:
            models = [m for m in models if m.get('tags') and tag_filter in m['tags']]

        return jsonify({
            'success': True,
            'models': models,
            'total': len(models)
        })

    except Exception as e:
        import traceback
        print(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

@app.route('/api/models/<int:model_id>', methods=['GET'])
def get_model_detail(model_id):
    """获取模型详情（包含分支统计）"""
    try:
        detail = model_manager.get_model_detail(model_id)
        if not detail or not detail.get('model'):
            return jsonify({'success': False, 'error': '模型不存在'}), 404

        return jsonify({
            'success': True,
            'model': detail['model'],
            'branches': detail['branches'],
            'branch_count': detail['branch_count']
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/models/<int:model_id>', methods=['DELETE'])
def delete_model(model_id):
    """删除模型"""
    try:
        model_manager.delete_model(model_id)

        return jsonify({
            'success': True,
            'message': f'模型 {model_id} 已删除'
        })

    except Exception as e:
        import traceback
        print(traceback.format_exc())
        return jsonify({'error': str(e)}), 500


@app.route('/api/models/<int:model_id>/branches', methods=['POST'])
def create_model_branch(model_id):
    try:
        data = request.get_json() or {}
        branch_name = data.get('branch_name', '').strip()
        description = data.get('description', '').strip()
        base_commit_id = data.get('base_commit_id')  # 可选，基于哪个提交创建

        if not branch_name:
            return jsonify({'success': False, 'error': '分支名称不能为空'}), 400

        # 检查模型是否存在
        model_detail = model_manager.get_model_detail(model_id)
        if not model_detail or not model_detail.get('model', {}).get('model_name'):
            return jsonify({'success': False, 'error': '模型不存在'}), 404

        # 如果提供了 base_commit_id，验证其有效性
        if base_commit_id:
            commit = model_manager.repo.get_commit(base_commit_id)
            if not commit or commit['model_id'] != model_id:
                return jsonify({'success': False, 'error': '无效的提交ID或不属于该模型'}), 400

        # 创建分支
        branch_id = model_manager.create_branch(
            model_id=model_id,
            branch_name=branch_name,
            description=description,
            base_commit_id=base_commit_id
        )

        return jsonify({
            'success': True,
            'branch_id': branch_id,
            'branch_name': branch_name,
            'model_id': model_id,
            'base_commit_id': base_commit_id,
            'message': '分支创建成功'
        })

    except ValueError as e:
        # 分支已存在等业务逻辑错误
        return jsonify({'success': False, 'error': str(e)}), 409
    except Exception as e:
        import traceback
        print(traceback.format_exc())
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/models/<int:model_id>/commits', methods=['GET'])
def get_model_commits(model_id):
    """获取指定分支的提交历史（用于版本图谱）"""
    try:
        branch_name = request.args.get('branch', 'main')
        commits = model_manager.get_commit_history(model_id, branch_name)

        # 按时间正序排列（旧 -> 新），适配横向时间线
        commits = sorted(commits, key=lambda x: x['created_at'])

        return jsonify({
            'success': True,
            'model_id': model_id,
            'branch': branch_name,
            'commits': commits,
            'total': len(commits)
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/models/import', methods=['POST'])
def import_model():
    """导入模型"""
    try:
        if 'model_file' not in request.files:
            return jsonify({'error': '未找到文件'}), 400

        file = request.files['model_file']
        if file.filename == '':
            return jsonify({'error': '未选择文件'}), 400

        # 文件扩展名校验
        ALLOWED_EXTENSIONS = {'py'}

        if '.' not in file.filename:
            return jsonify({'error': '文件名格式错误，缺少扩展名'}), 400

        file_extension = file.filename.rsplit('.', 1)[1].lower()

        if file_extension not in ALLOWED_EXTENSIONS:
            return jsonify({
                'error': f'不支持的文件格式 .{file_extension}，仅支持: {", ".join(ALLOWED_EXTENSIONS)}'
            }), 400

        # 获取表单数据
        model_name = request.form.get('model_name', '').strip()
        branch_name = request.form.get('branch_name', 'main').strip()
        description = request.form.get('description', '').strip()
        tags = request.form.get('tags', '').strip()
        message = request.form.get('message', 'Initial import').strip()
        author = request.form.get('author', 'anonymous').strip()

        if not model_name:
            return jsonify({'error': '模型名称不能为空'}), 400

        # 保存上传文件到临时目录
        filename = secure_filename(file.filename)

        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = os.path.join(temp_dir, filename)
            file.save(temp_path)

            commit_id = model_manager.import_model(
                model_name=model_name,
                branch_name=branch_name,
                model_path=temp_path,
                message=message,
                author=author,
                tags=tags,
                description=description
            )

            return jsonify({
                'success': True,
                'commit_id': commit_id,
                'model_name': model_name,
                'branch': branch_name,
                'message': '模型导入成功'
            })

    except Exception as e:
        import traceback
        print(traceback.format_exc())
        return jsonify({'error': str(e)}), 500

@app.route('/api/models/<int:model_id>/branches', methods=['GET'])
def get_model_branches(model_id):
    """获取模型的所有分支 - 调用 ModelManager.get_model_detail()"""
    try:
        detail = model_manager.get_model_detail(model_id)
        return jsonify({
            'success': True,
            'model_id': model_id,
            'branches': detail.get('branches', []),
            'branch_count': detail.get('branch_count', 0)
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/models/<int:model_id>/history', methods=['GET'])
def get_model_history(model_id):
    """获取模型提交历史"""
    try:
        branch_name = request.args.get('branch', 'main')
        history = model_manager.get_commit_history(model_id, branch_name)

        return jsonify({
            'success': True,
            'model_id': model_id,
            'branch': branch_name,
            'commits': history
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/training/start', methods=['POST'])
def start_training():
    data = request.json
    # 解析 dataset_id, model_id, hyperparameters
    # 启动训练任务，返回 task_id
    pass

@app.route('/api/training/status/<task_id>', methods=['GET'])
def get_training_status(task_id):
    # 返回训练进度、loss、准确率等
    pass

@app.route('/api/gpu', methods=['GET'])
def get_gpu_status():
    try:
        used_mem, total_mem = get_total_usage()
        gpus = get_gpu_info()

        # 计算总显存
        if total_mem == 0:
            return jsonify({'error': 'GPU info not available'}), 500

        usage_percent = (used_mem / total_mem) * 100 if total_mem > 0 else 0

        return jsonify({
            'total_memory_mb': total_mem,
            'used_memory_mb': used_mem,
            'free_memory_mb': total_mem - used_mem,
            'usage_percent': round(usage_percent, 1),
            'gpus': gpus
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True)