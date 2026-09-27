# Server Port Plan

Only Nginx should listen on public web ports. App services should bind to
localhost ports and be reached through Nginx by domain name.

## Public Ports

| Port | Owner | Purpose |
| --- | --- | --- |
| 22 | system | SSH |
| 80 | nginx | HTTP entry |
| 443 | nginx | HTTPS entry |

## App Ports

| Port | Project | Process | Notes |
| --- | --- | --- | --- |
| 3000 | cdgpu.cn | website | Existing official site |
| 3001 | gpu-erp | gpu-erp-api | Backend API for `gpu-erp.cdgpu.cn` |
| 5173 | poker | frontend | Existing poker frontend |
| 5174 | poker | api/socket | Existing poker backend |
| 3010 | reserved | project-a frontend | Use for the next new project |
| 3011 | reserved | project-a api | Use for the next new project |
| 3020 | reserved | project-b frontend | Use for another new project |
| 3021 | reserved | project-b api | Use for another new project |

## Rules

- Keep frontend/static sites behind Nginx.
- Keep backend APIs bound to `127.0.0.1`.
- Allocate ports in pairs: even for frontend, odd for API.
- Record every new port here before starting a service.
- Keep `.env`, PM2 ecosystem files, and Nginx `proxy_pass` in sync.
