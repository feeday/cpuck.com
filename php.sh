
#!/usr/bin/env bash
# =====================================================
# PHP 一键安装 + 防火墙配置
# 支持 Ubuntu / CentOS Stream 10 x86_64
# =====================================================

set -Eeuo pipefail

log() {
    echo -e "\n\033[32m[INFO]\033[0m $*"
}

error() {
    echo -e "\n\033[31m[ERROR]\033[0m $*" >&2
    exit 1
}

# 自动获取 root 权限
if [[ "$EUID" -ne 0 ]]; then
    command -v sudo >/dev/null 2>&1 || error "请使用 root 用户运行"
    exec sudo -E bash "$0" "$@"
fi

# 检查系统
[[ -f /etc/os-release ]] || error "无法识别系统"

source /etc/os-release

DISTRO=""

case "${ID:-}" in
    ubuntu)
        DISTRO="ubuntu"
        ;;

    centos)
        [[ "${VERSION_ID%%.*}" == "10" ]] || \
            error "仅支持 CentOS Stream 10"

        grep -qi "CentOS Stream" /etc/os-release || \
            error "检测到 CentOS，但不是 CentOS Stream"

        [[ "$(uname -m)" == "x86_64" ]] || \
            error "CentOS Stream 10 当前脚本目标为 x86_64"

        DISTRO="centos"
        ;;

    *)
        error "暂不支持此系统：${PRETTY_NAME:-unknown}"
        ;;
esac

log "系统：${PRETTY_NAME}"
log "开始安装 PHP"

# =====================================================
# SSH 端口自动识别
# =====================================================

SSH_PORTS=()

if [[ -n "${SSH_PORT:-}" ]]; then
    SSH_PORTS=("$SSH_PORT")
elif command -v sshd >/dev/null 2>&1; then
    mapfile -t SSH_PORTS < <(
        sshd -T 2>/dev/null |
        awk '$1 == "port" {print $2}' |
        sort -nu || true
    )
fi

if ((${#SSH_PORTS[@]} == 0)); then
    SSH_PORTS=(22)
fi

# 自定义额外开放端口，支持空格或逗号分隔
EXTRA_TCP_PORTS="${EXTRA_TCP_PORTS:-}"
EXTRA_TCP_PORTS="${EXTRA_TCP_PORTS//,/ }"

EXTRA_PORTS=()
read -r -a EXTRA_PORTS <<< "$EXTRA_TCP_PORTS"

# 检查端口合法性
validate_port() {
    local p="$1"

    [[ "$p" =~ ^[0-9]{1,5}$ ]] || error "无效端口：$p"

    (( 10#$p >= 1 && 10#$p <= 65535 )) || \
        error "端口超出范围：$p"
}

for p in "${SSH_PORTS[@]}" "${EXTRA_PORTS[@]}"; do
    validate_port "$p"
done

log "SSH 端口：${SSH_PORTS[*]}"

# =====================================================
# Ubuntu
# =====================================================

if [[ "$DISTRO" == "ubuntu" ]]; then

    log "更新 Ubuntu 软件源"

    apt-get update

    log "安装 PHP 和常用扩展"

    DEBIAN_FRONTEND=noninteractive apt-get install -y \
        php \
        php-cli \
        php-fpm \
        php-mysql \
        php-gd \
        php-mbstring \
        php-xml \
        php-curl \
        php-zip \
        php-intl \
        php-bcmath \
        php-soap \
        php-opcache \
        ufw

    # 获取 PHP 版本
    PHP_VERSION=$(php -r \
        'echo PHP_MAJOR_VERSION.".".PHP_MINOR_VERSION;')

    FPM_SERVICE="php${PHP_VERSION}-fpm"

    log "启动 PHP-FPM：$FPM_SERVICE"

    systemctl enable --now "$FPM_SERVICE"

    # =================================================
    # Ubuntu 防火墙 UFW
    # =================================================

    log "配置 Ubuntu UFW 防火墙"

    # 默认禁止外部主动访问
    ufw default deny incoming
    ufw default allow outgoing

    # 放行 SSH
    for p in "${SSH_PORTS[@]}"; do
        ufw allow "${p}/tcp"
    done

    # 放行 Web
    ufw allow 80/tcp
    ufw allow 443/tcp

    # 放行额外端口
    for p in "${EXTRA_PORTS[@]}"; do
        ufw allow "${p}/tcp"
    done

    # 开启防火墙
    ufw --force enable

# =====================================================
# CentOS Stream 10
# =====================================================

elif [[ "$DISTRO" == "centos" ]]; then

    log "安装 PHP 和常用扩展"

    dnf install -y \
        php \
        php-cli \
        php-fpm \
        php-mysqlnd \
        php-gd \
        php-mbstring \
        php-xml \
        php-intl \
        php-opcache \
        php-bcmath \
        php-soap \
        php-pecl-zip \
        php-process \
        firewalld

    PHP_VERSION=$(php -r \
        'echo PHP_MAJOR_VERSION.".".PHP_MINOR_VERSION;')

    FPM_SERVICE="php-fpm"

    log "启动 PHP-FPM"

    systemctl enable --now "$FPM_SERVICE"

    # =================================================
    # CentOS Firewalld 防火墙
    # =================================================

    log "配置 CentOS Firewalld 防火墙"

    systemctl enable --now firewalld

    # 获取实际使用的防火墙区域
    ACTIVE_ZONES=()

    mapfile -t ACTIVE_ZONES < <(
        firewall-cmd --get-active-zones |
        awk 'NF && $0 !~ /^[[:space:]]/ {print $1}'
    )

    if ((${#ACTIVE_ZONES[@]} == 0)); then
        ACTIVE_ZONES=("$(firewall-cmd --get-default-zone)")
    fi

    for zone in "${ACTIVE_ZONES[@]}"; do

        # Web 端口
        firewall-cmd --permanent \
            --zone="$zone" --add-service=http

        firewall-cmd --permanent \
            --zone="$zone" --add-service=https

        # SSH 端口
        for p in "${SSH_PORTS[@]}"; do
            firewall-cmd --permanent \
                --zone="$zone" --add-port="${p}/tcp"
        done

        # 自定义端口
        for p in "${EXTRA_PORTS[@]}"; do
            firewall-cmd --permanent \
                --zone="$zone" --add-port="${p}/tcp"
        done

    done

    firewall-cmd --reload

fi

# =====================================================
# 安装完成检查
# =====================================================

log "检查 PHP 安装"

php -r 'echo "PHP Version: ".PHP_VERSION.PHP_EOL;'

log "检查 PHP 扩展"

php -m

log "检查 PHP-FPM"

systemctl is-active "$FPM_SERVICE"

log "检查防火墙"

if [[ "$DISTRO" == "ubuntu" ]]; then
    ufw status verbose
else
    firewall-cmd --get-active-zones
    firewall-cmd --list-all
fi

echo
echo "=========================================="
echo "          PHP 安装成功"
echo "=========================================="
echo "系统：${PRETTY_NAME}"
echo "PHP：${PHP_VERSION}"
echo "PHP-FPM：${FPM_SERVICE}"
echo "SSH：${SSH_PORTS[*]}"
echo "HTTP：80"
echo "HTTPS：443"

if ((${#EXTRA_PORTS[@]})); then
    echo "额外端口：${EXTRA_PORTS[*]}"
fi

echo "防火墙：已开启"
echo "=========================================="
