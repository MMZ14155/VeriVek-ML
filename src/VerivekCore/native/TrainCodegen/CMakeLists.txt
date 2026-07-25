cmake_minimum_required(VERSION 3.20)
project(TrainCodegen CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

set(CMAKE_C_COMPILER gcc)
set(CMAKE_CXX_COMPILER g++)

set(TC_SOURCES
    generator/training_code_generator.cpp
    api/codegen_api.cpp
)

set(TC_HEADERS
    generator/training_code_generator.h
    api/codegen_api.h
)

add_library(train_codegen SHARED ${TC_SOURCES} ${TC_HEADERS})

set_target_properties(train_codegen PROPERTIES
    PREFIX ""
    CXX_VISIBILITY_PRESET hidden
)

add_custom_command(TARGET train_codegen POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E rm -f "$<TARGET_FILE_DIR:train_codegen>/lib$<TARGET_FILE_BASE_NAME:train_codegen>.dll.a"
)

target_include_directories(train_codegen PUBLIC
    ${CMAKE_CURRENT_SOURCE_DIR}/api
    ${CMAKE_CURRENT_SOURCE_DIR}/generator
)