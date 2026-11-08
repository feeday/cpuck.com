#!/usr/bin/env bash
# ============================================================
# PHP + Nginx 一键安装脚本
# 支持 Ubuntu 20.04+ / CentOS Stream 10 x86_64
#
# 一键执行：
# curl -fsSL https://raw.githubusercontent.com/feeday/cpuck.com/main/php.sh | sudo bash
#
# 可选参数：
# SSH_PORT=2222 EXTRA_TCP_PORTS="8888 8080" sudo -E bash php.sh
# ============================================================

set -Eeuo pipefail

log() {
    printf '\n\033[32m[INFO]\033[0m %s\n' "$*"
}

warn() {
    printf '\n\033[33m[WARN]\033[0m %s\n' "$*" >&2
}

error() {
    printf '\n\033[31m[ERROR]\033[0m %s\n' "$*" >&2
    exit 1
}

# 自动获取 root 权限
if [[ "$EUID" -ne 0 ]]; then
    if command -v sudo >/dev/null 2>&1; then
        exec sudo -E bash "$0" "$@"
    fi
    error "请使用 root 用户运行"
fi

[[ -f /etc/os-release ]] || error "无法识别 Linux 发行版"
. /etc/os-release

DISTRO=""
case "$ID" in
    ubuntu)
        DISTRO="ubuntu"
        ;;
    centos)
        VERSION_MAJOR="$(cut -d. -f1 <<< "$VERSION_ID")"
        [[ "$VERSION_MAJOR" == "10" ]] || error "仅支持 CentOS Stream 10"
        grep -qi "CentOS Stream" /etc/os-release || error "当前不是 CentOS Stream"
        [[ "$(uname -m)" == "x86_64" ]] || error "CentOS Stream 10 仅支持 x86_64"
        DISTRO="centos"
        ;;
    *)
        error "暂不支持此系统：$PRETTY_NAME"
        ;;
esac

log "系统：$PRETTY_NAME"
log "架构：$(uname -m)"

# ------------------------------------------------------------
# 检测 SSH 端口，避免启用防火墙后远程连接中断
# ------------------------------------------------------------

SSH_PORTS=()

if [[ -n "${SSH_PORT:-}" ]]; then
    SSH_PORT_TEXT="$(tr ',' ' ' <<< "$SSH_PORT")"
    read -r -a SSH_PORTS <<< "$SSH_PORT_TEXT"
