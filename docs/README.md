# PIT-OS 文档

## 工程文档

- [系统架构](architecture.md)：运行时组件、数据流、状态所有权、安全边界与部署形态。
- [Home Assistant 迁移方案](home-assistant-migration.md)：设备准备、实体映射、旁路验证、切换与回退。
- [项目洞察](project-insights.md)：当前实现成熟度、关键发现、风险与建议路线图。
- [开发规范](development.md)：目录职责、开发命令、配置管理与提交检查。

## 产品资料

`product/` 保存立项与方案阶段的原始基线。这些文档描述的目标范围大于当前代码实现，
应作为产品愿景和需求来源，而不是当前功能清单。

- [产品需求文档](product/product-requirements.md)
- [软件实现方案](product/software-implementation-plan.md)
- [第一阶段 AI 摄像头硬件识别方案](product/ai-camera-phase-one.md)

## 邻近文档

- [硬件部署与接线](../hardware/README.md)：与固件和边缘脚本放在一起，便于同步维护。
- [环境变量模板](../.env.example)：可部署配置项的唯一示例。
- [项目入口](../README.md)：安装、启动、验证与仓库概览。
