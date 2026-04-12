import json
from collections import defaultdict, deque
from typing import Dict, List, Optional, Tuple, Any, Union

class ArchitectureGenerator:
    # 组件默认参数（用于补充缺失值）
    DEFAULT_PARAMS = {
        'Conv2d': {'kernel_size': 3, 'stride': 1, 'padding': 0, 'bias': True},
        'MaxPool2d': {'kernel_size': 2, 'stride': 2, 'padding': 0},
        'Linear': {'bias': True},
        'Dropout': {'p': 0.5, 'inplace': False},
        'ReLU': {'inplace': False},
        'BatchNorm2d': {'eps': 1e-05, 'momentum': 0.1},
        'Softmax': {'dim': 1},
        'Flatten': {'start_dim': 1, 'end_dim': -1},
        'View': {'shape': [-1, 512]},
        'AdaptiveAvgPool2d': {'output_size': (1, 1)},
    }

    # 需要特殊处理的层（在forward中直接操作，不需要nn.Module定义）
    FUNCTIONAL_LAYERS = {'Flatten', 'View', 'ReLU', 'Sigmoid', 'Tanh', 'Softmax', 'Dropout'}

    def __init__(
            self,
            graph_structure: Dict[str, Any],
            input_channels: int = None,
            input_size: Optional[tuple[int, int]] = None,
    ):
        self.nodes = graph_structure.get('nodes', [])
        self.connections = graph_structure.get('connections', [])
        self.node_map = {n['id']: n for n in self.nodes}
        self.input_channels = input_channels or 1
        self.input_size = input_size or (224, 224)

        # 输入形状: (batch, channels, height, width) - 用于跟踪，batch通常为1
        self.input_shape = [1, self.input_channels, self.input_size[0], self.input_size[1]]

        # 形状追踪：node_id -> 输出形状元组
        self.node_shapes = {}

        # 构建邻接表和入度
        self.adj = defaultdict(list)  # node_id -> [(to_node_id, from_port, to_port)]
        self.in_degree = defaultdict(int)
        self._build_graph()

    def _build_graph(self):
        """构建图结构"""
        for node in self.nodes:
            self.in_degree[node['id']] = 0

        for conn in self.connections:
            from_id = conn['from']['nodeId']
            to_id = conn['to']['nodeId']
            from_port = conn['from']['port']
            to_port = conn['to']['port']

            self.adj[from_id].append((to_id, from_port, to_port))
            self.in_degree[to_id] += 1

    def topological_sort(self) -> List[Dict]:
        """
        Kahn算法进行拓扑排序
        返回: 按执行顺序排列的节点列表
        """
        # 复制入度，避免修改原始数据
        temp_in_degree = dict(self.in_degree)
        queue = deque([n['id'] for n in self.nodes if temp_in_degree[n['id']] == 0])
        result = []
        visited = set()

        while queue:
            node_id = queue.popleft()
            node = self.node_map[node_id]

            if node_id not in visited:
                result.append(node)
                visited.add(node_id)

                for next_id, _, _ in self.adj[node_id]:
                    temp_in_degree[next_id] -= 1
                    if temp_in_degree[next_id] == 0:
                        queue.append(next_id)

        if len(result) != len(self.nodes):
            unvisited = [n for n in self.nodes if n['id'] not in visited]
            raise ValueError(f"图中存在环或孤立节点，无法拓扑排序。未访问节点: {unvisited}")

        return result

    def _propagate_shape(self, node: Dict, input_shape: List[int]) -> Tuple[List[int], Dict[str, Any]]:
        """
        根据输入形状计算当前节点的输出形状，并推断缺失参数

        返回: (output_shape, inferred_params)
            output_shape: 当前节点的输出形状 [batch, ...]
            inferred_params: 需要自动填充的参数，如 {'in_channels': 3, 'in_features': 512}
        """
        node_type = node['type']
        props = node.get('properties', {})
        inferred = {}

        if node_type == 'Input':
            # 使用初始化时传入的尺寸
            output_shape = self.input_shape.copy()
            return output_shape, inferred

        elif node_type == 'Conv2d':
            # 自动推断 in_channels（输入形状的通道维度）
            in_channels = input_shape[1]
            inferred['in_channels'] = in_channels

            out_channels = props.get('out_channels', 32)
            kernel = props.get('kernel_size', 3)
            stride = props.get('stride', 1)
            padding = props.get('padding', 0)
            dilation = props.get('dilation', 1)

            # 计算输出尺寸: floor((W + 2P - D*(K-1) - 1) / S) + 1
            h_out = (input_shape[2] + 2 * padding - dilation * (kernel - 1) - 1) // stride + 1
            w_out = (input_shape[3] + 2 * padding - dilation * (kernel - 1) - 1) // stride + 1

            output_shape = [input_shape[0], out_channels, h_out, w_out]

        elif node_type == 'MaxPool2d':
            kernel = props.get('kernel_size', 2)
            stride = props.get('stride', 2)
            padding = props.get('padding', 0)

            h_out = (input_shape[2] + 2 * padding - (kernel - 1) - 1) // stride + 1
            w_out = (input_shape[3] + 2 * padding - (kernel - 1) - 1) // stride + 1

            output_shape = [input_shape[0], input_shape[1], h_out, w_out]

        elif node_type == 'AvgPool2d':
            kernel = props.get('kernel_size', 2)
            stride = props.get('stride', kernel)  # 默认stride等于kernel_size
            padding = props.get('padding', 0)

            h_out = (input_shape[2] + 2 * padding - kernel) // stride + 1
            w_out = (input_shape[3] + 2 * padding - kernel) // stride + 1

            output_shape = [input_shape[0], input_shape[1], h_out, w_out]

        elif node_type == 'AdaptiveAvgPool2d':
            output_size = props.get('output_size', (1, 1))
            if isinstance(output_size, int):
                output_size = (output_size, output_size)
            output_shape = [input_shape[0], input_shape[1], output_size[0], output_size[1]]

        elif node_type == 'BatchNorm2d':
            # 通道数不变
            num_features = props.get('num_features', input_shape[1])
            inferred['num_features'] = num_features
            output_shape = input_shape.copy()

        elif node_type in ['Flatten', 'View']:
            if node_type == 'View':
                shape = props.get('shape', [-1, 512])
            else:  # Flatten
                shape = [-1]  # 动态batch

            # 计算总元素数（排除batch维度）
            total = 1
            for dim in input_shape[1:]:
                total *= dim

            # 处理形状中的-1（自动推断）
            final_shape = []
            minus_one_idx = -1
            for i, s in enumerate(shape):
                if s == -1:
                    minus_one_idx = i
                    final_shape.append(1)  # 占位
                else:
                    final_shape.append(s)

            if minus_one_idx >= 0:
                known_product = 1
                for s in final_shape:
                    known_product *= s
                final_shape[minus_one_idx] = total // known_product

            # 推断 in_features 用于后续的 Linear 层
            if final_shape[0] == -1 or final_shape[0] == input_shape[0]:
                inferred['in_features'] = final_shape[1] if len(final_shape) > 1 else total
            else:
                inferred['in_features'] = final_shape[0]

            # 输出形状: [batch, *dims]
            if final_shape[0] == -1:
                final_shape[0] = input_shape[0]
            output_shape = [input_shape[0]] + final_shape[1:] if final_shape[0] == input_shape[0] else final_shape

        elif node_type == 'Linear':
            # 处理输入形状
            if len(input_shape) == 2:
                in_features = input_shape[1]
            elif len(input_shape) > 2:
                # 需要flatten
                in_features = 1
                for dim in input_shape[1:]:
                    in_features *= dim
                inferred['need_flatten_warning'] = True
            else:
                in_features = input_shape[1] if len(input_shape) > 1 else input_shape[0]

            inferred['in_features'] = in_features
            out_features = props.get('out_features', 10)
            output_shape = [input_shape[0], out_features]

        elif node_type in ['ReLU', 'Sigmoid', 'Tanh', 'Dropout']:
            # 形状不变
            output_shape = input_shape.copy()

        elif node_type == 'Output':
            output_shape = input_shape.copy()

        else:
            # 默认：形状不变
            output_shape = input_shape.copy()

        return output_shape, inferred

    def get_input_node(self, node_id: int) -> Optional[Tuple[int, str]]:
        """
        获取指定节点的输入来源
        返回: (source_node_id, source_var_name) 或 None
        """
        for conn in self.connections:
            if conn['to']['nodeId'] == node_id:
                return conn['from']['nodeId'], f"x_{conn['from']['nodeId']}"
        return None

    def generate_layer_name(self, node: Dict) -> Optional[str]:
        """生成层的变量名"""
        node_type = node['type']
        node_id = node['id']

        if node_type in self.FUNCTIONAL_LAYERS and node_type != 'Dropout':
            return None

        return f"self.layer_{node_type.lower()}_{node_id}"

    def format_param(self, key: str, value: Any) -> str:
        """格式化参数值"""
        if isinstance(value, bool):
            return str(value)
        elif isinstance(value, str):
            return f"'{value}'"
        elif isinstance(value, (list, tuple)):
            items = ', '.join(str(item) for item in value)
            if len(value) == 1:
                return f"({items},)"
            return f"({items})"
        else:
            return str(value)

    def generate_layer_def(self, node: Dict) -> Optional[str]:
        """
        生成nn.Module层定义（__init__中的代码）
        使用推断的参数（如果存在）
        """
        node_type = node['type']
        node_id = node['id']
        properties = node.get('properties', {})
        inferred = node.get('inferred_properties', {})

        if node_type in ['Input', 'Output']:
            return None

        if node_type in self.FUNCTIONAL_LAYERS:
            return None

        layer_name = self.generate_layer_name(node)
        params = []

        # 合并默认参数、推断参数和自定义参数（优先级：自定义 > 推断 > 默认）
        default_params = self.DEFAULT_PARAMS.get(node_type, {}).copy()
        merged_params = {**default_params, **inferred, **properties}

        for key, value in merged_params.items():
            if key in ['inputs', 'outputs', 'name', 'need_flatten_warning', 'shape']:  # 跳过非nn.Module参数
                continue
            params.append(f"{key}={self.format_param(key, value)}")

        param_str = ", ".join(params)
        return f"        {layer_name} = nn.{node_type}({param_str})"

    def generate_forward_line(self, node: Dict, input_var: str) -> Tuple[str, str]:
        """
        生成forward中的一行代码
        返回: (code_line, output_var_name)
        """
        node_type = node['type']
        node_id = node['id']
        output_var = f"x_{node_id}"

        if node_type == 'Input':
            return f"        # Input: {self.input_shape}", "x"

        elif node_type == 'Output':
            return f"        return {input_var}", output_var

        elif node_type == 'Flatten':
            # 使用实际的形状信息生成更精确的view
            shape = self.node_shapes.get(node_id, [0, -1])
            if len(shape) == 2:
                return f"        {output_var} = {input_var}.view({input_var}.size(0), {shape[1]})", output_var
            return f"        {output_var} = {input_var}.view({input_var}.size(0), -1)", output_var

        elif node_type == 'View':
            shape = node.get('properties', {}).get('shape', [-1, 512])
            shape_str = ", ".join(str(s) if s != -1 else f"{input_var}.size(0)" if i == 0 else "-1"
                                  for i, s in enumerate(shape))
            return f"        {output_var} = {input_var}.view({shape_str})", output_var

        elif node_type in ['ReLU', 'Sigmoid', 'Tanh']:
            # 函数式调用：F.relu(x)
            return f"        {output_var} = F.{node_type.lower()}({input_var})", output_var

        elif node_type == 'Softmax':
            dim = node.get('properties', {}).get('dim', 1)
            return f"        {output_var} = F.{node_type.lower()}({input_var}, dim={dim})", output_var

        elif node_type == 'Dropout':
            layer_name = self.generate_layer_name(node)
            return f"        {output_var} = {layer_name}({input_var})", output_var

        else:
            # 标准nn.Module层
            layer_name = self.generate_layer_name(node)
            return f"        {output_var} = {layer_name}({input_var})", output_var

    def _analyze_variable_reuse(self, sorted_nodes: List[Dict]) -> Dict[int, str]:
        """
        分析哪些节点的变量可以被复用
        
        核心思想：
        - 计算每个节点的输出被多少个后续节点引用（引用计数）
        - 如果节点A的输出只被节点B使用，且B只有一个输入来自A，则B可以复用A的变量名
        
        返回: node_id -> 复用的变量名（如果不可复用则为None）
        """
        # 计算每个节点的出度（即输出被多少节点引用）
        out_degree = defaultdict(int)
        # 记录每个节点的输入来源数量
        input_count = defaultdict(int)
        
        for node in sorted_nodes:
            node_id = node['id']
            # 统计该节点的输出被多少节点引用
            for next_id, _, _ in self.adj[node_id]:
                out_degree[node_id] += 1
                input_count[next_id] += 1
        
        # 确定哪些变量可以被复用
        var_reuse_map = {}  # node_id -> 复用哪个节点的变量名
        var_alias = {}      # node_id -> 实际使用的变量名
        
        for node in sorted_nodes:
            node_id = node['id']
            node_type = node['type']
            
            if node_type == 'Input':
                var_alias[node_id] = 'x'
                continue
            
            # 找到当前节点的输入来源
            input_sources = []
            for conn in self.connections:
                if conn['to']['nodeId'] == node_id:
                    from_id = conn['from']['nodeId']
                    input_sources.append(from_id)
            
            # 变量复用条件：
            # 1. 只有一个输入来源
            # 2. 输入来源节点的输出只被当前节点引用（引用计数为1）
            # 3. 当前节点不是Output节点（需要保留return语句的清晰性）
            # 4. 输入来源不是Input节点（保持x的特殊性）
            if (len(input_sources) == 1 and 
                out_degree[input_sources[0]] == 1 and 
                node_type != 'Output' and
                self.node_map[input_sources[0]]['type'] != 'Input'):
                
                source_id = input_sources[0]
                # 继承源节点的变量别名
                reused_var = var_alias.get(source_id, f"x_{source_id}")
                var_reuse_map[node_id] = reused_var
                var_alias[node_id] = reused_var
            else:
                # 创建新变量名
                var_alias[node_id] = f"x_{node_id}"
        
        return var_reuse_map

    def generate_forward_line_optimized(self, node: Dict, input_var: str, 
                                        output_var: str, reuse_input: bool = False) -> str:
        """
        生成优化后的forward代码行，支持变量名复用
        
        Args:
            node: 当前节点
            input_var: 输入变量名
            output_var: 输出变量名（可能与input_var相同表示复用）
            reuse_input: 是否复用输入变量名
        """
        node_type = node['type']
        node_id = node['id']
        
        # 如果复用输入变量，赋值目标是input_var
        target_var = input_var if reuse_input else output_var
        
        if node_type == 'Input':
            return f"        # Input: {self.input_shape}"

        elif node_type == 'Output':
            return f"        return {input_var}"

        elif node_type == 'Flatten':
            shape = self.node_shapes.get(node_id, [0, -1])
            if len(shape) == 2:
                return f"        {target_var} = {input_var}.view({input_var}.size(0), {shape[1]})"
            return f"        {target_var} = {input_var}.view({input_var}.size(0), -1)"

        elif node_type == 'View':
            shape = node.get('properties', {}).get('shape', [-1, 512])
            shape_str = ", ".join(str(s) if s != -1 else f"{input_var}.size(0)" if i == 0 else "-1"
                                  for i, s in enumerate(shape))
            return f"        {target_var} = {input_var}.view({shape_str})"

        elif node_type in ['ReLU', 'Sigmoid', 'Tanh']:
            return f"        {target_var} = F.{node_type.lower()}({input_var})"

        elif node_type == 'Softmax':
            dim = node.get('properties', {}).get('dim', 1)
            return f"        {target_var} = F.{node_type.lower()}({input_var}, dim={dim})"

        elif node_type == 'Dropout':
            layer_name = self.generate_layer_name(node)
            return f"        {target_var} = {layer_name}({input_var})"

        else:
            layer_name = self.generate_layer_name(node)
            return f"        {target_var} = {layer_name}({input_var})"

    def generate_code(self, class_name: str = "Model", optimize_vars: bool = True) -> str:
        """
        生成完整的PyTorch模型代码，集成形状传播和变量名优化
        
        Args:
            class_name: 生成的类名
            optimize_vars: 是否启用变量名复用优化
        """
        # 1. 拓扑排序
        sorted_nodes = self.topological_sort()

        # 2. 形状传播和参数推断
        current_shape = self.input_shape.copy()
        layer_defs = []

        for node in sorted_nodes:
            node_id = node['id']
            node_type = node['type']

            # 传播形状
            output_shape, inferred = self._propagate_shape(node, current_shape)
            self.node_shapes[node_id] = output_shape

            # 存储推断的参数到节点
            if inferred:
                node['inferred_properties'] = inferred

            # 生成层定义（使用推断后的参数）
            layer_def = self.generate_layer_def(node)
            if layer_def:
                layer_defs.append((node_id, layer_def, node_type))

            current_shape = output_shape

        # 3. 分析变量复用机会
        var_reuse_map = self._analyze_variable_reuse(sorted_nodes) if optimize_vars else {}

        # 4. 生成forward代码
        forward_lines = []
        var_map = {}  # node_id -> 实际使用的变量名

        for node in sorted_nodes:
            node_id = node['id']
            node_type = node['type']
            shape = self.node_shapes.get(node_id, [])

            if node_type == 'Input':
                var_map[node_id] = 'x'
                forward_lines.append(f"        # Input shape: {shape}")
                continue

            # 找到输入变量
            input_node_info = self.get_input_node(node_id)
            input_var = var_map.get(input_node_info[0], 'x') if input_node_info else 'x'
            
            # 确定输出变量名
            if node_id in var_reuse_map:
                # 复用输入变量名
                output_var = var_reuse_map[node_id]
                reuse_input = True
            else:
                # 创建新变量名
                output_var = f"x_{node_id}"
                reuse_input = False
            
            var_map[node_id] = output_var

            # 生成代码行
            line = self.generate_forward_line_optimized(node, input_var, output_var, reuse_input)

            # 添加形状注释（对关键层）
            if node_type in ['Conv2d', 'Linear', 'MaxPool2d', 'Flatten', 'View']:
                line += f"  # shape: {shape}"

            forward_lines.append(line)

        # 5. 组装代码
        code_lines = [
            "import torch",
            "import torch.nn as nn",
            "import torch.nn.functional as F",
            "",
            f"class {class_name}(nn.Module):",
            "    def __init__(self):",
            f"        super({class_name}, self).__init__()",
        ]

        # 添加层定义
        if layer_defs:
            for node_id, layer_def, node_type in layer_defs:
                code_lines.append(layer_def)
        else:
            code_lines.append("        pass")

        # 添加forward
        code_lines.extend([
            "",
            "    def forward(self, x):",
        ])
        code_lines.extend(forward_lines)

        # 如果没有return语句，添加默认返回
        if not any('return ' in line for line in forward_lines):
            last_var = var_map.get(sorted_nodes[-1]['id'], 'x') if sorted_nodes else 'x'
            code_lines.append(f"        return {last_var}")

        return "\n".join(code_lines)

    def analyze(self) -> Dict[str, Any]:
        """
        分析架构统计信息
        """
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
            node_type = node['type']
            stats['layer_counts'][node_type] += 1

            if node_type == 'Input':
                stats['has_input'] = True
            elif node_type == 'Output':
                stats['has_output'] = True

        # 检查警告
        if not stats['has_input']:
            stats['warnings'].append("架构缺少Input节点")
        if not stats['has_output']:
            stats['warnings'].append("架构缺少Output节点")

        # 运行形状传播以检查问题
        try:
            sorted_nodes = self.topological_sort()
            current_shape = self.input_shape.copy()
            for node in sorted_nodes:
                output_shape, _ = self._propagate_shape(node, current_shape)
                stats['output_shapes'][node['id']] = output_shape
                current_shape = output_shape
        except Exception as e:
            stats['warnings'].append(f"形状传播错误: {str(e)}")

        return dict(stats)

    def calculate_params(self) -> Dict[str, Any]:
        """
        计算模型的参数量

        返回: {
            'total_params': 总参数量,
            'trainable_params': 可训练参数量,
            'layer_details': [{'node_id', 'type', 'params', 'shape', 'details'}, ...],
            'total_size_mb': FP32模型大小(MB),
            'total_size_mb_fp16': FP16模型大小(MB),
            'summary_by_type': 按层类型汇总的统计
        }
        """
        # 先进行拓扑排序和形状传播，确保所有参数都被正确推断
        try:
            sorted_nodes = self.topological_sort()
        except ValueError as e:
            return {
                'error': str(e),
                'total_params': 0,
                'trainable_params': 0
            }

        # 确保形状传播已执行
        current_shape = self.input_shape.copy()
        for node in sorted_nodes:
            node_id = node['id']
            output_shape, inferred = self._propagate_shape(node, current_shape)
            self.node_shapes[node_id] = output_shape
            if inferred:
                node['inferred_properties'] = inferred
            current_shape = output_shape

        total_params = 0
        trainable_params = 0
        layer_details = []
        summary_by_type = {}

        for node in sorted_nodes:
            node_id = node['id']
            node_type = node['type']
            props = node.get('properties', {})
            inferred = node.get('inferred_properties', {})
            shape = self.node_shapes.get(node_id, [])

            params = 0
            param_details = {}

            if node_type == 'Conv2d':
                # 获取输入输出通道数
                in_channels = inferred.get('in_channels', props.get('in_channels', 1))
                out_channels = props.get('out_channels', 32)
                kernel = props.get('kernel_size', 3)
                bias = props.get('bias', True)

                # 权重: out_channels × in_channels × kernel_size^2
                weight_params = out_channels * in_channels * (kernel ** 2)
                # 偏置: out_channels
                bias_params = out_channels if bias else 0

                params = weight_params + bias_params
                param_details = {
                    'weight_shape': [out_channels, in_channels, kernel, kernel],
                    'bias': bias,
                    'calculation': f'{out_channels}×{in_channels}×{kernel}×{kernel} + {bias_params}'
                }

            elif node_type == 'Linear':
                in_features = inferred.get('in_features', props.get('in_features', 1))
                out_features = props.get('out_features', 10)
                bias = props.get('bias', True)

                weight_params = in_features * out_features
                bias_params = out_features if bias else 0

                params = weight_params + bias_params
                param_details = {
                    'weight_shape': [out_features, in_features],
                    'bias': bias,
                    'calculation': f'{in_features}×{out_features} + {bias_params}'
                }

            elif node_type == 'BatchNorm2d':
                num_features = inferred.get('num_features',
                                            props.get('num_features', shape[1] if len(shape) > 1 else 1))

                # weight + bias = 2 × num_features
                params = 2 * num_features
                param_details = {
                    'num_features': num_features,
                    'calculation': f'2×{num_features} (weight + bias)'
                }

            elif node_type == 'Dropout':
                # Dropout 没有可训练参数，但 p 是超参数
                p = props.get('p', 0.5)
                params = 0
                param_details = {'p': p, 'note': 'No trainable parameters'}

            elif node_type in ['ReLU', 'Sigmoid', 'Tanh', 'Softmax', 'Flatten', 'View',
                               'MaxPool2d', 'AvgPool2d', 'AdaptiveAvgPool2d', 'Input', 'Output']:
                params = 0
                param_details = {'note': 'No trainable parameters'}

            else:
                # 未知层类型，尝试从属性中查找可能的参数
                params = 0
                param_details = {'note': f'Unknown layer type: {node_type}'}

            # 更新统计
            if params > 0:
                total_params += params
                trainable_params += params  # 目前实现的所有层参数都是可训练的

                # 按类型汇总
                if node_type not in summary_by_type:
                    summary_by_type[node_type] = {'count': 0, 'params': 0}
                summary_by_type[node_type]['count'] += 1
                summary_by_type[node_type]['params'] += params

                layer_details.append({
                    'node_id': node_id,
                    'type': node_type,
                    'params': params,
                    'output_shape': shape,
                    'details': param_details
                })

        # 计算模型大小 (假设 float32 = 4 bytes, float16 = 2 bytes)
        total_size_mb = (total_params * 4) / (1024 * 1024)
        total_size_mb_fp16 = (total_params * 2) / (1024 * 1024)

        # 格式化输出
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
