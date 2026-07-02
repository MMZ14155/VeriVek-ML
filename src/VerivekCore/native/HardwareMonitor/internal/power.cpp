#include "power.h"

#ifdef _WIN32
#include <windows.h>
#endif

namespace hardware_monitor {
    std::optional<bool> get_ac_status() {
    #ifdef _WIN32
        SYSTEM_POWER_STATUS status{};
        if (GetSystemPowerStatus(&status)) {
            return status.ACLineStatus == 1;
        }
    #endif
        return std::nullopt;
    }
}