elif [[ -n "${SSH_CONNECTION:-}" ]]; then
    read -r -a SSH_CONN <<< "$SSH_CONNECTION"
    if (( ${#SSH_CONN[@]} >= 4 )); then
        SSH_PORTS=("${SSH_CONN[3]}")
    fi
fi

if (( ${#SSH_PORTS[@]} == 0 )) && command -v sshd >/dev/null 2>&1; then
    mapfile -t SSH_PORTS < <(
        sshd -T 2>/dev/null | awk '$1 == "port" {print $2}' | sort -nu || true
    )
fi

if (( ${#SSH_PORTS[@]} == 0 )); then
    SSH_PORTS=(22)
fi

EXTRA_PORTS=()
if [[ -n "${EXTRA_TCP_PORTS:-}" ]]; then
    EXTRA_PORT_TEXT="$(tr ',' ' ' <<< "$EXTRA_TCP_PORTS")"
    read -r -a EXTRA_PORTS <<< "$EXTRA_PORT_TEXT"
fi

validate_port() {
    local port="$1"
    [[ "$port" =~ ^[0-9]{1,5}$ ]] || error "无效端口：$port"
    (( 10#$port >= 1 && 10#$port <= 65535 )) || error "端口超出范围：$port"
}

for port in "${SSH_PORTS[@]}" "${EXTRA_PORTS[@]}"; do
    validate_port "$port"
done

log "SSH 放行端口：${SSH_PORTS[*]}"
if (( ${#EXTRA_PORTS[@]} > 0 )); then
    log "额外放行端口：${EXTRA_PORTS[*]}"
fi

# ------------------------------------------------------------
# 安装 PHP、Nginx 和防火墙
# ------------------------------------------------------------

if [[ "$DISTRO" == "ubuntu" ]]; then
    log "更新 Ubuntu 软件源"
    apt-get update

    log "安装 Nginx、PHP-FPM、常用扩展和 UFW"
    DEBIAN_FRONTEND=noninteractive apt-get install -y \
        nginx curl ufw \
        php php-cli php-fpm php-mysql php-gd php-mbstring \
        php-xml php-curl php-zip php-intl php-bcmath php-soap php-opcache

    PHP_VERSION="$(php -r 'echo PHP_MAJOR_VERSION.".".PHP_MINOR_VERSION;')"
    FPM_SERVICE="php${PHP_VERSION}-fpm"
    FPM_SOCKET="/run/php/php${PHP_VERSION}-fpm.sock"

    log "启动 PHP-FPM：$FPM_SERVICE"
    systemctl enable --now "$FPM_SERVICE"

elif [[ "$DISTRO" == "centos" ]]; then
    log "安装 Nginx、PHP-FPM、常用扩展和 Firewalld"
    dnf install -y \
        nginx curl firewalld \
        php php-cli php-fpm php-mysqlnd php-gd php-mbstring \
        php-xml php-intl php-opcache php-bcmath php-soap \
        php-pecl-zip php-process

    PHP_VERSION="$(php -r 'echo PHP_MAJOR_VERSION.".".PHP_MINOR_VERSION;')"
    FPM_SERVICE="php-fpm"
    FPM_SOCKET="/run/php-fpm/www.sock"
    FPM_POOL="/etc/php-fpm.d/www.conf"

    [[ -f "$FPM_POOL" ]] || error "找不到 PHP-FPM 配置：$FPM_POOL"

    # CentOS Stream 10 官方配置通常已通过 ACL 授权 nginx 访问 FPM Socket。
    # 优先保留系统默认 ACL，只有未授权 nginx 时才调整 Socket 权限。
    if ! grep -Eq '^[[:space:]]*listen\.acl_users[[:space:]]*=.*nginx' "$FPM_POOL" && \
       ! grep -Eq '^[[:space:]]*listen\.owner[[:space:]]*=[[:space:]]*nginx' "$FPM_POOL"; then
        log "当前 PHP-FPM 未授权 Nginx，补充 Socket 权限"
        sed -ri \
            -e 's|^[;[:space:]]*listen[[:space:]]*=.*|listen = /run/php-fpm/www.sock|' \
            -e 's|^[;[:space:]]*listen\.owner[[:space:]]*=.*|listen.owner = nginx|' \
            -e 's|^[;[:space:]]*listen\.group[[:space:]]*=.*|listen.group = nginx|' \
            -e 's|^[;[:space:]]*listen\.mode[[:space:]]*=.*|listen.mode = 0660|' \
            -e 's|^[[:space:]]*listen\.acl_users[[:space:]]*=.*|;listen.acl_users = apache,nginx|' \
            -e 's|^[[:space:]]*listen\.acl_groups[[:space:]]*=.*|;listen.acl_groups =|' \
            "$FPM_POOL"

        grep -Eq '^[[:space:]]*listen\.owner[[:space:]]*=' "$FPM_POOL" || echo 'listen.owner = nginx' >> "$FPM_POOL"
        grep -Eq '^[[:space:]]*listen\.group[[:space:]]*=' "$FPM_POOL" || echo 'listen.group = nginx' >> "$FPM_POOL"
        grep -Eq '^[[:space:]]*listen\.mode[[:space:]]*=' "$FPM_POOL" || echo 'listen.mode = 0660' >> "$FPM_POOL"
    fi

    php-fpm -t
    systemctl enable --now "$FPM_SERVICE"
    systemctl restart "$FPM_SERVICE"
    [[ -S "$FPM_SOCKET" ]] || error "PHP-FPM Socket 未生成：$FPM_SOCKET"
fi

systemctl is-active --quiet "$FPM_SERVICE" || error "PHP-FPM 启动失败：$FPM_SERVICE"

# ------------------------------------------------------------
# 创建 PHP 测试页面
# 如果网站目录已有首页，不覆盖用户原有文件
# ------------------------------------------------------------

WEB_ROOT="/var/www/html"
PHP_TEST_FILE="$WEB_ROOT/php-test.php"

mkdir -p "$WEB_ROOT"

cat > "$PHP_TEST_FILE" <<'PHP'
<?php
$version = htmlspecialchars(PHP_VERSION, ENT_QUOTES, 'UTF-8');
$server = htmlspecialchars($_SERVER['SERVER_SOFTWARE'] ?? 'Nginx', ENT_QUOTES, 'UTF-8');
?>
<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>PHP 环境安装成功</title>
<style>
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f3f6fb;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#172033;padding:24px}
main{width:min(100%,520px);background:#fff;border:1px solid #e8edf4;border-radius:20px;padding:36px;box-shadow:0 16px 48px rgba(20,40,80,.08)}
.icon{width:54px;height:54px;border-radius:16px;background:#e9f9ef;color:#16a34a;display:grid;place-items:center;font-size:28px}
h1{font-size:25px;margin:22px 0 8px}
p{color:#64748b;line-height:1.7}
dl{margin:26px 0 0;border-top:1px solid #edf0f5}
dl div{display:flex;justify-content:space-between;gap:16px;padding:14px 0;border-bottom:1px solid #edf0f5}
dt{color:#64748b}dd{margin:0;font-weight:600}
.ok{color:#16a34a}
small{display:block;margin-top:22px;color:#94a3b8}
</style>
</head>
<body>
<main>
<div class="icon">✓</div>
<h1>PHP 运行正常！</h1>
<p>Nginx、PHP-FPM 已成功连接，服务器 PHP 环境安装完成。</p>
<dl>
<div><dt>Web Server</dt><dd><?= $server ?></dd></div>
<div><dt>PHP Version</dt><dd><?= $version ?></dd></div>
<div><dt>PHP-FPM</dt><dd class="ok">Running</dd></div>
<div><dt>状态</dt><dd class="ok">正常运行</dd></div>
</dl>
<small>此页面仅用于环境检测。正式部署网站后，可以删除 php-test.php。</small>
</main>
</body>
</html>
PHP

chmod 644 "$PHP_TEST_FILE"
chmod 755 "$WEB_ROOT"

HOME_CREATED="no"
if [[ ! -e "$WEB_ROOT/index.php" && ! -e "$WEB_ROOT/index.html" ]]; then
    cp "$PHP_TEST_FILE" "$WEB_ROOT/index.php"
    HOME_CREATED="yes"
    log "已创建 PHP 默认首页：$WEB_ROOT/index.php"
else
    log "检测到已有网站首页，保留原文件，不覆盖"
fi

# ------------------------------------------------------------
# 配置 Nginx 解析 PHP
# ------------------------------------------------------------

log "配置 Nginx 网站和 PHP-FPM 转发"

if [[ "$DISTRO" == "ubuntu" ]]; then
    mkdir -p /etc/nginx/sites-available /etc/nginx/sites-enabled

    # 只停用 Ubuntu 软件包自带的默认站点，不动其他虚拟主机
    if [[ -L /etc/nginx/sites-enabled/default ]] && \
       [[ "$(readlink -f /etc/nginx/sites-enabled/default)" == "/etc/nginx/sites-available/default" ]]; then
        rm -f /etc/nginx/sites-enabled/default
    fi

    NGINX_SITE="/etc/nginx/sites-available/php-default"
    NGINX_LINK="/etc/nginx/sites-enabled/php-default"
else
    mkdir -p /etc/nginx/conf.d

    # 停用 CentOS Nginx 软件包自带的默认站点，先保留备份
    if [[ -f /etc/nginx/conf.d/default.conf ]] && \
       grep -Eq '^[[:space:]]*listen[[:space:]].*default_server' /etc/nginx/conf.d/default.conf; then
        BACKUP="/etc/nginx/conf.d/default.conf.disabled-by-php-installer"
        if [[ -e "$BACKUP" ]]; then
            BACKUP="/etc/nginx/conf.d/default.conf.disabled-by-php-installer.$(date +%s)"
        fi
        mv /etc/nginx/conf.d/default.conf "$BACKUP"
        log "已备份并停用 Nginx 默认站点：$BACKUP"
    fi

    NGINX_SITE="/etc/nginx/conf.d/00-php-default.conf"
fi

cat > "$NGINX_SITE" <<EOF
server {
    listen 80 default_server;
    server_name _;

    root /var/www/html;
    index index.php index.html;

    location / {
        try_files \$uri \$uri/ =404;
    }

    location ~ \.php$ {
        try_files \$uri =404;
        include fastcgi_params;
        fastcgi_param SCRIPT_FILENAME \$document_root\$fastcgi_script_name;
        fastcgi_index index.php;
        fastcgi_pass unix:$FPM_SOCKET;
    }

    location ~ /\.(?!well-known).* {
        deny all;
    }
}
EOF

if [[ "$DISTRO" == "ubuntu" ]]; then
    ln -sfn "$NGINX_SITE" "$NGINX_LINK"
fi

# CentOS SELinux：恢复网站目录和 Nginx 配置的默认安全上下文
if [[ "$DISTRO" == "centos" ]] && command -v restorecon >/dev/null 2>&1; then
    restorecon -RF "$WEB_ROOT" /etc/nginx 2>/dev/null || true
fi

nginx -t || error "Nginx 配置检查失败，请检查是否有其他站点占用了默认 80 端口"

systemctl enable --now nginx
systemctl restart nginx

systemctl is-active --quiet nginx || error "Nginx 启动失败"

# ------------------------------------------------------------
# 配置防火墙：只增加必要规则，不清空现有规则
# ------------------------------------------------------------

if [[ "$DISTRO" == "ubuntu" ]]; then
    log "配置 Ubuntu UFW 防火墙"

    if ! ufw status | grep -q '^Status: active'; then
        ufw default deny incoming
        ufw default allow outgoing
    fi

    for port in "${SSH_PORTS[@]}"; do
        ufw allow "${port}/tcp"
    done

    ufw allow 80/tcp
    ufw allow 443/tcp

    for port in "${EXTRA_PORTS[@]}"; do
        ufw allow "${port}/tcp"
    done

    ufw --force enable

else
    log "配置 CentOS Stream 10 Firewalld 防火墙"

    systemctl enable --now firewalld

    ACTIVE_ZONES=()
    mapfile -t ACTIVE_ZONES < <(
        firewall-cmd --get-active-zones |
        awk 'NF && $0 !~ /^[[:space:]]/ {print $1}'
    )

    if (( ${#ACTIVE_ZONES[@]} == 0 )); then
        ACTIVE_ZONES=("$(firewall-cmd --get-default-zone)")
    fi

    for zone in "${ACTIVE_ZONES[@]}"; do
        firewall-cmd --permanent --zone="$zone" --add-service=http
        firewall-cmd --permanent --zone="$zone" --add-service=https

        for port in "${SSH_PORTS[@]}"; do
            firewall-cmd --permanent --zone="$zone" --add-port="${port}/tcp"
        done

        for port in "${EXTRA_PORTS[@]}"; do
            firewall-cmd --permanent --zone="$zone" --add-port="${port}/tcp"
        done
    done

    firewall-cmd --reload
fi

# ------------------------------------------------------------
# 本机访问测试
# ------------------------------------------------------------

log "检查 PHP、PHP-FPM、Nginx 和 HTTP 页面"

php -r 'echo "PHP Version: ".PHP_VERSION.PHP_EOL;'
systemctl is-active "$FPM_SERVICE"
systemctl is-active nginx

if ! curl --noproxy '*' -fsS http://127.0.0.1/php-test.php | grep -q 'PHP 运行正常'; then
    warn "PHP 测试页面访问失败，最近服务日志如下："
    journalctl -u nginx -u "$FPM_SERVICE" -n 35 --no-pager || true
    error "本机 PHP 页面测试失败，请根据上方日志排查"
fi

log "防火墙状态"
if [[ "$DISTRO" == "ubuntu" ]]; then
    ufw status verbose
else
    firewall-cmd --get-active-zones
    firewall-cmd --list-all
fi

echo
echo "================================================"
echo "             PHP 环境安装成功"
echo "================================================"
echo "系统：$PRETTY_NAME"
echo "PHP：$PHP_VERSION"
echo "PHP-FPM：$FPM_SERVICE"
echo "Nginx：$(nginx -v 2>&1)"
echo "网站目录：$WEB_ROOT"
echo "PHP 测试页：http://服务器公网IP/php-test.php"
echo "网站首页：http://服务器公网IP/"
echo "首页是否由脚本新建：$HOME_CREATED"
echo "SSH 放行端口：${SSH_PORTS[*]}"
echo "HTTP：80/tcp（已放行）"
echo "HTTPS：443/tcp（已放行）"
if (( ${#EXTRA_PORTS[@]} > 0 )); then
    echo "额外端口：${EXTRA_PORTS[*]}"
fi
echo "防火墙：已开启"
echo "================================================"
echo "提示：云服务器安全组也需要放行 TCP 80/443。"
echo "正式部署网站后，建议删除 /var/www/html/php-test.php。"
