cmake_minimum_required(VERSION 3.20)
project(VekCompiler CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

set(CMAKE_C_COMPILER gcc)
set(CMAKE_CXX_COMPILER g++)

set(VEK_SOURCES
    frontend/json_to_mdlspec.cpp
    frontend/mdlspec_to_ir.cpp
    frontend/vek_to_mdlspec.cpp

    middle/ir.cpp
    middle/ir_var_alloc.cpp
    middle/ir_analysis.cpp
    middle/lexer.cpp
    middle/parser.cpp
    middle/ir_builder.cpp
    middle/shape.cpp
    backend/codegen/pytorch.cpp
    backend/codegen/tensorflow.cpp
    api/compiler_api.cpp
)

set(VEK_HEADERS
    frontend/json_to_mdlspec.h
    frontend/mdlspec.h
    frontend/mdlspec_to_ir.h
    frontend/vek_to_mdlspec.h
    middle/ir.h
    middle/ir_var_alloc.h
    middle/ir_analysis.h
    middle/lexer.h
    middle/parser.h
    middle/ir_builder.h
    middle/shape.h
    backend/codegen/pytorch.h
    backend/codegen/tensorflow.h
    api/compiler_api.h
)

add_library(vek_compiler SHARED ${VEK_SOURCES} ${VEK_HEADERS})

set_target_properties(vek_compiler PROPERTIES
    PREFIX ""
    CXX_VISIBILITY_PRESET hidden
)

add_custom_command(TARGET vek_compiler POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E rm -f "$<TARGET_FILE_DIR:vek_compiler>/lib$<TARGET_FILE_BASE_NAME:vek_compiler>.dll.a"
)

target_include_directories(vek_compiler PUBLIC
    ${CMAKE_CURRENT_SOURCE_DIR}/api
    ${CMAKE_CURRENT_SOURCE_DIR}/backend/codegen
    ${CMAKE_CURRENT_SOURCE_DIR}/middle
    ${CMAKE_CURRENT_SOURCE_DIR}/frontend
)