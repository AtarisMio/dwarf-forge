# Cloudflare 部署

[Dwarf Forge 在线站点](https://dwarf-forge.gizeta.eu.org/) 使用 Cloudflare Workers 静态资源托管。仓库配置对应当前公共站点；部署自己的副本前必须修改 Worker 名称和域名。

## 部署自己的副本

1. 安装 Node.js 22.12 或更高版本，在仓库根目录执行 `npm ci`。
2. 编辑 `wrangler.jsonc`，将 `name` 改为自己的 Worker 名称。将 `routes[].pattern` 改为自己在 Cloudflare 管理的域名；若只使用自动生成的 `workers.dev` 地址，删除整个 `routes` 字段并保留 `workers_dev: true`。
3. 使用自己的 Cloudflare 账户登录并部署：

```sh
npx --yes wrangler@4.149.0 login
npx --yes wrangler@4.149.0 deploy
```

配置的 `build.command` 会执行 `npm run build`，随后发布 `dist/`。配置未固定账户 ID；如果账户选择不唯一，按 Wrangler 提示选择自己的账户，或在本地配置自己的账户 ID，不必提交到仓库。自定义域名需要当前账户拥有相应区域的管理权限。

部署后打开自己的域名，检查首页、静态资源、WebGL 工坊和本地存档。浏览器存档按域名隔离，更换域名不会自动迁移原站点的进度。

## 控制台上传

也可先执行 `npm run build`，在自己的 Cloudflare Workers 控制台创建或更新静态资源 Worker，上传 `dist/` 的内容。`index.html`、`assets/` 和 `art/` 应处于上传根目录，再在 Worker 设置中绑定自己的域名。

## CI 与凭据

GitHub Actions 仅执行 `npm ci`、`npm test` 和 `npm run build`，没有自动部署步骤，也不需要 Cloudflare secrets。账户密码、验证码和访问令牌不应写入源码或构建产物。
