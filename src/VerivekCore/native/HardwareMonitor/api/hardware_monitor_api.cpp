#include "hardware_monitor_api.h"
#include "gpu.h"
#include "power.h"

#include <cstdio>
#include <cstring>
#include <sstream>
#include <string>

extern "C" {
    int hm_get_cuda_version(char* buffer, int buffer_size) {
        auto version_opt = hardware_monitor::get_cuda_version();
        if (!version_opt.has_value()) {
            return -1;
        }
        const std::string& version = version_opt.value();
        int required = static_cast<int>(version.size());
        if (buffer == nullptr || buffer_size <= 0) {
            return required + 1;
        }
        if (buffer_size < required + 1) {
            return required + 1;
        }
        std::memcpy(buffer, version.c_str(), required + 1);
        return required;
    }

    int hm_get_driver_version(char* buffer, int buffer_size) {
        auto version_opt = hardware_monitor::get_driver_version();
        if (!version_opt.has_value()) {
            return -1;
        }
        const std::string& version = version_opt.value();
        int required = static_cast<int>(version.size());
        if (buffer == nullptr || buffer_size <= 0) {
            return required + 1;
        }
        if (buffer_size < required + 1) {
            return required + 1;
        }
        std::memcpy(buffer, version.c_str(), required + 1);
        return required;
    }

    int hm_get_gpu_info(char* buffer, int buffer_size) {
        auto gpus = hardware_monitor::get_gpu_info();
        std::ostringstream oss;
        oss << "[";
        for (size_t i = 0; i < gpus.size(); ++i) {
            const auto& gpu = gpus[i];
            oss << "{";
            oss << "\"index\":" << gpu.index << ",";
            oss << "\"name\":\"" << gpu.name << "\",";
            oss << "\"memory_total\":\"" << gpu.memory_total << "\",";
            oss << "\"memory_used\":\"" << gpu.memory_used << "\",";
            oss << "\"memory_free\":\"" << gpu.memory_free << "\",";
            oss << "\"utilization\":\"" << gpu.utilization << "\",";
            oss << "\"temperature\":\"" << gpu.temperature << "\"";
            oss << "}";
            if (i + 1 < gpus.size()) {
                oss << ",";
            }
        }
        oss << "]";

        std::string result = oss.str();
        int required = static_cast<int>(result.size());
        if (buffer == nullptr || buffer_size <= 0) {
            return required + 1;
        }
        if (buffer_size < required + 1) {
            return required + 1;
        }
        std::memcpy(buffer, result.c_str(), required + 1);
        return 0;
    }

    void hm_get_total_usage(int* used_mem, int* total_mem) {
        int used = 0;
        int total = 0;
        if (used_mem != nullptr && total_mem != nullptr) {
            auto result = hardware_monitor::get_total_usage();
            used = result.first;
            total = result.second;
        }
        if (used_mem != nullptr) {
            *used_mem = used;
        }
        if (total_mem != nullptr) {
            *total_mem = total;
        }
    }

    int hm_get_gpu_utilization(double* out_utilization) {
        if (out_utilization == nullptr) {
            return -1;
        }
        auto result = hardware_monitor::get_gpu_utilization();
        if (!result.has_value()) {
            return -1;
        }
        *out_utilization = result.value();
        return 0;
    }

    int hm_get_ac_status() {
        auto status = hardware_monitor::get_ac_status();
        if (!status.has_value()) {
            return -1;
        }
        return status.value() ? 1 : 0;
    }
}