cmake_minimum_required(VERSION 3.20)
project(VekCompiler CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

set(CMAKE_C_COMPILER gcc)
set(CMAKE_CXX_COMPILER g++)

set(VEK_SOURCES
    frontend/json_to_fgraph.cpp
    frontend/fgraph_to_vek.cpp
    frontend/vek_to_fgraph.cpp

    middle/ir.cpp
    middle/lexer.cpp
    middle/parser.cpp
    middle/ir_builder.cpp
    middle/shape.cpp
    backend/codegen/pytorch.cpp
    backend/codegen/tensorflow.cpp
    api/compiler_api.cpp
)

set(VEK_HEADERS
    frontend/json_to_fgraph.h
    frontend/fgraph_input.h
    frontend/fgraph_to_vek.h
    frontend/vek_to_fgraph.h
    middle/ir.h
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