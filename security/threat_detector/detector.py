"""
security/threat_detector/detector.py
Embedded Python Threat Detector using XGBoost.
Tails Nginx logs and monitors network traffic windows to detect
DDoS spikes, scans, and malicious anomalies, automatically blocking IPs locally.
"""

import os
import re
import sys
import time
import json
import logging
import ipaddress
import subprocess
from datetime import datetime, timezone
from collections import defaultdict, deque
import joblib
import numpy as np
import pandas as pd

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [ThreatDetector] %(message)s"
)
logger = logging.getLogger("wms.threat_detector")

# ── Environment & Config ───────────────────────────────────────────────────────
NGINX_LOG_PATH = os.environ.get("NGINX_LOG_PATH", "/var/log/nginx/access.log")
WATCHFILE_PATH = os.environ.get("PACKET_WATCHER_WATCHFILE", "/tmp/suspicious_ips.txt")
THRESHOLD = float(os.environ.get("THREAT_SCORE_THRESHOLD", "0.85"))
BLOCK_DURATION = int(os.environ.get("THREAT_BLOCK_DURATION_SECONDS", "3600"))
WHITELIST_RAW = os.environ.get(
    "THREAT_WHITELIST_CIDRS",
    "127.0.0.1/8,192.168.0.0/16,10.0.0.0/8,172.16.0.0/12"
)

WHITELIST_NETWORKS = []
for cidr in WHITELIST_RAW.split(","):
    cidr = cidr.strip()
    if cidr:
        try:
            WHITELIST_NETWORKS.append(ipaddress.ip_network(cidr, strict=False))
        except ValueError:
            pass

BOT_PATTERNS = re.compile(
    r"(sqlmap|nikto|nmap|masscan|zgrab|curl|python-requests|wget|gobuster|dirbuster)",
    re.IGNORECASE
)

# Nginx Combined Log Regex:
# $remote_addr - $remote_user [$time_local] "$request" $status $body_bytes_sent "$http_referer" "$http_user_agent"
LOG_PATTERN = re.compile(
    r'^(?P<ip>\S+)\s+\S+\s+\S+\s+\[(?P<time>[^\]]+)\]\s+"(?P<method>\S+)\s+(?P<path>\S+)[^"]*"\s+(?P<status>\d+)\s+(?P<bytes>\d+)\s+"[^"]*"\s+"(?P<ua>[^"]*)"'
)


def is_ip_whitelisted(ip_str: str) -> bool:
    try:
        ip = ipaddress.ip_address(ip_str)
        for net in WHITELIST_NETWORKS:
            if ip in net:
                return True
    except ValueError:
        return True  # invalid ip format or host string, avoid accidental block
    return False


class LocalFirewall:
    def __init__(self):
        self.blocked_ips = {}  # ip -> unblock_timestamp

    def block_ip(self, ip: str, reason: str, score: float):
        if is_ip_whitelisted(ip):
            logger.info(f"Skipping block for whitelisted IP: {ip}")
            return

        now = time.time()
        if ip in self.blocked_ips and self.blocked_ips[ip] > now:
            return  # Already blocked

        unblock_time = now + BLOCK_DURATION
        self.blocked_ips[ip] = unblock_time
        logger.warning(f"🚨 BLOCKING MALICIOUS IP: {ip} | Reason: {reason} | Score: {score:.3f}")

        # Execute host firewall rule
        if sys.platform.startswith("linux"):
            try:
                subprocess.run(["iptables", "-A", "INPUT", "-s", ip, "-j", "DROP"], check=True)
            except Exception as e:
                logger.error(f"Failed to execute iptables block for {ip}: {e}")
        elif sys.platform.startswith("win"):
            try:
                rule_name = f"WMS_Block_{ip.replace('.', '_')}"
                cmd = [
                    "netsh", "advfirewall", "firewall", "add", "rule",
                    f"name={rule_name}", "dir=in", "action=block", f"remoteip={ip}"
                ]
                subprocess.run(cmd, check=True)
            except Exception as e:
                logger.error(f"Failed to execute Windows Firewall block for {ip}: {e}")

        # Write alert log
        alert_record = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "ip": ip,
            "reason": reason,
            "threat_score": score,
            "blocked_until": datetime.fromtimestamp(unblock_time, timezone.utc).isoformat()
        }
        alerts_file = os.path.join(os.path.dirname(__file__), "alerts.jsonl")
        try:
            with open(alerts_file, "a", encoding="utf-8") as f:
                f.write(json.dumps(alert_record) + "\n")
        except Exception:
            pass

    def cleanup_expired(self):
        now = time.time()
        expired = [ip for ip, exp in self.blocked_ips.items() if exp <= now]
        for ip in expired:
            del self.blocked_ips[ip]
            logger.info(f"Unblocking expired IP: {ip}")
            if sys.platform.startswith("linux"):
                try:
                    subprocess.run(["iptables", "-D", "INPUT", "-s", ip, "-j", "DROP"], check=False)
                except Exception:
                    pass
            elif sys.platform.startswith("win"):
                try:
                    rule_name = f"WMS_Block_{ip.replace('.', '_')}"
                    subprocess.run(["netsh", "advfirewall", "firewall", "delete", "rule", f"name={rule_name}"], check=False)
                except Exception:
                    pass


