# mihomo + Yacd-meta + country.mmdb 单镜像一体化打包

把 **mihomo 代理内核**、**Yacd-meta 面板**、**country.mmdb(GeoIP 启动必须文件)** 打包进**同一个镜像、同一个容器**。面板由内核的 `external-ui` 托管,与 API 共用 9090 端口,无需第二个进程、无需 nginx、无需 Node。

> 本方案已按你群晖 NAS 的现状对齐:
> - 内核镜像源用 `metacubex/mihomo`(Docker Hub 版,NAS 现有 `mihomo` 容器就是这个)
> - 内核二进制在 `/mihomo`(不在 PATH,已用绝对路径调用)
> - 网络模式 host + TUN,和你 NAS 现有 `mihomo` 容器一致

## 目录结构

```
mihomo-docker/
├── Dockerfile           # 多阶段构建:拉面板静态文件 + 拉 mmdb + 内核,三合一
├── config.yaml          # 内核配置(端口/控制器/secret/external-ui)
├── compose.yaml         # 单服务编排(host 模式 + TUN),直接用现成镜像
├── docker-compose.yml   # 同上,带 build 段的本地构建版
├── build.sh             # 一键构建+启动
└── README.md            # 本文件
```

> 仓库里**不再存放 `country.mmdb`**(7.6 MB 二进制,且会过期)。
> 改为构建时从 `meta-rules-dat` 的 latest 发布下载,每次 build 都是当天最新。

## 组件说明

| 组件 | 来源 | 打包方式 | 构建参数 |
|------|------|----------|----------|
| mihomo 内核 | `metacubex/mihomo` | 作为最终镜像基础 | `CORE_TAG`(默认 `latest`) |
| Yacd-meta 面板 | `MetaCubeX/Yacd-meta` `gh-pages` 分支 | 构建阶段 clone 静态文件,去掉 `.git`,作为 `external-ui` 打入 | `UI_REF`(默认 `gh-pages`) |
| country.mmdb | `MetaCubeX/meta-rules-dat` 的 `latest` 发布 | 构建阶段 curl 下载后 COPY 进配置目录 | `GEO_TAG`(默认 `latest`) |

> **为什么面板用 gh-pages 而不是面板的容器镜像?**
> metacubexd 的镜像(`ghcr.io/metacubex/metacubexd`)是 **Node SSR 运行时**(`public/` 里没有 `index.html`,HTML 由 Node 动态生成),不能直接当静态 `external-ui`。
> Yacd-meta 的 gh-pages 是纯静态导出,Vite 打包后资源是相对路径(`./assets/...`),正好可以直接挂在 `/ui` 子路径下,体积也只有 2 MB 出头。

## 钉版本(可选)

三个来源默认都取「构建那一刻的最新」,所以同一份代码不同时间 build 出来的内容会不一样。要复现就显式指定:

```bash
docker compose build \
  --build-arg CORE_TAG=v1.19.33 \
  --build-arg GEO_TAG=latest \
  --build-arg UI_REF=<Yacd-meta 的 commit sha>
```

`GEO_TAG` 也可以填 meta-rules-dat 里的具体 release 标签,把 GeoIP 库冻结在某个版本。

## 部署步骤

在有 Docker 的机器(NAS / VPS)上,把整个目录传过去,然后:

```bash
bash build.sh
```

或手动分步:

```bash
docker compose build          # 构建一体化镜像
docker compose up -d          # 启动容器
```

> 构建阶段需要访问 GitHub(clone 面板 + 下载 mmdb),NAS 上若直连不通,给 docker build 配代理或走 CI 构建。

## 端口(host 模式,直接监听宿主机)

| 端口 | 用途 |
|------|------|
| 9090 | 内核 API + 内置面板(`/ui`) |
| 7890 | 混合代理端口(HTTP+SOCKS) |

## 使用

1. 浏览器打开 `http://<NAS-IP>:9090/ui`
2. 面板会自动把后端地址推断成 `http://<NAS-IP>:9090`;若没推断出来,手填并补 secret
3. 也可以用 URL 参数直连:`?hostname=<NAS-IP>&port=9090&secret=<secret>&theme=light`

> ⚠️ **务必修改 `config.yaml` 里的 `secret`**,否则任何能访问 9090 端口的人都能控制你的代理。

## 改配置(接入订阅等)

配置全部打包在镜像里,改配置后要重新构建:

```bash
# 1. 编辑根目录 config.yaml,填上你的订阅节点 / proxy-providers / 规则
# 2. 重新构建并重启
docker compose build && docker compose up -d
```

如果你想**把配置挂出来热改**(不改镜像),用 `compose.yaml` 里现成的挂载:

```yaml
volumes:
  - ./config.yaml:/root/.config/mihomo/config.yaml
```

> 只挂 `config.yaml` 这一个文件,`ui/` 和 `country.mmdb` 仍用镜像自带的,不会被遮住。

## 说明

- 面板静态文件与 `country.mmdb` 都打在镜像里,位于容器 `/root/.config/mihomo/` 下(`ui/`、`country.mmdb`)。
- **默认后端已改成随页面 origin 走**:Yacd-meta 原本在 `index.html` 里写死 `data-base-url="http://127.0.0.1:9090"`,远程访问时面板会去连「浏览器自己」的 9090(必然失败)。构建阶段注入了一行内联脚本,在 SPA 启动前把它改成 `location.origin`。本镜像面板与 API 同端口,所以打开 `/ui` 就是对的地址,不用手填。
- **更新面板**:重新 build 即可(clone 最新 gh-pages);**更新 GeoIP 库**:同样重新 build(下载最新 mmdb)。两者都不需要改任何文件。
- `external-ui` 由启动参数 `-ext-ui /root/.config/mihomo/ui` 强制指定,优先级高于 `config.yaml`,所以挂载你自己的配置时面板照样生效。
- 换面板后如果浏览器仍显示旧页面,按一次 `Ctrl+Shift+R` 强制刷新——旧面板注册过 service worker,会缓存 app shell。
- TUN 透明代理已按 NAS 现状开启(`NET_ADMIN` + `/dev/net/tun`)。若 `config.yaml` 里不加 `tun:` 配置块,则不会实际启用 TUN,仅作为普通代理。
