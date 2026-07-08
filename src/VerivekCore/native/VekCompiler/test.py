import ctypes
from pathlib import Path

dll_path = Path(__file__).parent / "build" / "vek_compiler.dll"
dll = ctypes.CDLL(str(dll_path), winmode=0)

dll.vek_compile.argtypes = [ctypes.c_char_p, ctypes.c_char_p]
dll.vek_compile.restype = ctypes.c_char_p

dll.vek_graph_to_vek.argtypes = [ctypes.c_char_p]
dll.vek_graph_to_vek.restype = ctypes.c_char_p

dll.vek_get_last_error.argtypes = []
dll.vek_get_last_error.restype = ctypes.c_char_p

# Vek 表示的 LeNet5 网络结构
source = b"""network LeNet5 {
    input (1, 32, 32)
    conv2d(6, 5)
    tanh
    avgpool2d(2, stride=2)
    conv2d(16, 5)
    tanh
    avgpool2d(2, stride=2)
    flatten
    dense(120)
    tanh
    dense(84)
    tanh
    dense(10)
}
"""

def compile_network(source, target):
    result = dll.vek_compile(source, target)
    if result:
        code = ctypes.string_at(result).decode('utf-8')
        return code, None
    else:
        err = dll.vek_get_last_error()
        msg = ctypes.string_at(err).decode('utf-8')
        return None, msg

def graph_to_vek(graph_json):
    result = dll.vek_graph_to_vek(graph_json)
    if result:
        code = ctypes.string_at(result).decode('utf-8')
        return code, None
    else:
        err = dll.vek_get_last_error()
        msg = ctypes.string_at(err).decode('utf-8')
        return None, msg

def test_graph_to_vek():
    graph_json_path = Path(__file__).parents[4] / "resources" / "architectures" / "vgg11_graph.json"
    graph_json = graph_json_path.read_text(encoding='utf-8')
    code, err = graph_to_vek(graph_json.encode('utf-8'))
    if err:
        print("Graph to Vek error:", err)
        return
    print("=== Graph to Vek output (VGG11) ===")
    print(code)
    print("=== Compile to PyTorch ===")
    pytorch, err = compile_network(code.encode('utf-8'), b"pytorch")
    if err:
        print("PyTorch compile error:", err)
    else:
        print(pytorch)


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

if __name__ == "__main__":
    test_graph_to_vek()
    print()
    test_pytorch()
    test_tensorflow()