class ThreatDetector:
    def __init__(self):
        self.firewall = LocalFirewall()
        self.model = None
        self.features = []
        self.ip_windows = defaultdict(lambda: deque())
        self.load_or_train_model()

    def load_or_train_model(self):
        model_path = os.path.join(os.path.dirname(__file__), "model.pkl")
        if not os.path.exists(model_path):
            logger.info("model.pkl not found. Training model now...")
            from security.threat_detector.train_model import train
            train()

        try:
            data = joblib.load(model_path)
            self.model = data["model"]
            self.features = data["features"]
            logger.info(f"Loaded XGBoost model with features: {self.features}")
        except Exception as e:
            logger.error(f"Failed to load XGBoost model: {e}")

    def record_request(self, ip: str, status_code: int, byte_count: int, path: str, ua: str):
        now = time.time()
        self.ip_windows[ip].append({
            "ts": now,
            "status": status_code,
            "bytes": byte_count,
            "path": path,
            "is_bot": 1 if BOT_PATTERNS.search(ua) else 0
        })

    def evaluate_windows(self):
        now = time.time()
        window_duration = 60.0  # 60s window
        current_hour = datetime.now().hour

        for ip in list(self.ip_windows.keys()):
            reqs = self.ip_windows[ip]
            # Prune older than 60s
            while reqs and reqs[0]["ts"] < (now - window_duration):
                reqs.popleft()

            if not reqs:
                del self.ip_windows[ip]
                continue

            rpm = len(reqs)
            if rpm < 5:
                continue  # not enough data to consider threat

            error_count = sum(1 for r in reqs if r["status"] >= 400)
            error_ratio = error_count / rpm
            bytes_list = [r["bytes"] for r in reqs]
            payload_mean = float(np.mean(bytes_list))
            payload_std = float(np.std(bytes_list))
            unique_eps = len(set(r["path"] for r in reqs))
            bot_ua_flag = 1 if any(r["is_bot"] == 1 for r in reqs) else 0

            # Feature vector: [rpm, error_ratio, payload_mean, payload_std, unique_endpoints, is_known_bot_ua, hour_of_day]
            row_dict = {
                "rpm": rpm,
                "error_ratio": error_ratio,
                "payload_mean": payload_mean,
                "payload_std": payload_std,
                "unique_endpoints": unique_eps,
                "is_known_bot_ua": bot_ua_flag,
                "hour_of_day": current_hour
            }

            if self.model:
                try:
                    features_df = pd.DataFrame([row_dict])[self.features]
                    # Score probability of class 1 (threat)
                    prob = float(self.model.predict_proba(features_df)[0][1])
                    if prob >= THRESHOLD:
                        self.firewall.block_ip(
                            ip,
                            reason=f"Anomalous Traffic (RPM={rpm}, ErrRate={error_ratio:.2f}, Endpoints={unique_eps})",
                            score=prob
                        )
                except Exception as e:
                    logger.error(f"Inference error for {ip}: {e}")

    def check_packet_watcher_watchfile(self):
        """Reads suspicious IPs reported by C++ raw socket packet watcher."""
        if not os.path.exists(WATCHFILE_PATH):
            return

        try:
            with open(WATCHFILE_PATH, "r", encoding="utf-8") as f:
                lines = f.readlines()
            if lines:
                # Truncate file so we don't re-process
                open(WATCHFILE_PATH, "w").close()
                for line in lines:
                    ip = line.strip()
                    if ip:
                        self.firewall.block_ip(ip, reason="SYN Flood detected by C++ Inspector", score=0.99)
        except Exception as e:
            logger.error(f"Error checking packet watcher file: {e}")

    def run(self):
        logger.info(f"Threat Detector running. Monitoring log: {NGINX_LOG_PATH}")
        last_eval = time.time()

        # Seek to end of log initially
        log_pos = 0
        if os.path.exists(NGINX_LOG_PATH):
            log_pos = os.path.getsize(NGINX_LOG_PATH)

        while True:
            try:
                time.sleep(1)
                # 1. Read new log lines
                if os.path.exists(NGINX_LOG_PATH):
                    cur_size = os.path.getsize(NGINX_LOG_PATH)
                    if cur_size < log_pos:
                        log_pos = 0  # log rotated
                    if cur_size > log_pos:
                        with open(NGINX_LOG_PATH, "r", encoding="utf-8", errors="ignore") as f:
                            f.seek(log_pos)
                            lines = f.readlines()
                            log_pos = f.tell()

                        for line in lines:
                            m = LOG_PATTERN.search(line)
                            if m:
                                ip = m.group("ip")
                                status_c = int(m.group("status"))
                                byte_c = int(m.group("bytes"))
                                path = m.group("path")
                                ua = m.group("ua")
                                self.record_request(ip, status_c, byte_c, path, ua)

                # 2. Check C++ packet watcher
                self.check_packet_watcher_watchfile()

                # 3. Evaluate windows every 5s
                if time.time() - last_eval >= 5.0:
                    self.evaluate_windows()
                    self.firewall.cleanup_expired()
                    last_eval = time.time()

            except KeyboardInterrupt:
                logger.info("Threat detector stopping.")
                break
            except Exception as e:
                logger.error(f"Detector loop error: {e}")
                time.sleep(2)


if __name__ == "__main__":
    detector = ThreatDetector()
    detector.run()
