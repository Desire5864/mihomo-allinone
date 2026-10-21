# mihomo + metacubexd + country.mmdb 单镜像一体化打包

把 **mihomo 代理内核**、**metacubexd 面板**、**country.mmdb(GeoIP 启动必须文件)** 打包进**同一个镜像、同一个容器**。面板由内核的 `external-ui` 托管,与 API 共用 9090 端口,无需第二个进程、无需 nginx、无需 Node。

> 本方案已按你群晖 NAS 的现状对齐:
> - 内核镜像源用 `metacubex/mihomo`(Docker Hub 版,NAS 现有 `mihomo` 容器就是这个)
> - 内核二进制在 `/mihomo`(不在 PATH,已用绝对路径调用)
> - 网络模式 host + TUN,和你 NAS 现有 `mihomo` 容器一致

## 目录结构

```
mihomo-docker/
├── Dockerfile           # 多阶段构建:拉面板静态文件 + 内核 + mmdb 合一
├── config.yaml          # 内核配置(端口/控制器/secret/external-ui)
├── docker-compose.yml   # 单服务编排(host 模式 + TUN)
├── build.sh             # 一键构建+启动
├── country.mmdb         # GeoIP 国家数据库(启动必须)
└── README.md            # 本文件
```

## 组件说明

| 组件 | 来源 | 打包方式 |
|------|------|----------|
| mihomo 内核 | `metacubex/mihomo` | 作为最终镜像基础 |
| metacubexd 面板 | `MetaCubeX/metacubexd` gh-pages 分支 | 构建阶段 clone 静态文件,作为 `external-ui` 打入 |
| country.mmdb | 用户提供 | COPY 进配置目录 |

> 为什么面板用 gh-pages 而不是 `ghcr.io/metacubex/metacubexd` 镜像?
> 后者是 **Node SSR 运行时**(`public/` 目录里没有 `index.html`,HTML 由 Node 动态生成),不能直接当静态 external-ui。gh-pages 分支是纯静态导出、带正确的子路径 base,正是官方推荐给 mihomo `external-ui` 用的产物。

## 部署步骤

在有 Docker 的机器(NAS / VPS)上,把整个 `mihomo-docker/` 目录传过去,然后:

```bash
cd mihomo-docker
bash build.sh
```

或手动分步:

```bash
docker compose build          # 构建一体化镜像
docker compose up -d          # 启动容器
```

> 首次 build 会在构建阶段 clone metacubexd 的 gh-pages,需要能访问 GitHub。

## 端口(host 模式,直接监听宿主机)

| 端口 | 用途 |
|------|------|
| 9090 | 内核 API + 内置面板(`/ui`) |
| 7890 | 混合代理端口(HTTP+SOCKS) |

## 使用

1. 浏览器打开 `http://<NAS-IP>:9090/ui`
2. 面板后端地址填 `http://<NAS-IP>:9090`,再填 secret(`change-me`)

> ⚠️ **务必修改 `config.yaml` 里的 `secret`**,否则任何能访问 9090 端口的人都能控制你的代理。

## 改配置(接入订阅等)

配置全部打包在镜像里,改配置后要重新构建:

```bash
# 1. 编辑根目录 config.yaml,填上你的订阅节点 / proxy-providers / 规则
# 2. 重新构建并重启
docker compose build && docker compose up -d
```

如果你想像 NAS 现有部署那样**把配置挂出来热改**(不改镜像),可以:

1. 在 `docker-compose.yml` 里取消 `volumes` 那段注释,挂载 `./config:/root/.config/mihomo`
2. 把 `config.yaml`、`country.mmdb` 放到 `./config/`,并把 `ui/` 静态文件也放进去(或改用绝对路径 `external-ui`)

## 说明

- 面板静态文件(gh-pages)与 `country.mmdb` 都已打进镜像,位于容器 `/root/.config/mihomo/` 下(`ui/`、`country.mmdb`)。
- 更新面板:重新 build 即可(clone 最新 gh-pages);更新 mmdb:替换根目录 `country.mmdb` 后重新 build。
- `external-ui: ui` 是相对路径,内核会解析到配置目录下的 `ui` 文件夹。
- TUN 透明代理已按 NAS 现状开启(`NET_ADMIN` + `/dev/net/tun`)。若 `config.yaml` 里不加 `tun:` 配置块,则不会实际启用 TUN,仅作为普通代理。
