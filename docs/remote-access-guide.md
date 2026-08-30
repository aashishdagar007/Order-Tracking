# Zero-Cost Secure Remote Access Guide

This guide explains how remote clients (drivers, remote dispatchers, storefronts, and off-site admins) can securely connect to your **locally hosted Warehouse WMS server** with **zero cloud hosting fees, zero static public IP costs, and zero router port forwarding**.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│  Remote Client (Phone / Tablet / Laptop anywhere in world)  │
└──────────────────────────────┬──────────────────────────────┘
                               │ Encrypted TLS Tunnel
                               ▼
┌─────────────────────────────────────────────────────────────┐
│    Cloudflare Edge Network  OR  Tailscale WireGuard Mesh    │
└──────────────────────────────┬──────────────────────────────┘
                               │ Outbound-only connection
                               ▼
┌─────────────────────────────────────────────────────────────┐
│   Your Local Host Machine (Nginx -> Next.js / FastAPI)      │
└─────────────────────────────────────────────────────────────┘
```

---

## Option 1: Cloudflare Tunnel (Recommended for Public Client Access)

Cloudflare Tunnel creates an encrypted outbound-only connection from your local host machine to Cloudflare's global edge network. Remote users connect to a secure HTTPS URL (e.g. `https://wms.yourcompany.com` or a free `trycloudflare.com` domain).

### Prerequisites
- A free Cloudflare account at [cloudflare.com](https://cloudflare.com)
- Your own custom domain (or free subdomain) added to Cloudflare

### Step 1: Install `cloudflared` on the Host Machine

#### Windows:
Using winget:
```powershell
winget install --id Cloudflare.cloudflared
```
Or download the binary from [Cloudflare Releases](https://github.com/cloudflare/cloudflared/releases).

#### Linux (Debian / Ubuntu):
```bash
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
echo 'deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared bullseye main' | sudo tee /etc/apt/sources.list.d/cloudflared.list
sudo apt-get update && sudo apt-get install -y cloudflared
```

### Step 2: Authenticate and Create Your Tunnel

```bash
# 1. Login to your Cloudflare account
cloudflared tunnel login

# 2. Create the tunnel
cloudflared tunnel create warehouse-wms
```
This prints your **Tunnel ID** (e.g. `12345678-abcd-1234-abcd-1234567890ab`) and generates a credentials JSON file.

### Step 3: Configure Ingress Rules
Create a file at `~/.cloudflared/config.yml` (or `%USERPROFILE%\.cloudflared\config.yml` on Windows):

```yaml
tunnel: warehouse-wms
credentials-file: /path/to/your/credentials.json

ingress:
  # Route traffic directly to your local Nginx reverse proxy
  - hostname: wms.yourdomain.com
    service: http://127.0.0.1:80
    originRequest:
      noTLSVerify: true
  - service: http_status:404
```

### Step 4: Add DNS Record and Run
```bash
# Route your domain to the tunnel
cloudflared tunnel route dns warehouse-wms wms.yourdomain.com

# Run the tunnel (or configure as a service)
cloudflared tunnel run warehouse-wms
```

### Docker Integration (Automated via `docker-compose.yml`)
You can run the tunnel directly inside Docker without installing anything on the host!
Simply paste your tunnel token into `.env`:
```env
CLOUDFLARE_TUNNEL_TOKEN=your_token_here
```
And uncomment the `cloudflared` service in `docker-compose.yml`.

---

## Option 2: Tailscale (Recommended for Private Warehouse Fleets)

Tailscale creates a zero-config, encrypted WireGuard mesh network connecting your server and devices. No ports are open to the public internet.

### Best For:
- Warehouse barcode scanners, warehouse tablets, and driver devices
- Internal operators working from home or between multiple branches

### Step 1: Install Tailscale
1. Create a free account at [tailscale.com](https://tailscale.com) (free for up to 100 devices).
2. Download Tailscale on your host server machine:
   - **Windows:** Download the installer from tailscale.com/download/windows
   - **Linux:** `curl -fsSL https://tailscale.com/install.sh | sh`
   - **Android / iOS:** Install Tailscale from the app store on scanning devices.

### Step 2: Connect the Server Machine
```bash
tailscale up
```
Note the assigned 100.x.y.z IP address (e.g., `100.85.24.12`).

### Step 3: Connect Client Devices
1. Install Tailscale on the client tablet/phone/laptop.
2. Sign in with the same account.
3. Open the browser on the client device and navigate to:
   ```
   http://100.85.24.12
   ```
The client device can now access the full dashboard, camera barcode scanner, and live tracking tables securely!

---

## Security Best Practices for Local Hosting

1. **Local Threat Detection**: The embedded XGBoost threat detector automatically monitors `/var/log/nginx/access.log` and drops attacking IPs at the host firewall.
2. **Access Control**: Use the JWT role-based access control (Admin vs Operator vs Client) to ensure off-site users only see their relevant views.
3. **Daily Automated Backups**:
   ```bash
   docker exec -t wms_postgres pg_dump -U wms_user warehouse_wms > backup_$(date +%Y%m%d).sql
   ```
