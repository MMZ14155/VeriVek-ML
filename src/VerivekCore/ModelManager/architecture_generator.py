import ctypes
import json
import os
from collections import defaultdict
from copy import deepcopy
from typing import Any, Dict, List, Optional, Tuple

_DLL = None

def _get_dll():
    global _DLL
    if _DLL is None:
        dll_path = os.path.join(os.path.dirname(__file__), "vek_compiler.dll")
        _DLL = ctypes.CDLL(dll_path, winmode=0)
        _DLL.vk_compile_graph.argtypes = [ctypes.c_char_p, ctypes.c_char_p]
        _DLL.vk_compile_graph.restype = ctypes.c_char_p
        _DLL.vk_analyze_params.argtypes = [ctypes.c_char_p]
        _DLL.vk_analyze_params.restype = ctypes.c_char_p
        _DLL.vk_get_last_error.argtypes = []
        _DLL.vk_get_last_error.restype = ctypes.c_char_p
    return _DLL

def _call_compile_graph(graph_json: str, target: str = "pytorch") -> str:
    dll = _get_dll()
    result = dll.vk_compile_graph(graph_json.encode("utf-8"), target.encode("utf-8"))
    if result:
        return ctypes.string_at(result).decode("utf-8")
    err = dll.vk_get_last_error()
    msg = ctypes.string_at(err).decode("utf-8") if err else "unknown error"
    raise RuntimeError(msg)

def _call_analyze_params(graph_json: str) -> Dict[str, Any]:
    dll = _get_dll()
    result = dll.vk_analyze_params(graph_json.encode("utf-8"))
    if result:
        text = ctypes.string_at(result).decode("utf-8")
        return json.loads(text)
    err = dll.vk_get_last_error()
    msg = ctypes.string_at(err).decode("utf-8") if err else "unknown error"
    raise RuntimeError(msg)

class ArchitectureGenerator:
    # 默认参数表，仅用于兼容旧接口
    DEFAULT_PARAMS = {
        'Conv2d': {'kernel_size': 3, 'stride': 1, 'padding': 0, 'bias': True},
        'MaxPool2d': {'kernel_size': 2, 'stride': 2, 'padding': 0},
        'AvgPool2d': {'kernel_size': 2, 'stride': 2, 'padding': 0},
        'Linear': {'bias': True},
        'Dropout': {'p': 0.5, 'inplace': False},
        'ReLU': {'inplace': False},
        'LeakyReLU': {'negative_slope': 0.01, 'inplace': False},
        'GELU': {},
        'BatchNorm2d': {'eps': 1e-05, 'momentum': 0.1},
        'LayerNorm': {'eps': 1e-05, 'elementwise_affine': True},
        'Softmax': {'dim': 1},
        'Flatten': {'start_dim': 1, 'end_dim': -1},
        'View': {'shape': [-1, 512]},
        'AdaptiveAvgPool2d': {'output_size': (1, 1)},
        'Embedding': {'padding_idx': None, 'max_norm': None, 'norm_type': 2.0},
        'LSTM': {'hidden_size': 128, 'num_layers': 1, 'bias': True, 'batch_first': True, 'dropout': 0, 'bidirectional': False},
        'GRU': {'hidden_size': 128, 'num_layers': 1, 'bias': True, 'batch_first': True, 'dropout': 0, 'bidirectional': False},
        'Add': {},
        'Concat': {'dim': 1},
    }

    FUNCTIONAL_LAYERS = {'Flatten', 'View', 'ReLU', 'Sigmoid', 'Tanh', 'Softmax', 'Dropout', 'Add', 'Concat', 'GELU', 'LeakyReLU'}

    def __init__(
        self,
        graph_structure: Dict[str, Any],
        input_channels: int = None,
        input_size: Optional[Tuple[int, int]] = None,
    ):
        self.graph = deepcopy(graph_structure)
        self.nodes = self.graph.get('nodes', [])
        self.connections = self.graph.get('connections', [])
        self.input_channels = input_channels or 1
        self.input_size = input_size or (224, 224)
        self.input_shape = [1, self.input_channels, self.input_size[0], self.input_size[1]]

        # 覆盖输入节点的 shape
        if input_channels is not None or input_size is not None:
            for node in self.nodes:
                if node.get('type') == 'Input':
                    node.setdefault('properties', {})['shape'] = self.input_shape

    def _as_json(self) -> str:
        return json.dumps(self.graph, ensure_ascii=False)

    def generate_code(self, class_name: str = "Model", optimize_vars: bool = True) -> str:
        code = _call_compile_graph(self._as_json(), "pytorch")
        # 替换 DLL 输出的默认类名
        code = code.replace("class Model(nn.Module):", f"class {class_name}(nn.Module):")
        code = code.replace("        super().__init__()", f"        super({class_name}, self).__init__()")
        return code

    def analyze(self) -> Dict[str, Any]:
        stats = {
            'total_nodes': len(self.nodes),
            'layer_counts': defaultdict(int),
            'has_input': False,
            'has_output': False,
            'input_shape': self.input_shape,
            'output_shapes': {},
            'warnings': []
        }

        for node in self.nodes:
            node_type = node.get('type')
            stats['layer_counts'][node_type] += 1
            if node_type == 'Input':
                stats['has_input'] = True
            elif node_type == 'Output':
                stats['has_output'] = True

        if not stats['has_input']:
            stats['warnings'].append("架构缺少Input节点")
        if not stats['has_output']:
            stats['warnings'].append("架构缺少Output节点")

        try:
            _call_compile_graph(self._as_json(), "pytorch")
        except RuntimeError as e:
            stats['warnings'].append(f"编译错误: {str(e)}")

        return dict(stats)

    def calculate_params(self) -> Dict[str, Any]:
        try:
            raw = _call_analyze_params(self._as_json())
        except RuntimeError as e:
            return {
                'error': str(e),
                'total_params': 0,
                'trainable_params': 0
            }

        total_params = raw.get('total_params', 0)
        trainable_params = raw.get('trainable_params', 0)
        total_size_mb = raw.get('total_size_mb_fp32', 0)
        total_size_mb_fp16 = raw.get('total_size_mb_fp16', 0)

        layer_details = []
        summary_by_type = {}
        for layer in raw.get('layer_details', []):
            params = layer.get('params', 0)
            layer_type = layer.get('type', 'unknown')
            layer_details.append({
                'node_id': layer.get('name', 'unknown'),
                'type': layer_type,
                'params': params,
                'output_shape': [],
                'details': {
                    'calculation': layer.get('calculation', ''),
                    'note': layer.get('note', '')
                }
            })
            if params > 0:
                if layer_type not in summary_by_type:
                    summary_by_type[layer_type] = {'count': 0, 'params': 0}
                summary_by_type[layer_type]['count'] += 1
                summary_by_type[layer_type]['params'] += params

        def format_number(n):
            if n >= 1_000_000:
                return f"{n / 1_000_000:.2f}M"
            elif n >= 1_000:
                return f"{n / 1_000:.2f}K"
            else:
                return str(n)

        return {
            'total_params': total_params,
            'trainable_params': trainable_params,
            'non_trainable_params': total_params - trainable_params,
            'total_params_formatted': format_number(total_params),
            'total_size_mb': round(total_size_mb, 2),
            'total_size_mb_fp16': round(total_size_mb_fp16, 2),
            'layer_count': len([l for l in layer_details if l['params'] > 0]),
            'layer_details': layer_details,
            'summary_by_type': summary_by_type
        }