# k6 Load Tests — Chattining Application

## Prerequisites

Install k6:
```bash
# Windows (Chocolatey)
choco install k6

# macOS
brew install k6

# Docker
docker run --rm -i grafana/k6 run - <script.js
```

## Running Tests

### HTTP Load Test (REST API)
Tests auth, user, and chat endpoints under increasing load (up to 5,000 VUs):
```bash
k6 run tests/load/http-load.js
```

### WebSocket Load Test (Socket.IO)
Tests persistent WebSocket connections (up to 5,000 concurrent):
```bash
k6 run tests/load/websocket-load.js
```

### Custom Base URL
```bash
k6 run -e BASE_URL=http://your-server:5000 tests/load/http-load.js
k6 run -e BASE_URL=http://your-server:5000 -e WS_URL=ws://your-server:5000 tests/load/websocket-load.js
```

## Load Stages

| Stage | Duration | Virtual Users | Purpose |
|-------|----------|---------------|---------|
| Warm-up | 1 min | 50 | Baseline |
| Ramp-up | 2 min | 500 | Moderate load |
| Heavy | 3 min | 2,000 | Stress test |
| **Peak** | **5 min** | **5,000** | **Max capacity** |
| Cool-down | 1 min | 50 | Recovery |

## Pass/Fail Thresholds

| Metric | Threshold | Description |
|--------|-----------|-------------|
| `http_req_duration` | p95 < 500ms | 95% of HTTP requests under 500ms |
| `errors` | rate < 1% | Less than 1% error rate |
| `login_duration` | p95 < 800ms | Login endpoint under 800ms |
| `ws_connect_success` | rate > 95% | 95% of WebSocket connections succeed |
| `ws_connect_duration` | p95 < 2000ms | WS handshake under 2 seconds |

## Results

Results are saved to `tests/load/results/`:
- `http-summary.json` — HTTP test results
- `ws-summary.json` — WebSocket test results
