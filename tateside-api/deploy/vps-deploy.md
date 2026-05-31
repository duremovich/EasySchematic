# VPS Deployment Checklist

Run on the VPS as `debian`.

```bash
cd ~/EasySchematic
git pull origin master
npm ci
npm run tateside:api:build
sudo mkdir -p /var/lib/tateside-schematic
sudo chown debian:debian /var/lib/tateside-schematic
sudo install -m 0644 tateside-api/deploy/tateside-schematic-api.service /etc/systemd/system/tateside-schematic-api.service
sudo systemctl daemon-reload
sudo systemctl enable --now tateside-schematic-api
sudo systemctl status tateside-schematic-api --no-pager
curl -i http://127.0.0.1:8788/health
```

Update `/etc/caddy/Caddyfile` by adding the contents of:

```text
tateside-api/deploy/Caddyfile.snippet
```

inside the `schematic.tateside.online` site block, before the frontend catch-all route.

Then validate and reload Caddy:

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
curl -i http://127.0.0.1:8080/api/tateside/devices/templates
```

Rebuild the frontend container after the pull:

```bash
docker compose up -d --build
docker compose ps
docker compose logs --tail=100
```

Port expectations:

```text
frontend container: 127.0.0.1:8080
TateSide API:       127.0.0.1:8788
```

If Cloudflare Tunnel is configured to send `schematic.tateside.online` straight to
`http://127.0.0.1:8080`, the checked-in Docker Nginx config proxies
`/api/tateside/*` from the frontend container to the host API via:

```text
host.docker.internal:8788
```
