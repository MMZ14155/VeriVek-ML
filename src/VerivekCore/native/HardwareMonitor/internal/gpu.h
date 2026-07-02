#pragma once

#include <optional>
#include <string>
#include <utility>
#include <vector>

namespace hardware_monitor {
    struct GpuInfo {
        int index;
        std::string name;
        std::string memory_total;
        std::string memory_used;
        std::string memory_free;
        std::string utilization;
        std::string temperature;
    };

    std::optional<std::string> get_cuda_version();
    std::optional<std::string> get_driver_version();

    std::vector<GpuInfo> get_gpu_info();
    std::pair<int, int> get_total_usage();
    std::optional<double> get_gpu_utilization();
}