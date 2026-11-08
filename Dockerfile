# ============================================================
#  mihomo 内核 + Yacd-meta 面板 + country.mmdb 单镜像打包
#  一个容器跑全部:内核用 external-ui 内置面板,单进程、单端口
#
#  组件来源(全部在构建时取,可用 --build-arg 钉版本)
#    mihomo 内核     metacubex/mihomo              CORE_TAG  默认 latest
#    Yacd-meta 面板  MetaCubeX/Yacd-meta gh-pages  UI_REF    默认 gh-pages
#    country.mmdb    MetaCubeX/meta-rules-dat      GEO_TAG   默认 latest
#
#  钉版本示例:
#    docker compose build \
#      --build-arg CORE_TAG=v1.19.33 \
#      --build-arg GEO_TAG=latest \
#      --build-arg UI_REF=gh-pages
#
#  面板说明:用 gh-pages 分支的纯静态产物(资源是相对路径 ./assets),
#            可直接被内核 external-ui 托管在 /ui 子路径下,不需要 Node。
# ============================================================

ARG CORE_TAG=latest

# ---------- 阶段 1:拉取 Yacd-meta 面板静态文件(gh-pages) ----------
# Yacd-meta 的 index.html 里把默认后端写死成 http://127.0.0.1:9090,
# 远程访问时面板会去连浏览器本机的 9090(必然连不上)。
# 这里塞一行内联脚本,在 SPA 启动前把默认后端改成当前页面的 origin
# —— 本镜像里面板和 API 同端口,location.origin 正好就是 external-controller。
FROM alpine:latest AS ui
ARG UI_REF=gh-pages
RUN apk add --no-cache git \
    && git clone --depth 1 -b "${UI_REF}" https://github.com/MetaCubeX/Yacd-meta.git /ui \
    && rm -rf /ui/.git \
    && sed -i 's|</body>|<script>var a=document.getElementById("app");if(a)a.dataset.baseUrl=location.origin;</script></body>|' /ui/index.html \
    && ( grep -q 'dataset.baseUrl=location.origin' /ui/index.html \
         && echo "[ui] 已把面板默认后端指向本机 origin" \
         || echo "[ui] WARN: 未能注入默认后端,面板将要求手动填地址" )

# ---------- 阶段 2:拉取最新 GeoIP 库(country.mmdb) ----------
# 来源 MetaCubeX/meta-rules-dat 的 latest 滚动发布,每次构建都是当天最新
FROM alpine:latest AS geo
ARG GEO_TAG=latest
RUN apk add --no-cache curl \
    && curl -fsSL -o /country.mmdb \
         "https://github.com/MetaCubeX/meta-rules-dat/releases/download/${GEO_TAG}/country.mmdb" \
    && test -s /country.mmdb \
    && ls -l /country.mmdb

# ---------- 阶段 3:组装最终镜像 ----------
FROM metacubex/mihomo:${CORE_TAG}

# 配置目录(官方镜像约定)
ENV MIHOMO_CONFIG_DIR=/root/.config/mihomo

# 1) 内置面板静态文件(Yacd-meta gh-pages 编译产物)
COPY --from=ui /ui ${MIHOMO_CONFIG_DIR}/ui

# 2) GeoIP 国家数据库(启动必须)
COPY --from=geo /country.mmdb ${MIHOMO_CONFIG_DIR}/country.mmdb

# 3) 内核配置(启用 external-ui 指向内置面板)
COPY config.yaml ${MIHOMO_CONFIG_DIR}/config.yaml

WORKDIR ${MIHOMO_CONFIG_DIR}

# 启动内核:二进制在 /mihomo,-d 指定配置目录
# -ext-ui 强制启用内置面板,优先级高于 config.yaml,
# 这样用户挂载自己的 config.yaml(无 external-ui 字段)时面板照样生效
ENTRYPOINT ["/mihomo"]
CMD ["-d", "/root/.config/mihomo", "-ext-ui", "/root/.config/mihomo/ui"]
