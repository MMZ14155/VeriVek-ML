import ctypes
import json
import sys
from pathlib import Path

# 引入 Python 版生成器，用于逐字节对比验证 C++ 实现的功能一致性
sys.path.insert(0, str(Path(__file__).parents[2] / "Training"))
from training_code_generator import TrainingCodeGenerator, generate_training_script

dll_path = Path(__file__).parent / "build" / "train_codegen.dll"
dll = ctypes.CDLL(str(dll_path), winmode=0)

dll.tc_generate_training_script.argtypes = [ctypes.c_char_p]
dll.tc_generate_training_script.restype = ctypes.c_char_p

dll.tc_get_hyperparameter_schema.argtypes = []
dll.tc_get_hyperparameter_schema.restype = ctypes.c_char_p

dll.tc_get_last_error.argtypes = []
dll.tc_get_last_error.restype = ctypes.c_char_p


def generate_via_dll(config: dict):
    payload = json.dumps(config, ensure_ascii=False).encode("utf-8")
    result = dll.tc_generate_training_script(payload)
    if not result:
        err = ctypes.string_at(dll.tc_get_last_error()).decode("utf-8")
        return None, err
    return ctypes.string_at(result).decode("utf-8"), None


def compare_case(name, config, py_kwargs):
    cpp_code, err = generate_via_dll(config)
    if err:
        print(f"[FAIL] {name}: DLL 返回错误: {err}")
        return False

    py_code = generate_training_script(**py_kwargs)
    if cpp_code == py_code:
        print(f"[PASS] {name} (长度 {len(cpp_code)} 字符，逐字节一致)")
        return True

    print(f"[FAIL] {name}: 输出不一致")
    cpp_lines = cpp_code.splitlines()
    py_lines = py_code.splitlines()
    for i, (a, b) in enumerate(zip(cpp_lines, py_lines)):
        if a != b:
            print(f"  第 {i + 1} 行差异:")
            print(f"    C++:    {a!r}")
            print(f"    Python: {b!r}")
            break
    else:
        print(f"  行数不同: C++ {len(cpp_lines)} 行, Python {len(py_lines)} 行")
    return False


def test_default_config():
    return compare_case(
        "默认配置",
        {},
        dict(model_class_name="Model", hyperparameters=None, data_root="./data", num_classes=4),
    )


def test_full_custom_config():
    hp = {"epochs": 100, "batch_size": 64, "lr": 0.0001, "optimizer": "AdamW"}
    return compare_case(
        "全自定义配置 (AdamW)",
        {"model_class_name": "MyModel", "hyperparameters": hp, "data_root": "./data", "num_classes": 4},
        dict(model_class_name="MyModel", hyperparameters=hp, data_root="./data", num_classes=4),
    )


def test_sgd_optimizer():
    hp = {"epochs": 10, "batch_size": 16, "lr": 0.01, "optimizer": "SGD"}
    return compare_case(
        "SGD 优化器",
        {"hyperparameters": hp, "data_root": "D:/datasets/pets", "num_classes": 2},
        dict(model_class_name="Model", hyperparameters=hp, data_root="D:/datasets/pets", num_classes=2),
    )


def test_partial_hyperparams():
    hp = {"epochs": 5}
    return compare_case(
        "部分超参数（其余默认）",
        {"hyperparameters": hp, "num_classes": 10},
        dict(model_class_name="Model", hyperparameters=hp, data_root="./data", num_classes=10),
    )


def test_unknown_optimizer_fallback():
    hp = {"epochs": 3, "batch_size": 32, "lr": 0.001, "optimizer": "RMSprop"}
    return compare_case(
        "未知优化器回退 Adam",
        {"hyperparameters": hp},
        dict(model_class_name="Model", hyperparameters=hp, data_root="./data", num_classes=4),
    )


def test_windows_path_backslash():
    hp = {"optimizer": "Adam"}
    return compare_case(
        "Windows 反斜杠路径",
        {"hyperparameters": hp, "data_root": "D:\\datasets\\animals", "num_classes": 3},
        dict(model_class_name="Model", hyperparameters=hp, data_root="D:\\datasets\\animals", num_classes=3),
    )


def test_null_config():
    result = dll.tc_generate_training_script(None)
    if not result:
        err = ctypes.string_at(dll.tc_get_last_error()).decode("utf-8")
        print(f"[FAIL] NULL 配置: DLL 返回错误: {err}")
        return False
    cpp_code = ctypes.string_at(result).decode("utf-8")
    py_code = generate_training_script("Model", None, "./data", 4)
    ok = cpp_code == py_code
    print(f"[{'PASS' if ok else 'FAIL'}] NULL 配置（等价全默认）")
    return ok


def test_schema():
    result = dll.tc_get_hyperparameter_schema()
    if not result:
        err = ctypes.string_at(dll.tc_get_last_error()).decode("utf-8")
        print(f"[FAIL] schema: DLL 返回错误: {err}")
        return False
    cpp_schema = json.loads(ctypes.string_at(result).decode("utf-8"))
    py_schema = TrainingCodeGenerator().get_hyperparameter_schema()
    ok = cpp_schema == py_schema
    print(f"[{'PASS' if ok else 'FAIL'}] 超参数 schema 与 Python 版一致")
    if not ok:
        print("  C++:   ", json.dumps(cpp_schema, ensure_ascii=False, sort_keys=True))
        print("  Python:", json.dumps(py_schema, ensure_ascii=False, sort_keys=True))
    return ok


def test_invalid_json():
    result = dll.tc_generate_training_script(b"{invalid json")
    if result:
        print("[FAIL] 非法 JSON: 应返回错误但返回了结果")
        return False
    err = ctypes.string_at(dll.tc_get_last_error()).decode("utf-8")
    print(f"[PASS] 非法 JSON 正确报错: {err}")
    return True


def test_generated_script_syntax():
    import ast
    code, err = generate_via_dll({"hyperparameters": {"epochs": 1, "optimizer": "AdamW"}})
    if err:
        print(f"[FAIL] 语法检查: DLL 返回错误: {err}")
        return False
    try:
        ast.parse(code)
    except SyntaxError as e:
        print(f"[FAIL] 语法检查: 生成的脚本存在语法错误: {e}")
        return False
    print("[PASS] 生成的脚本通过 Python 语法检查")
    return True


if __name__ == "__main__":
    tests = [
        test_default_config,
        test_full_custom_config,
        test_sgd_optimizer,
        test_partial_hyperparams,
        test_unknown_optimizer_fallback,
        test_windows_path_backslash,
        test_null_config,
        test_schema,
        test_invalid_json,
        test_generated_script_syntax,
    ]
    results = [t() for t in tests]
    passed = sum(results)
    print(f"\n{passed}/{len(results)} 项测试通过")
    sys.exit(0 if all(results) else 1)
