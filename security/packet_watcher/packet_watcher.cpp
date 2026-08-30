/**
 * security/packet_watcher/packet_watcher.cpp
 * Lightweight C++ Host Firewall / Packet Inspector Module.
 *
 * Monitors local inbound traffic on active server ports (default port 80 / 443).
 * Sniffs raw TCP packets, inspects SYN flags, and detects anomalous SYN-flood
 * or high-velocity packet spikes per source IP.
 *
 * Suspicious IPs are written to a shared watchfile for immediate action
 * by the Python threat detector and host firewall.
 */

#include <iostream>
#include <fstream>
#include <string>
#include <vector>
#include <unordered_map>
#include <chrono>
#include <thread>
#include <mutex>
#include <cstring>
#include <cstdlib>

#ifdef _WIN32
  #define WIN32_LEAN_AND_MEAN
  #include <winsock2.h>
  #include <ws2tcpip.h>
  #include <mstcpip.h>
  #pragma comment(lib, "ws2_32.lib")
#else
  #include <sys/socket.h>
  #include <netinet/in.h>
  #include <netinet/ip.h>
  #include <netinet/tcp.h>
  #include <arpa/inet.h>
  #include <unistd.h>
#endif

// ── IP & TCP Header Structs for Cross-Platform Parsing ────────────────────────
#pragma pack(push, 1)
struct IPv4Header {
    unsigned char  ihl : 4;
    unsigned char  version : 4;
    unsigned char  tos;
    unsigned short total_length;
    unsigned short id;
    unsigned short frag_offset;
    unsigned char  ttl;
    unsigned char  protocol;
    unsigned short checksum;
    unsigned int   src_ip;
    unsigned int   dst_ip;
};

struct TCPHeader {
    unsigned short src_port;
    unsigned short dst_port;
    unsigned int   seq_num;
    unsigned int   ack_num;
    unsigned char  reserved : 4;
    unsigned char  data_offset : 4;
    unsigned char  flags;
    unsigned short window;
    unsigned short checksum;
    unsigned short urgent_ptr;
};
#pragma pack(pop)

// TCP Flags Masks
#define TCP_FLAG_FIN 0x01
#define TCP_FLAG_SYN 0x02
#define TCP_FLAG_RST 0x04
#define TCP_FLAG_PSH 0x08
#define TCP_FLAG_ACK 0x10
#define TCP_FLAG_URG 0x20

// ── Global Configuration ──────────────────────────────────────────────────────
static int g_target_port = 80;
static int g_syn_threshold = 150; // Max SYN packets per second per IP
static std::string g_watchfile = "/tmp/suspicious_ips.txt";
static std::mutex g_map_lock;

struct IPSynTracker {
    int syn_count = 0;
    std::chrono::steady_clock::time_point window_start;
    bool flagged = false;
};

static std::unordered_map<std::string, IPSynTracker> g_ip_trackers;

void report_suspicious_ip(const std::string& ip) {
    std::cout << "[!] PACKET INSPECTOR ALERT: SYN Flood / Spike from IP: " << ip << std::endl;
    std::ofstream out(g_watchfile, std::ios::app);
    if (out.is_open()) {
        out << ip << "\n";
        out.close();
    }
}

void process_packet(const char* buffer, int size) {
    if (size < (int)(sizeof(IPv4Header) + sizeof(TCPHeader))) {
        return;
    }

    const IPv4Header* ip_hdr = reinterpret_cast<const IPv4Header*>(buffer);
    if (ip_hdr->version != 4 || ip_hdr->protocol != 6) { // 6 = TCP
        return;
    }

    int ip_hdr_len = ip_hdr->ihl * 4;
    if (size < ip_hdr_len + (int)sizeof(TCPHeader)) {
        return;
    }

    const TCPHeader* tcp_hdr = reinterpret_cast<const TCPHeader*>(buffer + ip_hdr_len);
    unsigned short dst_port = ntohs(tcp_hdr->dst_port);

    // Only monitor target web ports (e.g. 80, 443, 8000)
    if (dst_port != g_target_port && dst_port != 443 && dst_port != 8000) {
        return;
    }

    // Inspect if SYN flag is set and ACK is NOT set (pure connection initiate)
    bool is_pure_syn = ((tcp_hdr->flags & TCP_FLAG_SYN) && !(tcp_hdr->flags & TCP_FLAG_ACK));
    if (!is_pure_syn) {
        return;
    }

    struct in_addr src_addr;
    src_addr.s_addr = ip_hdr->src_ip;
    char src_ip_str[INET_ADDRSTRLEN];
    inet_ntop(AF_INET, &src_addr, src_ip_str, INET_ADDRSTRLEN);
    std::string ip(src_ip_str);

    // Ignore localhost
    if (ip == "127.0.0.1" || ip == "0.0.0.0") {
        return;
    }

    auto now = std::chrono::steady_clock::now();
    std::lock_guard<std::mutex> guard(g_map_lock);
    auto& tracker = g_ip_trackers[ip];

    if (tracker.window_start.time_since_epoch().count() == 0) {
        tracker.window_start = now;
        tracker.syn_count = 1;
    } else {
        auto elapsed = std::chrono::duration_cast<std::chrono::seconds>(now - tracker.window_start).count();
        if (elapsed >= 1) {
            // New 1-second window
            tracker.window_start = now;
            tracker.syn_count = 1;
            tracker.flagged = false;
        } else {
            tracker.syn_count++;
            if (tracker.syn_count > g_syn_threshold && !tracker.flagged) {
                tracker.flagged = true;
                report_suspicious_ip(ip);
            }
        }
    }
}

