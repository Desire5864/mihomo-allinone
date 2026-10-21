#!/usr/bin/env bash
# 一键构建 + 启动脚本(在 NAS / 有 Docker 的机器上执行)

set -e

# 前置检查
if [ ! -f country.mmdb ]; then
  echo "[错误] 缺少 country.mmdb(GeoIP 启动必须文件),请放到本目录后重试。"
  exit 1
fi

echo "==> 1. 构建一体化镜像(mihomo 内核 + metacubexd 面板 + country.mmdb)"
echo "     首次构建会 clone metacubexd 的 gh-pages,需要能访问 GitHub,请耐心等待。"
docker compose build

echo "==> 2. 启动容器"
docker compose up -d

echo ""
echo "==> 完成。访问:"
echo "    面板:      http://<NAS-IP>:9090/ui"
echo "    内核 API:  http://<NAS-IP>:9090 (secret: change-me)"
echo "    代理端口:  <NAS-IP>:7890"
echo ""
echo "提示: 面板与 API 同端口,进入面板填后端 http://<NAS-IP>:9090 + secret 即可"
echo "注意: 请修改 config.yaml 里的 secret(默认 change-me)后重新 build!"
