import os
import sys
import json
import time
import shutil
import mimetypes
from flask import Flask, jsonify, request, render_template, redirect, url_for, send_file, session
from functools import wraps
from werkzeug.utils import secure_filename
from datetime import timedelta
import tempfile

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from VerivekCore.Database.db_client import DbClient
from VerivekCore.AuthManager.auth_service import AuthService
from VerivekCore.DatasetManager.dataset_manager import DatasetManager
from VerivekCore.ModelManager.model_manager import ModelManager
from VerivekCore.ModelManager.architecture_generator import ArchitectureGenerator
from VerivekCore.Training.training_manager import TrainingManager
from VerivekCore.Training.training_code_generator import TrainingCodeGenerator
from VerivekCore.Training.gpu_monitor import get_gpu_info, get_total_usage, get_ac_status
from VerivekCore.Training.venv_check import check_pytorch_in_venv
from VerivekCore.Training.setup_task_env import create_task_environment, install_pytorch
from VerivekCore.ModelManager.ai_assistant_service import AIAssistantService

app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY', 'verivek-dev-secret-key-change-in-production')
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(days=7)

# 加载全局配置（如有）
_config_path = os.path.join(os.path.dirname(__file__), '..', '..', 'configs', 'config.json')
_app_config = {}
if os.path.exists(_config_path):
    with open(_config_path, 'r', encoding='utf-8') as f:
        _app_config = json.load(f)

db_client = DbClient()
auth_service = AuthService(db_client.db_conn)
dataset_manager = DatasetManager(db_client)
model_manager = ModelManager(db_client)
_training_venv_path = _app_config.get('training', {}).get('venv_path', 'C:/VeriVek/TaskEnv/venv')
_training_task_env_base = _app_config.get('training', {}).get('task_env_base', '') or os.path.dirname(os.path.dirname(_training_venv_path.rstrip('/\\')))
training_manager = TrainingManager(
    db_client,
    venv_path=_training_venv_path,
    task_env_base=_training_task_env_base
)

ALLOWED_EXTENSIONS = {'py'}

# 训练脚本目录从配置的训练环境基础目录推导
TRAINING_SCRIPTS_DIR = os.path.join(_training_task_env_base, 'trainings')

def _flatten_dataset_dir(data_dir: str) -> None:
    """如果 data_dir 下只有一个子目录且不是 train/val，则将其内容提升到 data_dir"""
    if not os.path.isdir(data_dir):
        return
    entries = [e for e in os.listdir(data_dir) if os.path.isdir(os.path.join(data_dir, e))]
    # 排除常见的系统目录
    entries = [e for e in entries if not e.startswith('.') and not e.startswith('__')]
    if len(entries) != 1:
        return
    sub = entries[0]
    if sub.lower() in ('train', 'val', 'test'):
        return
    sub_path = os.path.join(data_dir, sub)
    # 将子目录内容移动到 data_dir
    for item in os.listdir(sub_path):
        src = os.path.join(sub_path, item)
        dst = os.path.join(data_dir, item)
        if os.path.exists(dst):
            continue
        shutil.move(src, dst)
    # 删除空子目录
    shutil.rmtree(sub_path, ignore_errors=True)
    print(f"[INFO] 自动扁平化数据集目录: 将 '{sub}/' 内容提升至 data/")
os.makedirs(TRAINING_SCRIPTS_DIR, exist_ok=True)

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def require_auth(mode='api', roles=None):
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            if 'user_id' not in session:
                if mode == 'page' and not (request.is_json or request.path.startswith('/api/')):
                    return redirect(url_for('login'))
                return jsonify({'success': False, 'error': '未登录或登录已过期'}), 401

            if roles:
                user_id = session.get('user_id')
                user_role = auth_service.get_user_role(user_id)
                if user_role not in roles:
                    return jsonify({'success': False, 'error': '权限不足，仅管理员可操作'}), 403

            return f(*args, **kwargs)
        return decorated_function
    return decorator

@app.route('/')
def index():
    if 'user_id' in session:
        return redirect(url_for('dashboard'))
    return redirect(url_for('login'))

@app.route('/login')
def login():
    if 'user_id' in session:
        return redirect(url_for('dashboard'))
    return render_template('login.html')

@app.route('/logout')
def logout():
    session.pop('user_id', None)
    return redirect(url_for('login'))

@app.route('/dashboard')
@require_auth(mode='page')
def dashboard():
    return render_template('_dashboard.html')

@app.route('/datasets')
@require_auth(mode='page')
def datasets():
    return render_template('_datasets.html')

@app.route('/models')
@require_auth(mode='page')
def models():
    return render_template('_models.html')

@app.route('/training')
@require_auth(mode='page')
def training():
    return render_template('_training.html')

@app.route('/dependencies')
@require_auth(mode='page')
def dependencies():
    dependencies_info = {
        'database': {
            'type': 'postgres',
            'label': '数据库',
            'options': ['postgres', 'mysql'],
            'config': {
                'host': db_client.cfg.get('database', {}).get('host', '未知'),
                'port': db_client.cfg.get('database', {}).get('port', '未知'),
                'dbname': db_client.cfg.get('database', {}).get('dbname', '未知'),
                'user': db_client.cfg.get('database', {}).get('user', '未知'),
            }
        },
        'object_storage': {
            'type': 'minio',
            'label': '对象存储',
            'options': ['minio', 'none'],
            'config': {
                'endpoint_url': db_client.cfg.get('minio', {}).get('endpoint_url', '未知'),
                'buckets': db_client.cfg.get('minio', {}).get('buckets', {}),
                'access_key': db_client.cfg.get('minio', {}).get('access_key', '未知'),
            }
        },
        'ml_backend': {
            'type': 'pytorch',
            'label': '机器学习框架',
            'options': ['pytorch', 'tensorflow'],
            'config': {
                'venv_path': _app_config.get('training', {}).get('venv_path', '未知'),
                'pytorch': check_pytorch_in_venv(
                    _app_config.get('training', {}).get('venv_path', 'C:/VeriVek/TaskEnv/venv')
                )
            }
        },
        'config_path': os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'configs', 'config.json'))
    }
    return render_template('_dependencies.html', dependencies=dependencies_info)

