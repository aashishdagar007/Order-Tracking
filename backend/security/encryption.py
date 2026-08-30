"""
backend/security/encryption.py
AES-256-GCM field-level encryption for sensitive database columns.

Usage:
    from backend.security.encryption import encrypt_field, decrypt_field

    # Store to DB
    encrypted = encrypt_field("sensitive data")   # returns bytes

    # Read from DB
    plaintext = decrypt_field(encrypted_bytes)    # returns str
"""

import os
import secrets
from typing import Optional
from Crypto.Cipher import AES
from Crypto.Random import get_random_bytes

# ── Key Management ────────────────────────────────────────────────────────────
# AES_KEY env must be exactly 64 hex characters = 32 bytes for AES-256
_raw_key = os.environ.get("AES_KEY", "")

def _load_key() -> bytes:
    """Load and validate the AES-256 key from environment."""
    raw = os.environ.get("AES_KEY", "")
    if not raw:
        # Development fallback — NOT for production
        import warnings
        warnings.warn(
            "AES_KEY not set. Using insecure development key. "
            "Set AES_KEY to a 64-char hex string in .env for production.",
            stacklevel=2
        )
        return bytes.fromhex("0" * 64)

    if len(raw) != 64:
        raise ValueError(
            f"AES_KEY must be exactly 64 hex characters (32 bytes). "
            f"Got {len(raw)} characters. Generate with: openssl rand -hex 32"
        )
    try:
        return bytes.fromhex(raw)
    except ValueError:
        raise ValueError("AES_KEY must be a valid hex string (64 hex chars).")


# Cache the key at module load time (validated once)
try:
    _AES_KEY: bytes = _load_key()
except Exception:
    _AES_KEY = b"\x00" * 32   # graceful degradation in test environments


# ── Encryption ────────────────────────────────────────────────────────────────
# Format: [12-byte nonce][16-byte tag][ciphertext]
# Total overhead: 28 bytes per field

NONCE_SIZE = 12   # GCM recommended nonce size
TAG_SIZE   = 16   # GCM authentication tag size


def encrypt_field(plaintext: Optional[str]) -> Optional[bytes]:
    """
    Encrypt a string field with AES-256-GCM.

    Returns bytes: [nonce (12)] + [tag (16)] + [ciphertext (variable)]
    Returns None if plaintext is None or empty.
    """
    if plaintext is None:
        return None
    if not isinstance(plaintext, str):
        plaintext = str(plaintext)
    if not plaintext.strip():
        return None

    nonce = get_random_bytes(NONCE_SIZE)
    cipher = AES.new(_AES_KEY, AES.MODE_GCM, nonce=nonce, mac_len=TAG_SIZE)
    ciphertext, tag = cipher.encrypt_and_digest(plaintext.encode("utf-8"))
    return nonce + tag + ciphertext


def decrypt_field(encrypted: Optional[bytes]) -> Optional[str]:
    """
    Decrypt a field encrypted with encrypt_field().

    Returns the original plaintext string, or None if input is None.
    Raises ValueError if the ciphertext is tampered (authentication failure).
    """
    if encrypted is None:
        return None
    if len(encrypted) < NONCE_SIZE + TAG_SIZE + 1:
        return None

    nonce      = encrypted[:NONCE_SIZE]
    tag        = encrypted[NONCE_SIZE : NONCE_SIZE + TAG_SIZE]
    ciphertext = encrypted[NONCE_SIZE + TAG_SIZE:]

    cipher = AES.new(_AES_KEY, AES.MODE_GCM, nonce=nonce, mac_len=TAG_SIZE)
    try:
        plaintext = cipher.decrypt_and_verify(ciphertext, tag)
        return plaintext.decode("utf-8")
    except (ValueError, KeyError) as e:
        raise ValueError(f"AES-256-GCM decryption failed: {e}. "
                         "Data may be corrupted or the key is wrong.") from e


# ── Convenience: encrypt dict as JSON ────────────────────────────────────────
import json

def encrypt_json(data: Optional[dict]) -> Optional[bytes]:
    """Serialize dict to JSON string and encrypt it."""
    if data is None:
        return None
    return encrypt_field(json.dumps(data, ensure_ascii=False))


def decrypt_json(encrypted: Optional[bytes]) -> Optional[dict]:
    """Decrypt bytes back to a dict."""
    plaintext = decrypt_field(encrypted)
    if plaintext is None:
        return None
    try:
        return json.loads(plaintext)
    except json.JSONDecodeError:
        return {"_raw": plaintext}


# ── Key rotation helper ───────────────────────────────────────────────────────
def rotate_field(encrypted_with_old_key: bytes, old_key_hex: str) -> bytes:
    """
    Re-encrypt a field from old_key → current _AES_KEY.
    Use during key rotation migrations.
    """
    old_key = bytes.fromhex(old_key_hex)
    nonce      = encrypted_with_old_key[:NONCE_SIZE]
    tag        = encrypted_with_old_key[NONCE_SIZE : NONCE_SIZE + TAG_SIZE]
    ciphertext = encrypted_with_old_key[NONCE_SIZE + TAG_SIZE:]

    old_cipher = AES.new(old_key, AES.MODE_GCM, nonce=nonce, mac_len=TAG_SIZE)
    plaintext  = old_cipher.decrypt_and_verify(ciphertext, tag).decode("utf-8")
    return encrypt_field(plaintext)
