cmake_minimum_required(VERSION 3.15)
project(packet_watcher CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

add_executable(packet_watcher packet_watcher.cpp)

if(WIN32)
    target_link_libraries(packet_watcher PRIVATE ws2_32)
else()
    target_link_libraries(packet_watcher PRIVATE pthread)
endif()
