# 项目文档

- [功能实现链路](./FEATURE_IMPLEMENTATION_GUIDE.md)：按功能查看前端页面、API/Socket、后端处理器和存储模型的对应关系。
- [小带宽实时通信方案](./LOW_BANDWIDTH_REALTIME.md)：消息可靠性、在线状态、媒体限速和监控的实现与边界。
- [邮箱验证配置](./EMAIL_VERIFICATION.md)：QQ 邮箱 SMTP 配置、验证码规则和上线检查。
- [七牛 CDN 与证书自动同步](./QINIU_CDN_CERTIFICATE_AUTOMATION.md)：从 AliDNS、Caddy、七牛 CDN 首次接入到证书自动续期和故障排查的完整步骤。
- [环境变量管理规范](./ENVIRONMENT_VARIABLES.md)：本地、测试、Docker 和生产环境的配置归属、加载、校验及密钥管理规则。
- [本地启动](../STARTUP.md) 与 [生产部署](../DEPLOYMENT.md)。

`plans/` 和 `superpowers/` 下是设计与实施过程记录；排查当前功能时以[功能实现链路](./FEATURE_IMPLEMENTATION_GUIDE.md)及其链接的源码为准。
