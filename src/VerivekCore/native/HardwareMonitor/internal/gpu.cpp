#include "gpu.h"

#include <array>
#include <cctype>
#include <cstdio>
#include <memory>
#include <sstream>
#include <cstring>

namespace hardware_monitor {
    namespace {
        std::string exec(const char* cmd) {
            std::array<char, 128> buffer{};
            std::string result;
            std::unique_ptr<FILE, decltype(&_pclose)> pipe(_popen(cmd, "r"), _pclose);
            if (!pipe) {
                return result;
            }
            while (fgets(buffer.data(), static_cast<int>(buffer.size()), pipe.get()) != nullptr) {
                result += buffer.data();
            }
            return result;
        }

        std::vector<std::string> split(const std::string& s, char delimiter) {
            std::vector<std::string> tokens;
            std::string token;
            std::istringstream tokenStream(s);
            while (std::getline(tokenStream, token, delimiter)) {
                tokens.push_back(token);
            }
            return tokens;
        }

        std::string trim(std::string s) {
            auto start = s.begin();
            while (start != s.end() && std::isspace(static_cast<unsigned char>(*start))) {
                ++start;
            }
            auto end = s.end();
            while (end != start && std::isspace(static_cast<unsigned char>(*(end - 1)))) {
                --end;
            }
            return std::string(start, end);
        }
    }

    std::optional<std::string> get_cuda_version() {
        try {
            std::string output = exec("nvidia-smi");
            std::istringstream stream(output);
            std::string line;
            while (std::getline(stream, line)) {
                auto pos = line.find("CUDA Version:");
                if (pos != std::string::npos) {
                    std::string rest = line.substr(pos + 13);
                    std::string trimmed = trim(rest);
                    auto end = trimmed.find_first_not_of("0123456789.");
                    if (end == std::string::npos) {
                        return trimmed;
                    }
                    return trimmed.substr(0, end);
                }
            }
            return std::nullopt;
        } catch (...) {
            return std::nullopt;
        }
    }

    std::optional<std::string> get_driver_version() {
        try {
            const char* cmd =
                "nvidia-smi --query-gpu=driver_version "
                "--format=csv,noheader,nounits";
            std::string output = exec(cmd);
            std::istringstream stream(output);
            std::string line;
            std::optional<std::string> min_version;
            while (std::getline(stream, line)) {
                if (line.empty()) {
                    continue;
                }
                std::string version = trim(line);
                if (version.empty()) {
                    continue;
                }
                if (!min_version.has_value() || version < min_version.value()) {
                    min_version = version;
                }
            }
            return min_version;
        } catch (...) {
            return std::nullopt;
        }
    }

    std::vector<GpuInfo> get_gpu_info() {
        std::vector<GpuInfo> gpus;
        try {
            const char* cmd =
                "nvidia-smi --query-gpu=index,name,memory.total,memory.used,memory.free,utilization.gpu,temperature.gpu "
                "--format=csv,noheader,nounits";
            std::string output = exec(cmd);
            std::istringstream stream(output);
            std::string line;
            while (std::getline(stream, line)) {
                if (line.empty()) {
                    continue;
                }
                auto parts = split(line, ',');
                if (parts.size() != 7) {
                    continue;
                }
                GpuInfo gpu{};
                gpu.index = std::stoi(trim(parts[0]));
                gpu.name = trim(parts[1]);
                gpu.memory_total = trim(parts[2]);
                gpu.memory_used = trim(parts[3]);
                gpu.memory_free = trim(parts[4]);
                gpu.utilization = trim(parts[5]);
                gpu.temperature = trim(parts[6]);
                gpus.push_back(gpu);
            }
        } catch (...) {
            return {};
        }
        return gpus;
    }

    std::pair<int, int> get_total_usage() {
        auto gpus = get_gpu_info();
        if (gpus.empty()) {
            return {0, 0};
        }
        int total_mem = 0;
        int used_mem = 0;
        for (const auto& gpu : gpus) {
            total_mem += std::stoi(gpu.memory_total);
            used_mem += std::stoi(gpu.memory_used);
        }
        return {used_mem, total_mem};
    }

    std::optional<double> get_gpu_utilization() {
        auto gpus = get_gpu_info();
        if (gpus.empty()) {
            return std::nullopt;
        }
        double weighted_sum = 0.0;
        double total_weight = 0.0;
        for (const auto& gpu : gpus) {
            int mem = std::stoi(gpu.memory_total);
            int util = std::stoi(gpu.utilization);
            weighted_sum += util * mem;
            total_weight += mem;
        }
        if (total_weight == 0.0) {
            return std::nullopt;
        }
        return weighted_sum / total_weight;
    }
}