# ============================================================
#  mihomo 内核 + metacubexd 面板 + country.mmdb 单镜像打包
#  一个容器跑全部:内核用 external-ui 内置面板,单进程、单端口
#
#  对齐群晖 NAS 现状:
#    - 内核镜像源 metacubex/mihomo (Docker Hub)
#    - 内核二进制在 /mihomo (不在 PATH)
#    - 面板用 metacubexd gh-pages 静态产物
# ============================================================

# ---------- 阶段 1:拉取 metacubexd 面板静态文件(gh-pages) ----------
FROM alpine:latest AS ui
RUN apk add --no-cache git \
    && git clone --depth 1 -b gh-pages https://github.com/MetaCubeX/metacubexd.git /ui

# ---------- 阶段 2:组装最终镜像 ----------
FROM metacubex/mihomo:latest

# 配置目录(官方镜像约定)
ENV MIHOMO_CONFIG_DIR=/root/.config/mihomo

# 1) 内置面板静态文件(metacubexd gh-pages 编译产物)
COPY --from=ui /ui ${MIHOMO_CONFIG_DIR}/ui

# 2) GeoIP 国家数据库(启动必须)
COPY country.mmdb ${MIHOMO_CONFIG_DIR}/country.mmdb

# 3) 内核配置(启用 external-ui 指向内置面板)
COPY config.yaml ${MIHOMO_CONFIG_DIR}/config.yaml

WORKDIR ${MIHOMO_CONFIG_DIR}

# 启动内核:二进制在 /mihomo,-d 指定配置目录
# -ext-ui 强制启用内置面板,优先级高于 config.yaml,
# 这样用户挂载自己的 config.yaml(无 external-ui 字段)时面板照样生效
ENTRYPOINT ["/mihomo"]
CMD ["-d", "/root/.config/mihomo", "-ext-ui", "/root/.config/mihomo/ui"]
