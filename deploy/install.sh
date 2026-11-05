#!/usr/bin/env bash
# Install or update the Agency Works Job List on an Ubuntu VPS behind nginx + Let's Encrypt.
#
# First install (as root):
#   curl -fsSL https://raw.githubusercontent.com/starktvm-hrms/joblist/claude/agency-joblist-dashboard-82rami/deploy/install.sh | bash
# or, from a checkout:  sudo bash deploy/install.sh
#
# Re-run the same command any time to pull the latest code, rebuild and restart.
#
# Optional environment variables:
#   DOMAIN     (default joblist.starkpeople.in)
#   REPO_URL   (default https://github.com/starktvm-hrms/joblist.git;
#               for a private repo use https://<token>@github.com/starktvm-hrms/joblist.git)
#   BRANCH     (default claude/agency-joblist-dashboard-82rami)
#   PORT       (default 3010, internal only; nginx proxies to it)
#   LE_EMAIL   (email for Let's Encrypt expiry notices; optional)
set -euo pipefail

DOMAIN="${DOMAIN:-joblist.starkpeople.in}"
REPO_URL="${REPO_URL:-https://github.com/starktvm-hrms/joblist.git}"
BRANCH="${BRANCH:-claude/agency-joblist-dashboard-82rami}"
APP_DIR=/opt/joblist
DATA_DIR=/var/lib/joblist
ENV_FILE=/etc/joblist.env
SERVICE=joblist
APP_USER=joblist

say() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
[ "$(id -u)" -eq 0 ] || { echo "Please run as root (sudo)."; exit 1; }

say "Installing system packages"
export DEBIAN_FRONTEND=noninteractive
PKGS=(git curl ca-certificates xz-utils nginx certbot python3-certbot-nginx openssl)
MISSING=()
for p in "${PKGS[@]}"; do dpkg -s "$p" >/dev/null 2>&1 || MISSING+=("$p"); done
if [ ${#MISSING[@]} -gt 0 ]; then
  # A broken third-party apt source (e.g. Monarx on a new Ubuntu release) must not stop the install.
  apt-get update -qq || echo "!! apt-get update reported errors (see above); continuing with available sources"
  apt-get install -y -qq "${MISSING[@]}" >/dev/null
else
  echo "All system packages already installed"
fi

# Node.js 22.13+ is required (built-in SQLite). Installed from nodejs.org so it does not depend on apt.
node_ok() { command -v node >/dev/null && node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||(a===22&&b>=13)?0:1)'; }
if ! node_ok; then
  say "Installing Node.js 22 from nodejs.org"
  case "$(uname -m)" in x86_64) NARCH=x64 ;; aarch64|arm64) NARCH=arm64 ;; *) echo "Unsupported CPU $(uname -m)"; exit 1 ;; esac
  NVER="$(curl -fsSL https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt | grep -o "node-v22[0-9.]*-linux-$NARCH.tar.xz" | head -1)"
  [ -n "$NVER" ] || { echo "Could not find a Node.js 22 download"; exit 1; }
  TMP="$(mktemp -d)"
  curl -fsSL "https://nodejs.org/dist/latest-v22.x/$NVER" -o "$TMP/$NVER"
  (cd "$TMP" && curl -fsSL https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt | grep " $NVER\$" | sha256sum -c - >/dev/null)
  tar -xJf "$TMP/$NVER" -C /usr/local --strip-components=1 --exclude='*.md' --exclude=LICENSE
  rm -rf "$TMP"
  hash -r
fi
node_ok || { echo "Node.js 22.13+ is required, found $(node -v 2>/dev/null || echo none)"; exit 1; }
echo "Node $(node -v)"

say "Fetching code into $APP_DIR"
id -u "$APP_USER" >/dev/null 2>&1 || useradd --system --home "$DATA_DIR" --shell /usr/sbin/nologin "$APP_USER"
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" fetch --quiet origin "$BRANCH"
  git -C "$APP_DIR" checkout --quiet -B "$BRANCH" "origin/$BRANCH"
else
  git clone --quiet --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
fi

say "Building"
cd "$APP_DIR"
npm ci --no-audit --no-fund --loglevel=error
npm run build --silent
npm prune --omit=dev --no-audit --no-fund --loglevel=error

mkdir -p "$DATA_DIR"
chown -R "$APP_USER:$APP_USER" "$DATA_DIR"

if [ ! -f "$ENV_FILE" ]; then
  say "Creating $ENV_FILE with generated secrets"
  PORT="${PORT:-3010}"
  while ss -ltn "( sport = :$PORT )" | grep -q LISTEN; do PORT=$((PORT + 1)); done
  ADMIN_PW="$(openssl rand -base64 12 | tr -d '/+=' | cut -c1-14)"
  STAFF_PW="$(openssl rand -base64 12 | tr -d '/+=' | cut -c1-12)"
  umask 077
  cat > "$ENV_FILE" <<EOF
NODE_ENV=production
HOST=127.0.0.1
PORT=$PORT
DATA_DIR=$DATA_DIR
JWT_SECRET=$(openssl rand -hex 48)
ADMIN_PASSWORD=$ADMIN_PW
SEED_PASSWORD=$STAFF_PW
EOF
  cat > /root/joblist-credentials.txt <<EOF
Job List - https://$DOMAIN
Initial logins (change them after first sign-in):
  admin                              / $ADMIN_PW
  department heads and team members  / $STAFF_PW
EOF
  chmod 600 /root/joblist-credentials.txt
  umask 022
fi
PORT="$(grep '^PORT=' "$ENV_FILE" | cut -d= -f2)"

say "Configuring systemd service ($SERVICE, port $PORT)"
cat > /etc/systemd/system/$SERVICE.service <<EOF
[Unit]
Description=Agency Works Job List
After=network.target

[Service]
Type=simple
User=$APP_USER
WorkingDirectory=$APP_DIR
EnvironmentFile=$ENV_FILE
ExecStart=$(command -v node) --disable-warning=ExperimentalWarning server/index.js
Restart=always
RestartSec=3
NoNewPrivileges=true
ProtectSystem=full
ReadWritePaths=$DATA_DIR

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --quiet $SERVICE
systemctl restart $SERVICE

say "Configuring nginx for $DOMAIN"
SITE=/etc/nginx/sites-available/$DOMAIN
if [ ! -f "$SITE" ]; then
  cat > "$SITE" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;
    client_max_body_size 2m;

    location / {
        proxy_pass http://127.0.0.1:$PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF
  ln -sf "$SITE" /etc/nginx/sites-enabled/$DOMAIN
fi
nginx -t
systemctl reload nginx

if [ ! -d "/etc/letsencrypt/live/$DOMAIN" ]; then
  say "Requesting HTTPS certificate"
  if [ -n "${LE_EMAIL:-}" ]; then EMAIL_ARG=(--email "$LE_EMAIL"); else EMAIL_ARG=(--register-unsafely-without-email); fi
  certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --redirect "${EMAIL_ARG[@]}" \
    || echo "!! Certificate request failed. Check that DNS for $DOMAIN points to this server, then re-run this script."
fi

sleep 2
if [ "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/api/auth/me")" = "401" ]; then
  say "Done: https://$DOMAIN is up"
else
  echo "!! The app did not respond. See: journalctl -u $SERVICE -n 50"
  exit 1
fi
[ -f /root/joblist-credentials.txt ] && cat /root/joblist-credentials.txt
