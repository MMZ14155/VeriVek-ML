#pragma once

#include <string>

namespace train_codegen {
    struct Hyperparameters {
        int epochs = 50;
        int batch_size = 32;
        double lr = 0.001;
        std::string optimizer = "Adam"; // 仅支持 Adam, SGD, AdamW
    };

    struct DatasetConfig {
        std::string type = "image";
        std::string data_root = "./data";
        int num_classes = 4;
    };

    class TrainingCodeGenerator {
    public:
        explicit TrainingCodeGenerator(
            std::string model_class_name = "Model",
            Hyperparameters hyperparameters = {},
            DatasetConfig dataset_config = {}
        );

        std::string generate() const; // 生成完整的训练脚本代码，与 Python 版逐字节一致
        std::string get_hyperparameter_schema() const; // 返回超参数 schema 的 JSON 字符串

    private:
        std::string model_class_name_;
        Hyperparameters hyperparams_;
        DatasetConfig dataset_config_;

        std::string generate_imports() const;
        std::string generate_hyperparams() const;
        std::string generate_data_loaders() const;
        std::string generate_model_instantiation() const;
        std::string generate_loss_optimizer_scheduler() const;
        std::string generate_train_validate_funcs() const;
        std::string generate_train_model_func() const;
        std::string generate_main_block() const;
    };

    // 便捷函数：生成训练脚本（对应 Python 版 generate_training_script）
    std::string generate_training_script(
        const std::string& model_class_name,
        const Hyperparameters& hyperparameters,
        const std::string& data_root,
        int num_classes
    );
}