@app.route('/model-builder')
@require_auth(mode='page')
def model_builder():
    return render_template('_model_builder.html')

@app.route('/profile')
@require_auth(mode='page')
def profile():
    return render_template('_profile.html')

@app.route('/preprocess-builder')
@require_auth(mode='page')
def preprocess_builder():
    return render_template('_preprocess_builder.html')

@app.route('/api/auth/login', methods=['POST'])
def api_login():
    """用户登录接口"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'success': False, 'error': '请求体不能为空'}), 400

        username = data.get('username', '').strip()
        password = data.get('password', '')
        remember_me = data.get('remember_me', False)

        if not username or not password:
            return jsonify({'success': False, 'error': '用户名和密码不能为空'}), 400

        user = auth_service.authenticate_user(username, password)
        if not user:
            return jsonify({'success': False, 'error': '用户名或密码错误'}), 401

        auth_service.update_last_login(user['user_id'])

        # 设置 session
        session['user_id'] = user['user_id']
        session['username'] = user['username']
        session['role'] = user['role']
        session.permanent = remember_me

        return jsonify({
            'success': True,
            'user': {
                'user_id': user['user_id'],
                'username': user['username'],
                'role': user['role'],
                'preferences': user.get('preferences') or {}
            },
            'message': '登录成功'
        })

    except Exception as e:
        import traceback
        print(traceback.format_exc())
        return jsonify({'success': False, 'error': f'登录失败: {str(e)}'}), 500

@app.route('/api/auth/register', methods=['POST'])
def api_register():
    """用户注册接口"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'success': False, 'error': '请求体不能为空'}), 400

        username = data.get('username', '').strip()
        password = data.get('password', '')
        role = data.get('role', 'researcher').strip()

        if not username or not password:
            return jsonify({'success': False, 'error': '用户名和密码不能为空'}), 400

        if len(username) < 3 or len(username) > 50:
            return jsonify({'success': False, 'error': '用户名长度需在3-50字符之间'}), 400

        if len(password) < 6:
            return jsonify({'success': False, 'error': '密码长度至少6位'}), 400

        if role not in ('admin', 'researcher', 'guest'):
            role = 'researcher'

        try:
            user_id = auth_service.register_user(username, password, role)

            # 注册成功后自动登录
            session['user_id'] = user_id
            session['username'] = username
            session['role'] = role
            session.permanent = False

            return jsonify({
                'success': True,
                'user_id': user_id,
                'message': '注册成功'
            })
        except ValueError as e:
            return jsonify({'success': False, 'error': str(e)}), 409

    except Exception as e:
        import traceback
        print(traceback.format_exc())
        return jsonify({'success': False, 'error': f'注册失败: {str(e)}'}), 500

