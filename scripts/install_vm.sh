#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root: sudo ./scripts/install_vm.sh"
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive

apt-get update
apt-get install -y ca-certificates curl git openssh-server docker.io docker-compose-plugin

systemctl enable --now docker
systemctl enable --now ssh

id analyst >/dev/null 2>&1 || useradd -m -s /bin/bash analyst
echo 'analyst:blue_team_rocks' | chpasswd

mkdir -p /opt/scenario75 /opt/admin/logs
chown root:root /opt/admin/logs
chmod 755 /opt/admin/logs

# Bind the SSH service to the challenge port while leaving normal SSH untouched
# only if no existing service already owns 2275.
if ! ss -lnt | awk '{print $4}' | grep -q ':2275$'; then
  cat >/etc/ssh/sshd_config.d/scenario75.conf <<'EOF'
Port 22
Port 2275
PasswordAuthentication yes
EOF
  systemctl restart ssh
fi

echo "VM prerequisites installed."
echo "Copy this project to /opt/scenario75, then run scripts/start_lab.sh."
