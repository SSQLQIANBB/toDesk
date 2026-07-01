# Tencent CVM deployment

This project is deployed with Docker Compose:

- `frontend`: Vue static build served by Nginx on port 80.
- `backend`: Koa API and Socket.IO on internal port 3000.
- `mysql`: MySQL 8.4 with persistent volume.
- `redis`: Redis 7.4 with persistent volume.

## Server prerequisites

Open these ports in the Tencent Cloud CVM security group:

- `22` for SSH.
- `80` for HTTP.
- `443` if you later add HTTPS.

Install Docker and Docker Compose on the CVM.

## Deploy

Option A: run the helper script on the CVM:

```bash
curl -fsSL https://raw.githubusercontent.com/SSQLQIANBB/toDesk/master/deploy/deploy-tencent-cvm.sh | bash
cd /opt/todesk
vi .env
docker compose up -d --build
```

Option B: run from Windows with SSH access:

```powershell
.\deploy\deploy-tencent-cvm.ps1 -HostName <your-cvm-public-ip> -User root
```

Option C: run the commands manually:

```bash
git clone git@github.com:SSQLQIANBB/toDesk.git /opt/todesk
cd /opt/todesk
cp .env.production.example .env
vi .env
docker compose up -d --build
```

Then open:

```text
http://<your-cvm-public-ip>
```

## Update

```bash
cd /opt/todesk
git pull --ff-only
docker compose up -d --build
```

## Logs

```bash
docker compose ps
docker compose logs -f backend
docker compose logs -f frontend
```
