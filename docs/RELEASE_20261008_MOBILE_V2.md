# 手机端 V2 / 底栏对齐发布验收

日期：2026-10-08（Asia/Shanghai）。

## 结果与范围

- 已发布至 https://gpu-erp.cdgpu.cn ，发布标识：`22bf640-mobile-v2-20261008-113528`。
- 只更新前端 `dist/`，包括当前手机端工作台、导航、质检入库及底栏对齐修复；不替换后端产物，不执行数据库迁移、生产业务写入、Git 提交或推送。
- 分支 `codex/frontend-v2`、基础提交 `22bf640`，工作树包含已审查的未提交改动；发布以135份新构建文件的SHA-256清单追踪，不宣称是干净提交发布。
- 本次用户明确授权“跳过异地备份”，仅豁免 `OFFSITE_BACKUP_TARGET` 门禁。未伪造异地目标或修改生产环境配置；预检的这项失败保留为已授权例外，其他项目通过。

## 构建与本地验证

- 本地完整构建通过；生产机未执行 npm ci、Vite 或 esbuild。
- 复用紧接本次发布前的同一源代码验收：lint通过；1441项测试，1404通过、0失败、37项独立数据库测试跳过；19项导航/响应式定向回归通过。
- 本次重新构建后仍得到同一入口、CSS与后端校验和。
- 本地320/390/430手机宽度及768/1440断点验证；线上只对390×844手机视口做实际登录只读验收，不将本地矩阵伪称为全宽度生产真机测试。

## 备份、暂存与切换

- 新本机备份：`/home/ubuntu/gpu-erp-backups/gpu_erp_release_22bf640-mobile-v2-20261008-113528.dump`。
- 大小2793992字节，SHA-256：`446d4045f01fdd35d67aa6fc3e9eaa18115c4b6b9fa1b1c4eb91b68f9d171ccc`。
- `pg_restore --list`验证通过；未删除任何历史备份。这不是完整恢复演练或异地灾备证明。
- 暂存目录：`/home/ubuntu/gpu-erp-releases/22bf640-mobile-v2-20261008-113528`；校验清单、范围与豁免记录保存在 `SHA256SUMS`、`release.json`。
- 暂存135份文件全部校验通过；独立本机HTTP灰度确认首页、入口及依赖、CSS、质检页面资源可访问，构建CSS确实包含统一居中规则。
- 为已经打开的页面保留旧的哈希资源，不覆盖新文件；旧入口 `index-BA17-eL8.js` 上线后公网仍200。
- 使用Linux `renameat2(RENAME_EXCHANGE)` 原子交换前端目录，保留完整旧版：
  `/home/ubuntu/gpu-erp-releases/live-before-22bf640-mobile-v2-20261008-113528/dist`。
- 旧HTML SHA-256：`516862c619725b9d8652fa583407c9764a502cb6f14138d82b57d1a253377afd`。
- 只重启 `gpu-erp-api`，仍为single-instance/fork；其他PM2应用未重启。新服务启动初次探针连接拒绝后，重试即通过；最终 `/api/ready` 为ok，revision1510。

## 线上验证

- 新HTML SHA-256：`f50318ed696bc6ede79cfd4eac870821a47535448211c4dbb4d7caeeb5089c47`。
- 新入口：`/assets/index-CcGbJAZn.js`，SHA-256 `707fdfaf2b64adc3688caa941b94f7d8c2f963bfebd9403772ca5ea4cb556885`。
- 新CSS：`/assets/index-DkiMPQOO.css`，SHA-256 `b844c765af915e751fd1c28f95e6b9e5c4733accf43697d2c9bfdc359bb595bd`。
- 后端 `index.mjs` 仍为 `90b72996c0dc422e17bc8673ce988c63cd00599cf631b1ae50160650be19bd09`；
  `daily-report.mjs` 仍为 `985935f21d136c70cc2c764729dfb522531e970812769129d69f2b1f453f822a`，与发布前及本地完全一致。
- 公网首页、质检路由、新入口和CSS返回200，校验和与本地相同；入口gzip响应通过。
- 公网冒烟：health/ready为200，匿名state为401。
- 使用现有登录会话在独立生产验收Tab打开质检页：真实队列可读，新移动呈现生效；未填写或提交业务表单，未操作用户原生产Tab。
- 390px下普通质检页与“我的”展开状态均测量：底栏x=0、宽390、高60；五个点击区约74.8px宽、高51px；图标与文字相对所在点击区中心误差小于0.01px。页面实际加载上述新入口及CSS。
- 浏览器验收期间控制台error记录为空；临时Tab和尺寸覆盖已清理。
- 线上聚焦截图：`docs/mobile-v2-evidence/production-nav-22bf640-mobile-v2-20261008-113528.jpg`（390×60，只包含导航，不含客户、金额或账号信息）。

## 已知边界

- Nginx既有 `conflicting server name "_" on 0.0.0.0:5173` 警告仍在；语法检查和reload成功，本次未变更配置。
- 错误日志混有无时间戳的历史慢请求、AI建议降级和客户端status0记录，不能据此精确判定发生时间；末尾包含本次匿名冒烟预期401。未将这些日志宣称为全系统已修复，也未发现验收浏览器的新运行错误。
- 未进行真实入库/资金写入、普通账号权限全矩阵、iOS/Android真机安全区或软键盘验收；这次是前端发布验收，不是业务、性能或灾备全量认证。
