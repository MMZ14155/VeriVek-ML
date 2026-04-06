import os
import sys
from flask import Flask, jsonify, request, render_template
from werkzeug.utils import secure_filename
import tempfile

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from VerivekCore import get_gpu_info, get_total_usage
from VerivekCore.Database.db_client import DbClient
from VerivekCore.ModelManager.model_manager import ModelManager

app = Flask(__name__)

db_client = DbClient()
model_manager = ModelManager(db_client)

ALLOWED_EXTENSIONS = {'py'}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/datasets', methods=['GET'])
def get_datasets():
    pass


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


@app.route('/api/models/import', methods=['POST'])
def import_model():
    """导入模型"""
    try:
        if 'model_file' not in request.files:
            return jsonify({'error': '未找到文件'}), 400

        file = request.files['model_file']
        if file.filename == '':
            return jsonify({'error': '未选择文件'}), 400

        if not allowed_file(file.filename):
            return jsonify({'error': f'不支持的文件格式，仅支持: {", ".join(ALLOWED_EXTENSIONS)}'}), 400

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