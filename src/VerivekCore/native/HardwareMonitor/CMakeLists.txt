cmake_minimum_required(VERSION 3.20)
project(HardwareMonitor CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

set(CMAKE_C_COMPILER gcc)
set(CMAKE_CXX_COMPILER g++)

set(HM_SOURCES
    internal/gpu.cpp
    internal/power.cpp
    api/hardware_monitor_api.cpp
)

set(HM_HEADERS
    internal/gpu.h
    internal/power.h
    api/hardware_monitor_api.h
)

add_library(hardware_monitor SHARED ${HM_SOURCES} ${HM_HEADERS})

set_target_properties(hardware_monitor PROPERTIES
    WINDOWS_EXPORT_ALL_SYMBOLS OFF
    PREFIX ""
)

add_custom_command(TARGET hardware_monitor POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E rm -f "$<TARGET_FILE_DIR:hardware_monitor>/lib$<TARGET_FILE_BASE_NAME:hardware_monitor>.dll.a"
)

target_include_directories(hardware_monitor PUBLIC
    ${CMAKE_CURRENT_SOURCE_DIR}/internal
    ${CMAKE_CURRENT_SOURCE_DIR}/api
)