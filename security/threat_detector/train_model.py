"""
security/threat_detector/train_model.py
Generates synthetic traffic baseline datasets (normal vs DDoS / scan / brute-force),
trains an XGBoost anomaly detection classifier, and saves model.pkl.
"""

import os
import joblib
import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, accuracy_score
import xgboost as xgb

def generate_synthetic_dataset(n_samples: int = 10000):
    np.random.seed(42)
    n_normal = int(n_samples * 0.85)
    n_threat = n_samples - n_normal

    # Normal traffic:
    # - RPM typically 1 to 40
    # - Error ratio typically 0.0 to 0.05
    # - Payload size around 2000 bytes with small variance
    # - Unique endpoints count 1 to 10
    # - Low bot UA frequency
    normal_rpm = np.random.gamma(shape=2.0, scale=8.0, size=n_normal) + 1
    normal_error_ratio = np.random.beta(a=0.5, b=20.0, size=n_normal)
    normal_payload_mean = np.random.normal(loc=2500, scale=500, size=n_normal).clip(100, 50000)
    normal_payload_std = np.random.normal(loc=300, scale=80, size=n_normal).clip(10, 5000)
    normal_unique_eps = np.random.poisson(lam=4.0, size=n_normal).clip(1, 20)
    normal_bot_ua = np.random.binomial(n=1, p=0.01, size=n_normal)
    normal_hour = np.random.randint(8, 20, size=n_normal)  # mostly work hours
    normal_labels = np.zeros(n_normal, dtype=int)

    # Threat traffic (DDoS spikes, port/endpoint enumeration, credential stuffing):
    # - High RPM (100 to 1500+)
    # - Elevated error ratio (0.3 to 0.95)
    # - Wide or tiny payload variance
    # - High unique endpoints (crawling) or exactly 1 (flooding)
    # - High bot/scanner UA flag
    threat_rpm = np.random.exponential(scale=350, size=n_threat) + 90
    threat_error_ratio = np.random.uniform(0.25, 0.98, size=n_threat)
    threat_payload_mean = np.random.choice([200, 15000, 800], size=n_threat) + np.random.normal(0, 50, size=n_threat)
    threat_payload_std = np.random.exponential(scale=800, size=n_threat)
    threat_unique_eps = np.random.choice([1, 45, 80], size=n_threat)
    threat_bot_ua = np.random.binomial(n=1, p=0.75, size=n_threat)
    threat_hour = np.random.randint(0, 24, size=n_threat)
    threat_labels = np.ones(n_threat, dtype=int)

    X_normal = np.column_stack([
        normal_rpm, normal_error_ratio, normal_payload_mean,
        normal_payload_std, normal_unique_eps, normal_bot_ua, normal_hour
    ])
    X_threat = np.column_stack([
        threat_rpm, threat_error_ratio, threat_payload_mean,
        threat_payload_std, threat_unique_eps, threat_bot_ua, threat_hour
    ])

    X = np.vstack([X_normal, X_threat])
    y = np.concatenate([normal_labels, threat_labels])

    feature_names = [
        "rpm", "error_ratio", "payload_mean",
        "payload_std", "unique_endpoints", "is_known_bot_ua", "hour_of_day"
    ]
    df = pd.DataFrame(X, columns=feature_names)
    df["target"] = y
    return df, feature_names

def train():
    print("Generating synthetic network traffic dataset...")
    df, feature_names = generate_synthetic_dataset(15000)
    X = df[feature_names]
    y = df["target"]

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    print("Training XGBoost Classifier...")
    model = xgb.XGBClassifier(
        n_estimators=120,
        max_depth=5,
        learning_rate=0.08,
        subsample=0.85,
        colsample_bytree=0.85,
        scale_pos_weight=1.5,
        eval_metric="logloss",
        random_state=42
    )
    model.fit(X_train, y_train)

    preds = model.predict(X_test)
    acc = accuracy_score(y_test, preds)
    print(f"Model Training Accuracy: {acc * 100:.2f}%")
    print(classification_report(y_test, preds, target_names=["Normal", "Threat"]))

    out_dir = os.path.dirname(os.path.abspath(__file__))
    model_path = os.path.join(out_dir, "model.pkl")
    joblib.dump({"model": model, "features": feature_names}, model_path)
    print(f"Model successfully saved to: {model_path}")

if __name__ == "__main__":
    train()
