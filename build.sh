#!/usr/bin/env bash
# 一键构建 + 启动脚本(在 NAS / 有 Docker 的机器上执行)

set -e

echo "==> 1. 构建一体化镜像(mihomo 内核 + Yacd-meta 面板 + 最新 country.mmdb)"
echo "     构建阶段会 clone Yacd-meta 的 gh-pages,并从 meta-rules-dat 下载最新 country.mmdb,"
echo "     需要能访问 GitHub,请耐心等待。"
docker compose build

echo "==> 2. 启动容器"
docker compose up -d

echo ""
echo "==> 完成。访问:"
echo "    面板:      http://<NAS-IP>:9090/ui"
echo "    内核 API:  http://<NAS-IP>:9090 (secret: change-me)"
echo "    代理端口:  <NAS-IP>:7890"
echo ""
echo "提示: 面板会自动推断后端地址;推断不出来时手填 http://<NAS-IP>:9090 + secret"
echo "提示: 换面板后浏览器若还显示旧页面,按 Ctrl+Shift+R 强刷一次"
echo "注意: 请修改 config.yaml 里的 secret(默认 change-me)后重新 build!"