@app.route('/api/auth/logout', methods=['POST'])
def api_logout():
    try:
        session.clear()
        return jsonify({'success': True, 'message': '登出成功'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/auth/check', methods=['GET'])
def api_auth_check():
    if 'user_id' in session:
        return jsonify({
            'success': True,
            'authenticated': True,
            'user': {
                'user_id': session.get('user_id'),
                'username': session.get('username'),
                'role': session.get('role')
            }
        })
    return jsonify({
        'success': True,
        'authenticated': False,
        'user': None
    })

@app.route('/api/users/count', methods=['GET'])
@require_auth()
def api_users_count():
    try:
        count = auth_service.get_user_count()
        return jsonify({'success': True, 'count': count})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/users/profile', methods=['GET'])
@require_auth()
def api_user_profile():
    """获取当前登录用户详细信息"""
    try:
        user_id = session.get('user_id')
        user = auth_service.get_user_by_id(user_id)
        if user:
            return jsonify({'success': True, 'user': user})
        return jsonify({'success': False, 'error': '用户不存在'}), 404
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

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
            visibility = request.form.get('visibility', 'private').strip()
            # 从 session 获取当前用户ID
            user_id = session.get('user_id', 0)

            # 调用 DatasetManager 导入（自动打包成 zip）
            version_id = dataset_manager.import_dataset(
                dataset_name=dataset_name,
                source_path=source_folder,  # 传入文件夹路径
                format=format_type,
                tags=tags,
                description=description,
                message=message,
                created_by=user_id,
                compression_format='zip',  # 强制使用 zip
                visibility=visibility
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

            # 从 session 获取当前用户ID
            user_id = session.get('user_id', 0)

            # 调用 DatasetManager 追加版本
            version_id = dataset_manager.append_patch(
                dataset_id=dataset_id,
                source_path=source_folder,
                message=message,
                created_by=user_id,
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

        # 从 session 获取当前用户ID
        user_id = session.get('user_id', 0)

        with tempfile.TemporaryDirectory() as temp_dir:
            script_path = os.path.join(temp_dir, secure_filename(script.filename))
            script.save(script_path)

            # 调用 Manager，不传 parent_preprocessed_id（强制为 None）
            preprocessed_id = dataset_manager.preprocess_dataset(
                dataset_id=dataset_id,
                name=name,
                script_path=script_path,
                source_version_id=source_version,  # 仅支持基于原始版本
                # parent_preprocessed_id 不传，强制为 None
                config=config,
                created_by=user_id
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

@app.route('/api/preprocess/<int:preprocessed_id>/status', methods=['GET'])
def get_preprocess_status(preprocessed_id: int):
    """获取预处理任务执行状态"""
    try:
        status = dataset_manager.preprocess_executor.get_preprocess_status(preprocessed_id)
        if not status:
            return jsonify({'success': False, 'error': '预处理任务不存在'}), 404

        return jsonify({
            'success': True,
            'status': status
        })
    except Exception as e:
        import traceback
        print(traceback.format_exc())
        return jsonify({'success': False, 'error': str(e)}), 500

# 标注文件扩展名集合
_ANNOTATION_EXTS = {'.csv', '.xls', '.xlsx', '.json', '.txt', '.tsv'}

def _build_tree_from_zip_namelist(namelist):
    """从 zip namelist 构建树形结构"""
    root = {'name': 'root', 'type': 'folder', 'depth': 0, 'children': []}
    node_map = {'': root}

    # 先按路径排序，确保父目录先创建
    paths = sorted(set(namelist))

    for raw_path in paths:
        is_dir_entry = raw_path.endswith('/')
        path = raw_path.rstrip('/')
        if not path:
            continue

        parts = path.split('/')
        current_path = ''
        current_node = root

        for i, part in enumerate(parts):
            current_path = (current_path + '/' + part) if current_path else part

            if current_path not in node_map:
                is_file = (i == len(parts) - 1) and not is_dir_entry
                new_node = {
                    'name': part,
                    'type': 'file' if is_file else 'folder',
                    'depth': i + 1,
                    'children': [] if not is_file else None
                }
                if is_file:
                    ext = os.path.splitext(part)[1].lower()
                    new_node['is_annotation'] = ext in _ANNOTATION_EXTS
                node_map[current_path] = new_node
                current_node['children'].append(new_node)
                current_node = new_node
            else:
                current_node = node_map[current_path]

    return root

@app.route('/api/datasets/<int:dataset_id>/versions/<int:version_id>/structure', methods=['GET'])
@require_auth()
def get_dataset_version_structure(dataset_id: int, version_id: int):
    """获取数据集版本的目录结构（用于预处理浏览器）"""
    import zipfile
    import tempfile

    try:
        version = dataset_manager.repo.get_version(version_id)
        if not version or version['dataset_id'] != dataset_id:
            return jsonify({'success': False, 'error': '版本不存在或不属于该数据集'}), 404

        # 下载 zip 到临时文件（Windows 上不能用 NamedTemporaryFile 的已打开句柄）
        tmp_path = tempfile.mktemp(suffix='.zip')
        dataset_manager.db_client.s3_client.download_file(
            version['bucket_name'],
            version['object_key'],
            tmp_path
        )

        try:
            with zipfile.ZipFile(tmp_path, 'r') as zf:
                namelist = zf.namelist()
                # 获取每个文件的大小
                info_map = {info.filename: info.file_size for info in zf.infolist()}

            tree = _build_tree_from_zip_namelist(namelist)

            # 补充文件大小
            def _fill_size(node, path=''):
                if node['type'] == 'file':
                    full_path = path + node['name'] if path else node['name']
                    node['size'] = info_map.get(full_path, 0)
                elif node['children']:
                    for child in node['children']:
                        child_path = path + node['name'] + '/' if path else node['name'] + '/'
                        _fill_size(child, child_path)

            for child in tree.get('children', []):
                _fill_size(child, '')

            return jsonify({
                'success': True,
                'structure': tree
            })
        finally:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)

    except Exception as e:
        import traceback
        print(traceback.format_exc())
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/models', methods=['GET'])
@require_auth()
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
@require_auth()
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
@require_auth()
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
@require_auth()
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
@require_auth()
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
@require_auth()
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
        visibility = request.form.get('visibility', 'private').strip()
        # 从 session 获取当前用户ID
        user_id = session.get('user_id', 0)

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
                author=user_id,
                tags=tags,
                description=description,
                visibility=visibility
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
@require_auth()
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
@require_auth()
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

@app.route('/api/architecture/list', methods=['GET'])
@require_auth()
def get_architecture_list():
    """获取 resources/architectures 目录中的架构文件列表"""
    try:
        resources_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'resources', 'architectures')
        files = [f for f in os.listdir(resources_dir) if f.endswith('_graph.json')]
        architectures = []
        for f in sorted(files):
            name = f.replace('_graph.json', '')
            architectures.append({
                'name': name,
                'display_name': name.upper(),
                'file': f
            })
        return jsonify({'success': True, 'architectures': architectures})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/architecture/load/<name>', methods=['GET'])
@require_auth()
def get_architecture(name):
    """读取指定的架构 JSON 文件"""
    try:
        resources_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'resources', 'architectures')
        filename = f"{name}_graph.json"
        filepath = os.path.join(resources_dir, filename)
        if not os.path.exists(filepath):
            return jsonify({'success': False, 'error': '架构不存在'}), 404
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)
        return jsonify({'success': True, 'graph': data})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/architecture/generate', methods=['POST'])
@require_auth()
def generate_architecture():
    try:
        data = request.get_json()
        graph = data.get('graph_structure', {})

        # 使用生成器
        generator = ArchitectureGenerator(graph)
        code = generator.generate_code(data.get('class_name', 'GeneratedModel'))
        stats = generator.analyze()

        return jsonify({
            'success': True,
            'code': code,
            'stats': stats
        })

    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 400


@app.route('/api/ai-assistant/chat', methods=['POST'])
@require_auth()
def ai_assistant_chat():
    """AI 助手对话：接收前端设置和消息历史，调用 OpenAI 兼容格式 LLM。"""
    try:
        data = request.get_json() or {}

        api_key = data.get('api_key', '').strip()
        provider = data.get('provider', 'openai').strip().lower()
        base_url = data.get('base_url', '').strip() or None
        model = data.get('model', '').strip() or None
        messages = data.get('messages', [])
        graph_structure = data.get('graph_structure')
        current_code = data.get('current_code')
        task = data.get('task')
        temperature = data.get('temperature', 0.7)
        max_tokens = data.get('max_tokens', 2048)

        if not api_key:
            return jsonify({'success': False, 'error': '缺少 API Key，请先在设置中配置'}), 400

        if not messages:
            return jsonify({'success': False, 'error': '消息内容不能为空'}), 400

        assistant = AIAssistantService(
            api_key=api_key,
            provider=provider,
            base_url=base_url,
            model=model,
        )

        result = assistant.chat(
            messages=messages,
            graph_structure=graph_structure,
            current_code=current_code,
            task=task,
            temperature=float(temperature),
            max_tokens=int(max_tokens),
        )

        if result.get('success'):
            return jsonify(result)
        return jsonify(result), 502

    except ValueError as e:
        return jsonify({'success': False, 'error': str(e)}), 400
    except ImportError as e:
        return jsonify({'success': False, 'error': str(e)}), 500
    except Exception as e:
        import traceback
        print(traceback.format_exc())
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/ai-assistant/quick-action', methods=['POST'])
@require_auth()
def ai_assistant_quick_action():
    """AI 助手快捷操作：解释架构 / 优化建议。"""
    try:
        data = request.get_json() or {}

        api_key = data.get('api_key', '').strip()
        provider = data.get('provider', 'openai').strip().lower()
        base_url = data.get('base_url', '').strip() or None
        model = data.get('model', '').strip() or None
        action = data.get('action', '').strip().lower()
        graph_structure = data.get('graph_structure')
        current_code = data.get('current_code')

        if not api_key:
            return jsonify({'success': False, 'error': '缺少 API Key'}), 400

        if not graph_structure:
            return jsonify({'success': False, 'error': '缺少架构图结构'}), 400

        assistant = AIAssistantService(
            api_key=api_key,
            provider=provider,
            base_url=base_url,
            model=model,
        )

        if action == 'explain':
            result = assistant.explain_architecture(graph_structure, current_code)
        elif action == 'optimize':
            result = assistant.suggest_optimization(graph_structure, current_code)
        else:
            return jsonify({'success': False, 'error': '未知的快捷操作类型'}), 400

        if result.get('success'):
            return jsonify(result)
        return jsonify(result), 502

    except ValueError as e:
        return jsonify({'success': False, 'error': str(e)}), 400
    except Exception as e:
        import traceback
        print(traceback.format_exc())
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/architecture/params', methods=['POST'])
@require_auth()
def calculate_architecture_params():
    """计算架构的参数量"""
    try:
        data = request.get_json()
        graph = data.get('graph_structure', {})
        input_channels = data.get('input_channels', 3)
        input_size = data.get('input_size', [224, 224])

        # 使用生成器计算参数量
        generator = ArchitectureGenerator(
            graph,
            input_channels=input_channels,
            input_size=tuple(input_size) if isinstance(input_size, list) else input_size
        )
        params_info = generator.calculate_params()

        return jsonify({
            'success': True,
            'params': params_info
        })

    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 400

@app.route('/api/architecture/save', methods=['POST'])
@require_auth()
def save_architecture():
    """保存架构设计到数据库（转换为Python代码后保存）"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'success': False, 'error': '请求体不能为空'}), 400

        # 获取参数
        architecture_name = data.get('architecture_name', '').strip()
        description = data.get('description', '').strip()
        tags = data.get('tags', '').strip()
        graph = data.get('graph_structure', {})

        if not architecture_name:
            return jsonify({'success': False, 'error': '架构名称不能为空'}), 400

        if not graph or not graph.get('nodes'):
            return jsonify({'success': False, 'error': '架构图结构不能为空'}), 400

        # 获取输入节点配置（用于生成更准确的代码）
        input_node = None
        for node in graph.get('nodes', []):
            if node.get('type') == 'Input':
                input_node = node
                break

        input_channels = 3
        input_size = (224, 224)
        if input_node and input_node.get('properties', {}).get('shape'):
            shape = input_node['properties']['shape']
            if len(shape) >= 4:
                input_channels = shape[1]
                input_size = (shape[2], shape[3])

        # 生成Python代码
        generator = ArchitectureGenerator(
            graph,
            input_channels=input_channels,
            input_size=input_size
        )
        class_name = architecture_name.replace(' ', '_').replace('-', '_')
        generated_code = generator.generate_code(class_name=class_name)

        # 创建临时文件保存生成的代码
        import tempfile
        import os

        with tempfile.NamedTemporaryFile(mode='w', suffix='.py', delete=False, encoding='utf-8') as f:
            f.write(generated_code)
            temp_path = f.name

        try:
            # 获取当前用户ID
            user_id = session.get('user_id', 0)

            # 使用 model_manager 导入模型（保存为私有）
            commit_id = model_manager.import_model(
                model_name=architecture_name,
                branch_name='main',
                model_path=temp_path,
                message=f"从架构设计器创建: {description or '无描述'}",
                author=user_id,
                tags=tags,
                description=description,
                visibility='private'  # 自动保存为私有架构
            )

            # 计算参数量
            params_info = generator.calculate_params()

            return jsonify({
                'success': True,
                'commit_id': commit_id,
                'model_name': architecture_name,
                'params': {
                    'total_params': params_info.get('total_params_formatted', '0'),
                    'model_size_mb': params_info.get('total_size_mb', 0)
                },
                'message': f'架构 "{architecture_name}" 已成功保存为私有模型'
            })

        finally:
            # 清理临时文件
            if os.path.exists(temp_path):
                os.remove(temp_path)

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': str(e)
        }), 400

@app.route('/api/trainings', methods=['POST'])
@require_auth()
def create_training():
    """创建新的训练任务并自动生成训练脚本到指定路径（类名固定为 Model）"""
    try:
        data = request.get_json()

        if not data:
            return jsonify({'success': False, 'error': '请求体不能为空'}), 400

        # 参数校验
        training_name = data.get('training_name', '').strip()
        model_commit_id = data.get('model_commit_id')
        dataset_id = data.get('dataset_id')
        version_id = data.get('version_id')  # 新增：数据集版本ID
        preprocessed_id = data.get('preprocessed_id')
        hyperparameters = data.get('hyperparameters', {})

        if not training_name:
            return jsonify({'success': False, 'error': '训练名称不能为空'}), 400
        if not model_commit_id:
            return jsonify({'success': False, 'error': '必须选择模型版本'}), 400
        if not dataset_id and not preprocessed_id:
            return jsonify({'success': False, 'error': '必须选择数据集'}), 400
        if dataset_id and preprocessed_id:
            return jsonify({'success': False, 'error': '不能同时选择原始数据集和预处理数据集'}), 400

        # 验证模型提交
        commit_info = model_manager.repo.get_commit(model_commit_id)
        if not commit_info:
            return jsonify({'success': False, 'error': '指定的模型版本不存在'}), 404

        # 构造数据集配置
        dataset_config = None
        if dataset_id:
            dataset = dataset_manager.get_dataset_by_id(dataset_id)
            if not dataset:
                return jsonify({'success': False, 'error': '指定的数据集不存在'}), 404
            num_classes = dataset.get('num_classes', 4)
            data_root = dataset.get('storage_path',
                                    os.path.join(TRAINING_SCRIPTS_DIR, '..', 'data', f'dataset_{dataset_id}'))
            dataset_config = {
                'type': 'image',
                'data_root': data_root,
                'num_classes': num_classes
            }
        elif preprocessed_id:
            preprocessed = dataset_manager.repo.get_preprocessed(preprocessed_id)
            if not preprocessed:
                return jsonify({'success': False, 'error': '指定的预处理数据集不存在'}), 404
            parent_dataset = dataset_manager.get_dataset_by_id(preprocessed['dataset_id'])
            num_classes = parent_dataset.get('num_classes', 4) if parent_dataset else 4
            data_root = preprocessed.get('storage_path',
                                         os.path.join(TRAINING_SCRIPTS_DIR, '..', 'data',
                                                      f'preprocessed_{preprocessed_id}'))
            dataset_config = {
                'type': 'image',
                'data_root': data_root,
                'num_classes': num_classes
            }

        # 从 session 获取当前用户ID
        user_id = session.get('user_id', 0)

        # 创建训练记录
        training_id = training_manager.create_training(
            training_name=training_name,
            model_commit_id=model_commit_id,
            hyperparameters=hyperparameters,
            dataset_id=dataset_id,
            preprocessed_id=preprocessed_id,
            description=data.get('description', ''),
            created_by=user_id,
            branch_id=commit_info.get('branch_id'),
            gpu_type=data.get('gpu_type', ''),
            gpu_count=data.get('gpu_count', 0)
        )

        # ==================== 自动生成并保存训练脚本 ====================
        try:
            # 保存到配置的目录
            script_dir = os.path.join(TRAINING_SCRIPTS_DIR, str(training_id))
            os.makedirs(script_dir, exist_ok=True)

            # 下载数据集到脚本同级目录的 data/ 文件夹
            data_dir = os.path.join(script_dir, 'data')
            os.makedirs(data_dir, exist_ok=True)

            if dataset_id:
                # 使用指定的版本ID或自动获取最新版本
                if version_id:
                    print(f"[INFO] 正在下载数据集 {dataset_id} 的指定版本 {version_id}")
                    dataset_manager.extract_dataset_version(dataset_id, version_id, data_dir)
                else:
                    # 获取数据集最新版本
                    dataset_detail = dataset_manager.get_dataset_detail(dataset_id)
                    versions = dataset_detail.get('versions', [])
                    if versions:
                        latest_version = versions[0]
                        version_id = latest_version['version_id']
                        print(f"[INFO] 正在下载数据集 {dataset_id} 的最新版本 {version_id}")
                        dataset_manager.extract_dataset_version(dataset_id, version_id, data_dir)
                    else:
                        raise RuntimeError(f"数据集 {dataset_id} 没有可用版本")
                print(f"[INFO] 数据集下载完成: {data_dir}")
                _flatten_dataset_dir(data_dir)
            elif preprocessed_id:
                # 下载预处理数据集
                preprocessed = dataset_manager.repo.get_preprocessed(preprocessed_id)
                if preprocessed and preprocessed.get('data_object_key'):
                    preprocessed_data_key = preprocessed['data_object_key']
                    preprocessed_bucket = preprocessed.get('bucket_name', 'verivek-datasets')
                    print(f"[INFO] 正在下载预处理数据集 {preprocessed_id}")
                    import zipfile
                    temp_zip = os.path.join(script_dir, 'preprocessed_temp.zip')
                    dataset_manager.db_client.s3_client.download_file(
                        preprocessed_bucket,
                        preprocessed_data_key,
                        temp_zip
                    )
                    with zipfile.ZipFile(temp_zip, 'r') as zf:
                        zf.extractall(data_dir)
                    os.remove(temp_zip)
                    print(f"[INFO] 预处理数据集下载完成: {data_dir}")

            # 更新 dataset_config 使用本地数据路径
            if dataset_config:
                dataset_config['data_root'] = data_dir

            # 类名固定为 "Model"
            generator = TrainingCodeGenerator(
                model_class_name="Model",  # 固定类名
                hyperparameters=hyperparameters,
                dataset_config=dataset_config
            )
            generated_code = generator.generate()

            train_script_path = os.path.join(script_dir, 'train.py')
            with open(train_script_path, 'w', encoding='utf-8') as f:
                f.write(generated_code)

            # 同时保存模型代码
            try:
                commit = model_manager.repo.get_commit(model_commit_id)
                if commit and commit.get('object_key'):
                    model_path = os.path.join(script_dir, 'model.py')
                    model_manager.db_client.s3_client.download_file(
                        commit['bucket_name'],
                        commit['object_key'],
                        model_path
                    )
            except Exception as model_err:
                print(f"[WARNING] 训练 {training_id} 的模型代码保存失败: {model_err}")

            # 保存元数据
            metadata = {
                'training_id': training_id,
                'training_name': training_name,
                'model_class_name': 'Model',
                'hyperparameters': hyperparameters,
                'dataset_config': dataset_config,
                'version_id': version_id,
                'created_at': time.strftime('%Y-%m-%d %H:%M:%S')
            }
            metadata_path = os.path.join(script_dir, 'config.json')
            with open(metadata_path, 'w', encoding='utf-8') as f:
                json.dump(metadata, f, indent=2, ensure_ascii=False)

            print(f"[INFO] 训练脚本已生成并保存至: {script_dir}")

        except Exception as script_err:
            print(f"[ERROR] 训练 {training_id} 的脚本生成失败: {script_err}")
            import traceback
            traceback.print_exc()

        # 可选：立即启动训练
        if data.get('auto_start'):
            try:
                training_manager.start_training(training_id)
            except Exception as start_err:
                return jsonify({
                    'success': True,
                    'training_id': training_id,
                    'warning': f'训练创建成功但启动失败: {str(start_err)}'
                }), 201

        return jsonify({
            'success': True,
            'training_id': training_id,
            'data_source_type': 'raw' if dataset_id else 'preprocessed',
            'message': '训练任务创建成功'
        }), 201

    except Exception as e:
        import traceback
        print(traceback.format_exc())
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/trainings', methods=['GET'])
@require_auth()
def get_trainings():
    """获取训练任务列表，支持状态筛选，包含数据源信息"""
    try:
        status_filter = request.args.get('status')
        model_commit_id = request.args.get('model_commit_id', type=int)
        data_source_type = request.args.get('data_source_type')  # 可选筛选：raw | preprocessed

        # 获取基础列表
        trainings = training_manager.list_trainings(
            model_commit_id=model_commit_id,
            status_filter=status_filter
        )

        # 补充关联信息（模型名称、数据源名称）
        enriched_trainings = []
        for t in trainings:
            # 获取模型信息
            model_info = model_manager.repo.get_commit(t['model_commit_id']) if t.get('model_commit_id') else None
            if model_info:
                model_detail = model_manager.repo.get_model_by_id(model_info['model_id'])
                t['model_name'] = model_detail['model_name'] if model_detail else 'Unknown'
            else:
                t['model_name'] = 'Unknown'

            # 获取数据源信息（区分原始数据集和预处理数据集）
            t['data_source_type'] = None
            t['dataset_name'] = 'Unknown'
            t['dataset_id'] = t.get('dataset_id')  # 确保返回ID供前端使用
            t['preprocessed_id'] = t.get('preprocessed_id')

            if t.get('dataset_id'):
                # 原始数据集
                dataset = dataset_manager.get_dataset_by_id(t['dataset_id'])
                if dataset:
                    t['dataset_name'] = dataset['dataset_name']
                    t['data_source_type'] = 'raw'
            elif t.get('preprocessed_id'):
                # 预处理数据集
                preprocessed = dataset_manager.repo.get_preprocessed(t['preprocessed_id'])
                if preprocessed:
                    t['dataset_name'] = preprocessed['name']
                    t['data_source_type'] = 'preprocessed'
                    # 补充关联的原始数据集名称（便于展示谱系）
                    if preprocessed.get('dataset_id'):
                        parent_dataset = dataset_manager.get_dataset_by_id(preprocessed['dataset_id'])
                        t['parent_dataset_name'] = parent_dataset['dataset_name'] if parent_dataset else None

            # 数据源类型筛选
            if data_source_type and t['data_source_type'] != data_source_type:
                continue

            enriched_trainings.append(t)

        return jsonify({
            'success': True,
            'trainings': enriched_trainings,
            'total': len(enriched_trainings)
        })

    except Exception as e:
        import traceback
        print(traceback.format_exc())
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/trainings/trends', methods=['GET'])
@require_auth()
def get_training_trends():
    """获取最近 N 天训练任务趋势统计。"""
    try:
        days = request.args.get('days', 7, type=int)
        if days <= 0:
            days = 7

        trends = training_manager.get_training_trends(days=days)
        return jsonify({
            'success': True,
            'trends': trends
        })
    except Exception as e:
        import traceback
        print(traceback.format_exc())
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/trainings/<int:training_id>', methods=['GET'])
@require_auth()
def get_training_detail(training_id):
    """获取训练任务详情（含权重信息、数据源详情）"""
    try:
        detail = training_manager.get_training_detail(training_id)
        training = detail.get('training', {})

        # 补充模型信息
        if training.get('model_commit_id'):
            commit = model_manager.repo.get_commit(training['model_commit_id'])
            if commit:
                model = model_manager.repo.get_model_by_id(commit['model_id'])
                detail['model_info'] = {
                    'model_name': model['model_name'] if model else 'Unknown',
                    'model_id': commit['model_id'],
                    'commit_message': commit.get('message', '')
                }

        # 补充数据源详细信息
        detail['data_source'] = None
        if training.get('dataset_id'):
            dataset = dataset_manager.get_dataset_by_id(training['dataset_id'])
            if dataset:
                detail['data_source'] = {
                    'type': 'raw',
                    'dataset_id': training['dataset_id'],
                    'dataset_name': dataset['dataset_name'],
                    'format': dataset.get('format'),
                    'total_rows': dataset.get('total_rows'),
                    'total_size_bytes': dataset.get('total_size_bytes'),
                    'description': dataset.get('description')
                }
        elif training.get('preprocessed_id'):
            preprocessed = dataset_manager.repo.get_preprocessed(training['preprocessed_id'])
            if preprocessed:
                detail['data_source'] = {
                    'type': 'preprocessed',
                    'preprocessed_id': training['preprocessed_id'],
                    'name': preprocessed['name'],
                    'status': preprocessed['status'],
                    'source_version_id': preprocessed.get('source_version_id'),
                    'preprocessing_config': preprocessed.get('preprocessing_config'),
                    'created_at': preprocessed.get('created_at').isoformat() if preprocessed.get('created_at') else None
                }
                # 补充原始数据集信息（谱系）
                if preprocessed.get('dataset_id'):
                    parent_dataset = dataset_manager.get_dataset_by_id(preprocessed['dataset_id'])
                    if parent_dataset:
                        detail['data_source']['parent_dataset'] = {
                            'dataset_id': preprocessed['dataset_id'],
                            'dataset_name': parent_dataset['dataset_name']
                        }

        return jsonify({
            'success': True,
            'training': detail
        })

    except ValueError as e:
        return jsonify({'success': False, 'error': str(e)}), 404
    except Exception as e:
        import traceback
        print(traceback.format_exc())
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/trainings/<int:training_id>/start', methods=['POST'])
@require_auth()
def start_training_task(training_id):
    """手动启动训练任务（将状态从 pending 改为 running）"""
    try:
        training_manager.start_training(training_id)

        return jsonify({
            'success': True,
            'message': '训练任务已启动'
        })

    except ValueError as e:
        return jsonify({'success': False, 'error': str(e)}), 400
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/trainings/<int:training_id>/complete', methods=['POST'])
@require_auth()
def complete_training_task(training_id):
    """标记训练完成（供训练脚本回调使用）"""
    try:
        data = request.get_json() or {}

        training_manager.complete_training(
            training_id=training_id,
            final_metrics=data.get('final_metrics', {}),
            compute_time_seconds=data.get('compute_time_seconds', 0)
        )

        return jsonify({
            'success': True,
            'message': '训练任务已标记为完成'
        })

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/trainings/<int:training_id>/fail', methods=['POST'])
@require_auth()
def fail_training_task(training_id):
    """标记训练失败（供训练脚本回调使用）"""
    try:
        data = request.get_json() or {}

        training_manager.fail_training(
            training_id=training_id,
            error_message=data.get('error_message', 'Unknown error'),
            exit_code=data.get('exit_code', -1)
        )

        return jsonify({
            'success': True,
            'message': '训练任务已标记为失败'
        })

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/trainings/<int:training_id>/checkpoint', methods=['POST'])
@require_auth()
def save_training_checkpoint(training_id):
    """保存训练检查点（供训练脚本调用）"""
    try:
        # 检查是否有文件上传
        if 'weight_file' not in request.files:
            return jsonify({'success': False, 'error': '未提供权重文件'}), 400

        file = request.files['weight_file']
        if file.filename == '':
            return jsonify({'success': False, 'error': '文件名为空'}), 400

        # 保存到临时文件
        with tempfile.NamedTemporaryFile(delete=False, suffix='.pt') as tmp:
            file.save(tmp.name)
            tmp_path = tmp.name

        # 解析其他参数
        epoch_number = request.form.get('epoch_number', type=int, default=0)
        save_as_best = request.form.get('is_best', 'false').lower() == 'true'
        metrics_snapshot = json.loads(request.form.get('metrics_snapshot', '{}'))

        # 保存检查点
        result = training_manager.save_checkpoint(
            training_id=training_id,
            weight_path=tmp_path,
            epoch_number=epoch_number,
            save_as_best=save_as_best,
            metrics_snapshot=metrics_snapshot,
            note=request.form.get('note', '')
        )

        # 清理临时文件
        os.unlink(tmp_path)

        return jsonify({
            'success': True,
            'checkpoint_id': result.get('checkpoint_id'),
            'best_id': result.get('best_id'),
            'message': '检查点保存成功'
        })

    except Exception as e:
        import traceback
        print(traceback.format_exc())
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/trainings/<int:training_id>/resume', methods=['GET'])
@require_auth()
def get_training_resume_info(training_id):
    """获取训练恢复信息（断点续训）"""
    try:
        resume_info = training_manager.resume_from_checkpoint(training_id)

        if not resume_info:
            return jsonify({
                'success': False,
                'error': '该训练任务无法恢复（可能已完成或没有检查点）'
            }), 400

        return jsonify({
            'success': True,
            'resume_info': resume_info
        })

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

# 权重下载
@app.route('/api/weights/<int:weight_id>/download', methods=['GET'])
@require_auth()
def download_weight(weight_id):
    try:
        # 获取权重信息
        weight = training_manager.repo.get_weight_by_id(weight_id)
        if not weight:
            return jsonify({'success': False, 'error': '权重不存在'}), 404

        # 下载到临时文件
        import tempfile
        temp_path = tempfile.mktemp(suffix=f".{weight['format']}")

        training_manager.db_client.s3_client.download_file(
            weight['bucket_name'],
            weight['object_key'],
            temp_path
        )

        # 生成文件名
        training = training_manager.repo.get_training_by_id(weight['training_id'])
        filename = f"training_{weight['training_id']}_{weight['weight_type']}_epoch{weight['epoch_number']}.{weight['format']}"

        return send_file(
            temp_path,
            as_attachment=True,
            download_name=filename,
            mimetype=mimetypes.guess_type(filename)[0] or 'application/octet-stream'
        )

    except Exception as e:
        import traceback
        print(traceback.format_exc())
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/gpu', methods=['GET'])
@require_auth()
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

@app.route('/api/power', methods=['GET'])
@require_auth()
def get_power_status():
    try:
        ac_connected = get_ac_status()

        if ac_connected is None:
            return jsonify({
                'success': False,
                'error': '无法获取电源状态或系统不支持'
            }), 500

        return jsonify({
            'success': True,
            'data': {
                'ac_connected': ac_connected
            }
        })

    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/trainings/<int:training_id>/logs', methods=['GET'])
@require_auth()
def get_training_logs(training_id):
    """获取训练实时日志"""
    try:
        tail = request.args.get('tail', 200, type=int)
        logs = training_manager.get_training_logs(training_id, tail=tail)
        return jsonify({
            'success': True,
            'training_id': training_id,
            'logs': logs,
            'is_running': training_id in training_manager._processes
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/trainings/<int:training_id>/metrics', methods=['GET'])
@require_auth()
def get_training_metrics_history(training_id):
    """获取训练指标历史"""
    try:
        tail = request.args.get('tail', 100, type=int)
        metrics = training_manager.get_training_metrics(training_id, tail=tail)
        return jsonify({
            'success': True,
            'training_id': training_id,
            'metrics': metrics
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/trainings/<int:training_id>/stop', methods=['POST'])
@require_auth()
def stop_training_task(training_id):
    """强制停止训练进程"""
    try:
        training_manager.stop_training(training_id)
        return jsonify({
            'success': True,
            'message': '训练任务已停止'
        })
    except ValueError as e:
        return jsonify({'success': False, 'error': str(e)}), 400
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/trainings/<int:training_id>', methods=['DELETE'])
@require_auth()
def delete_training_task(training_id):
    """删除训练任务及相关权重文件"""
    try:
        # 若训练正在运行，先停止
        training = training_manager.get_training_detail(training_id)
        if training.get('status') == 'running':
            try:
                training_manager.stop_training(training_id)
            except Exception:
                pass  # 进程可能已不存在
        training_manager.delete_training(training_id)
        return jsonify({
            'success': True,
            'message': '训练任务已删除'
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/profile', methods=['GET'])
@require_auth()
def api_user_profile_contributions():
    """获取当前登录用户的个人贡献统计信息"""
    try:
        user_id = session.get('user_id')
        user = auth_service.get_user_contributions(user_id)
        if not user:
            return jsonify({'success': False, 'error': '用户不存在'}), 404
        return jsonify({'success': True, 'user': user})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/admin/users', methods=['GET'])
@require_auth(roles=['admin'])
def api_admin_list_users():
    """管理员：获取所有用户列表"""
    try:
        users = auth_service.list_users()
        return jsonify({'success': True, 'users': users})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/admin/users', methods=['POST'])
@require_auth(roles=['admin'])
def api_admin_create_user():
    """管理员：创建新用户"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'success': False, 'error': '请求体不能为空'}), 400

        username = data.get('username', '').strip()
        password = data.get('password', '')
        role = data.get('role', 'researcher').strip()

        if not username or not password:
            return jsonify({'success': False, 'error': '用户名和密码不能为空'}), 400

        if len(username) < 3 or len(username) > 50:
            return jsonify({'success': False, 'error': '用户名长度需在3-50字符之间'}), 400

        if len(password) < 6:
            return jsonify({'success': False, 'error': '密码长度至少6位'}), 400

        if role not in ('admin', 'researcher', 'guest'):
            role = 'researcher'

        try:
            user_id = auth_service.register_user(username, password, role)
        except ValueError as e:
            return jsonify({'success': False, 'error': str(e)}), 409

        return jsonify({
            'success': True,
            'user_id': user_id,
            'message': f'用户 "{username}" 创建成功'
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': f'创建失败: {str(e)}'}), 500

@app.route('/api/admin/users/<int:user_id>', methods=['DELETE'])
@require_auth(roles=['admin'])
def api_admin_delete_user(user_id):
    """管理员：删除用户（不能删除自己）"""
    try:
        current_user_id = session.get('user_id')
        if user_id == current_user_id:
            return jsonify({'success': False, 'error': '不能删除当前登录的账号'}), 400

        user = auth_service.get_user_by_id(user_id)
        if not user:
            return jsonify({'success': False, 'error': '用户不存在'}), 404

        username = user['username']
        auth_service.delete_user(user_id)

        return jsonify({
            'success': True,
            'message': f'用户 "{username}" 已注销'
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/dependencies/venv', methods=['POST'])
@require_auth(roles=['admin'])
def api_create_venv():
    """创建训练任务虚拟环境（仅管理员）"""
    try:
        venv_path = _app_config.get('training', {}).get('venv_path', 'C:/VeriVek/TaskEnv/venv')
        success = create_task_environment(venv_path=venv_path)
        return jsonify({
            'success': success,
            'message': '虚拟环境创建成功' if success else '虚拟环境创建失败'
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/dependencies/pytorch', methods=['POST'])
@require_auth(roles=['admin'])
def api_install_pytorch():
    """在训练任务虚拟环境中安装 PyTorch（仅管理员）"""
    try:
        venv_path = _app_config.get('training', {}).get('venv_path', 'C:/VeriVek/TaskEnv/venv')
        success = install_pytorch(venv_path=venv_path)
        return jsonify({
            'success': success,
            'message': 'PyTorch 安装成功' if success else 'PyTorch 安装失败'
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/dependencies/venv_path', methods=['POST'])
@require_auth(roles=['admin'])
def api_set_venv_path():
    """管理员：修改训练任务虚拟环境路径"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({'success': False, 'error': '请求体不能为空'}), 400

        new_path = data.get('venv_path', '').strip()
        if not new_path:
            return jsonify({'success': False, 'error': '虚拟环境路径不能为空'}), 400

        # 确保 training 配置段存在
        if 'training' not in _app_config:
            _app_config['training'] = {}
        _app_config['training']['venv_path'] = new_path

        # 写回 config.json
        with open(_config_path, 'w', encoding='utf-8') as f:
            json.dump(_app_config, f, indent=4, ensure_ascii=False)

        # 重新初始化 TrainingManager
        global training_manager
        training_manager = TrainingManager(db_client, venv_path=new_path)

        return jsonify({
            'success': True,
            'venv_path': new_path,
            'message': '虚拟环境路径已更新'
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True)