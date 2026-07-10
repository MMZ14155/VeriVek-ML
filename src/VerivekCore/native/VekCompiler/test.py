import ctypes
from pathlib import Path

dll_path = Path(__file__).parent / "build" / "vek_compiler.dll"
dll = ctypes.CDLL(str(dll_path), winmode=0)

dll.vk_compile_vek.argtypes = [ctypes.c_char_p, ctypes.c_char_p]
dll.vk_compile_vek.restype = ctypes.c_char_p

dll.vk_compile_graph.argtypes = [ctypes.c_char_p, ctypes.c_char_p]
dll.vk_compile_graph.restype = ctypes.c_char_p

dll.vk_analyze_params.argtypes = [ctypes.c_char_p]
dll.vk_analyze_params.restype = ctypes.c_char_p

dll.vk_get_last_error.argtypes = []
dll.vk_get_last_error.restype = ctypes.c_char_p

dll.vk_analyze_params.argtypes = [ctypes.c_char_p]
dll.vk_analyze_params.restype = ctypes.c_char_p

# Vek 表示的 LeNet5 网络结构（使用全命名参数）
source = b"""network LeNet5 {
    input (1, 32, 32)
    conv2d(out_channels=6, kernel_size=5)
    tanh
    avgpool2d(kernel_size=2, stride=2)
    conv2d(out_channels=16, kernel_size=5)
    tanh
    avgpool2d(kernel_size=2, stride=2)
    flatten
    dense(out_features=120)
    tanh
    dense(out_features=84)
    tanh
    dense(out_features=10)
}
"""

def compile_network(source, target):
    result = dll.vk_compile_vek(source, target)
    if result:
        code = ctypes.string_at(result).decode('utf-8')
        return code, None
    else:
        err = dll.vk_get_last_error()
        msg = ctypes.string_at(err).decode('utf-8')
        return None, msg

def compile_graph(graph_json, target):
    result = dll.vk_compile_graph(graph_json, target)
    if result:
        code = ctypes.string_at(result).decode('utf-8')
        return code, None
    else:
        err = dll.vk_get_last_error()
        msg = ctypes.string_at(err).decode('utf-8')
        return None, msg

def analyze_params(graph_json):
    result = dll.vk_analyze_params(graph_json)
    if result:
        text = ctypes.string_at(result).decode('utf-8')
        return text, None
    else:
        err = dll.vk_get_last_error()
        msg = ctypes.string_at(err).decode('utf-8')
        return None, msg


def test_graph_to_pytorch():
    graph_json_path = Path(__file__).parents[4] / "resources" / "architectures" / "vgg11_graph.json"
    graph_json = graph_json_path.read_text(encoding='utf-8')
    code, err = compile_graph(graph_json.encode('utf-8'), b"pytorch")
    if err:
        print("Graph to PyTorch error:", err)
        return
    print("=== Graph to PyTorch output (VGG11) ===")
    print(code)

def test_pytorch():
    code, err = compile_network(source, b"pytorch")
    if err:
        print("PyTorch compile error:", err)
        return
    print("=== PyTorch output ===")
    print(code)

def test_tensorflow():
    code, err = compile_network(source, b"tensorflow")
    if err:
        print("TensorFlow compile error (expected):", err)
        return
    print("=== TensorFlow output ===")
    print(code)

def test_analyze_params():
    graph_json_path = Path(__file__).parents[4] / "resources" / "architectures" / "vgg11_graph.json"
    graph_json = graph_json_path.read_text(encoding='utf-8')
    text, err = analyze_params(graph_json.encode('utf-8'))
    if err:
        print("Analyze params error:", err)
        return
    print("=== Analyze params output (VGG11) ===")
    print(text)


if __name__ == "__main__":
    test_graph_to_pytorch()
    print()
    test_analyze_params()
    print()
    test_pytorch()
    test_tensorflow()