int main(int argc, char* argv[]) {
    std::cout << "=======================================================" << std::endl;
    std::cout << "  Warehouse WMS — C++ Host Packet Watcher & Firewall  " << std::endl;
    std::cout << "=======================================================" << std::endl;

    if (const char* env_watch = std::getenv("PACKET_WATCHER_WATCHFILE")) {
        g_watchfile = env_watch;
    }
#ifdef _WIN32
    if (g_watchfile == "/tmp/suspicious_ips.txt") {
        g_watchfile = "C:\\Windows\\Temp\\suspicious_ips.txt";
    }
#endif

    std::cout << "[*] Monitoring incoming TCP SYN packets on target ports..." << std::endl;
    std::cout << "[*] SYN Flood Threshold: " << g_syn_threshold << " packets/sec per IP" << std::endl;
    std::cout << "[*] Output Watchfile: " << g_watchfile << std::endl;

#ifdef _WIN32
    WSADATA wsaData;
    if (WSAStartup(MAKEWORD(2, 2), &wsaData) != 0) {
        std::cerr << "[-] WSAStartup failed" << std::endl;
        return 1;
    }

    SOCKET sock = socket(AF_INET, SOCK_RAW, IPPROTO_IP);
    if (sock == INVALID_SOCKET) {
        std::cerr << "[-] Failed to create raw socket on Windows (Admin privileges required): "
                  << WSAGetLastError() << std::endl;
        std::cout << "[i] Note: Windows requires running as Administrator for raw packet inspection." << std::endl;
        WSACleanup();
        return 1;
    }

    char host_name[256];
    gethostname(host_name, sizeof(host_name));
    struct hostent* host = gethostbyname(host_name);
    struct sockaddr_in dest;
    std::memset(&dest, 0, sizeof(dest));
    dest.sin_family = AF_INET;
    dest.sin_port = 0;
    if (host && host->h_addr_list[0]) {
        std::memcpy(&dest.sin_addr.s_addr, host->h_addr_list[0], sizeof(dest.sin_addr.s_addr));
    } else {
        dest.sin_addr.s_addr = htonl(INADDR_ANY);
    }

    if (bind(sock, (struct sockaddr*)&dest, sizeof(dest)) == SOCKET_ERROR) {
        std::cerr << "[-] Bind failed on Windows socket: " << WSAGetLastError() << std::endl;
        closesocket(sock);
        WSACleanup();
        return 1;
    }

    // Enable promiscuous mode via SIO_RCVALL
    DWORD flag = RCVALL_ON;
    DWORD bytes_ret = 0;
    if (WSAIoctl(sock, SIO_RCVALL, &flag, sizeof(flag), NULL, 0, &bytes_ret, NULL, NULL) == SOCKET_ERROR) {
        std::cerr << "[-] SIO_RCVALL failed: " << WSAGetLastError() << std::endl;
    }
#else
    int sock = socket(AF_INET, SOCK_RAW, IPPROTO_TCP);
    if (sock < 0) {
        std::cerr << "[-] Failed to open raw TCP socket (root / CAP_NET_RAW required): "
                  << std::strerror(errno) << std::endl;
        return 1;
    }
#endif

    std::cout << "[+] Packet sniffer successfully attached and active." << std::endl;
    std::vector<char> buffer(65536);

    while (true) {
#ifdef _WIN32
        int bytes = recv(sock, buffer.data(), (int)buffer.size(), 0);
        if (bytes > 0) {
            process_packet(buffer.data(), bytes);
        }
#else
        ssize_t bytes = recv(sock, buffer.data(), buffer.size(), 0);
        if (bytes > 0) {
            process_packet(buffer.data(), (int)bytes);
        }
#endif
    }

#ifdef _WIN32
    closesocket(sock);
    WSACleanup();
#else
    close(sock);
#endif
    return 0;
}
