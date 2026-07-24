# RoboPit AI 软件实现方案

## 1. 文档信息

| 项目 | 内容 |
|---|---|
| 文档版本 | V1.0 |
| 对应产品 | FRC 随行模块化工程箱 |
| 部署平台 | ARM64 树莓派 + Raspberry Pi OS 64-bit |
| 使用终端 | 箱体触控屏、手机、平板、笔记本浏览器 |
| 核心原则 | 本地优先、离线可用、软硬件隔离、AI 可替换、结果可追溯 |

---

## 2. 实现目标

软件系统需要完成六件事：

1. 将工具、备件、机器人部件、技术资料和维修历史统一数字化。
2. 在比赛场馆断网时继续提供核心功能。
3. 通过摄像头、二维码和 OCR 快速识别工具及硬件。
4. 通过 AI 和本地知识库提供有引用、分步骤的维修建议。
5. 接入电源、温度、灯光和诊断模块，但不取代独立硬件安全控制。
6. 为队员提供赛程、联盟、任务、战术和 Pit Interview 的统一入口。

MVP 软件不直接承担急停、过流、过温等最终安全责任。树莓派故障时，独立安全控制器仍需能够关闭危险输出。

---

## 3. 总体技术架构

    触控屏 / 手机 / 平板 / 笔记本
                    │ HTTPS / WebSocket
                    ▼
              React PWA 前端
                    │ REST API
                    ▼
             FastAPI 应用服务
    ├─ 用户与权限
    ├─ 工具库存
    ├─ 比赛与战术
    ├─ 机器人、设备与 3D 模型
    ├─ 维修任务
    ├─ 文档知识库
    ├─ AI 助手
    └─ 展示模式
                    │
        ┌───────────┼───────────┐
        ▼           ▼           ▼
    SQLite       文件仓库     后台任务进程
                                │
                    摄像头 / OCR / 文档索引
                                │
                    Hardware Agent 硬件代理
        ┌───────────┼───────────┬───────────┐
        ▼           ▼           ▼           ▼
    Picamera2   串口/USB     SocketCAN   安全控制器
                                        │
                              灯光/传感器/受控输出

### 3.1 服务划分

| 服务 | 主要职责 | 是否必须离线可用 |
|---|---|---:|
| Web UI | 触控及移动端交互、PWA 缓存 | 是 |
| API Service | 业务逻辑、权限、REST、WebSocket | 是 |
| Worker | OCR、文档解析、模型转换、AI 任务 | 是 |
| Hardware Agent | 摄像头、串口、CAN、传感器和安全控制器接入 | 是 |
| Sync Adapter | 赛事、远程协作和云端数据同步 | 否 |
| AI Adapter | 本地或云端模型统一调用 | 部分 |

### 3.2 关键架构决策

- 单机数据库采用 SQLite，减少部署依赖；通过事务、WAL 和定期备份提高可靠性。
- 前端采用 Web/PWA，同一套界面覆盖触控屏和队员手机。
- 后端采用 Python FastAPI，便于复用摄像头、OCR、串口、CAN 和 AI 生态。
- 硬件访问放在独立 Hardware Agent 中，Web API 不直接操作 GPIO。
- MVP 不引入 Redis、Kafka 等额外基础设施；后台任务使用数据库任务表和独立 Worker。
- 实时状态使用 WebSocket；业务写入仍通过 REST API，便于审计和重试。
- AI、OCR、赛事数据源均采用 Adapter 接口，避免绑定单一服务商。

---

## 4. 推荐技术栈

### 4.1 前端

| 项目 | 选择 | 用途 |
|---|---|---|
| 语言 | TypeScript | 降低大型表单和接口字段错误 |
| 框架 | React | 构建触控及移动端统一界面 |
| 构建工具 | Vite | 本地开发和静态资源构建 |
| PWA | Service Worker + Web App Manifest | 离线启动、缓存静态资源 |
| UI | 自建轻量组件层 | 保证大按钮、高对比度和手套操作 |
| 状态管理 | Query Cache + 小型全局状态 | 服务端数据缓存和设备状态同步 |
| 3D | Three.js 或基于其封装的组件 | 展示轻量化 glTF/GLB 模型 |
| 实时通信 | WebSocket | 电源、温度、比赛倒计时和任务状态 |

### 4.2 后端

| 项目 | 选择 | 用途 |
|---|---|---|
| 语言 | Python | 摄像头、OCR、AI 与硬件生态统一 |
| Web 框架 | FastAPI | REST、WebSocket、自动接口文档 |
| ORM | SQLAlchemy | 数据模型、事务和迁移 |
| 数据迁移 | Alembic | 版本升级时修改数据库结构 |
| 数据校验 | Pydantic | API、设备消息和配置校验 |
| 本地数据库 | SQLite | 本地优先、低维护成本 |
| 后台任务 | 独立 Worker + Job 表 | OCR、索引、AI 和文件处理 |
| 日志 | 结构化 JSON 日志 | 本地诊断和问题导出 |

### 4.3 树莓派与硬件接入

| 接口 | 实现建议 |
|---|---|
| CSI 摄像头 | Picamera2 / rpicam 摄像头栈 |
| USB 摄像头 | V4L2 或 OpenCV 采集适配器 |
| 二维码 | 本地二维码解码库，图像失败时允许手工输入 |
| 串口 | pySerial，经隔离诊断板接入 |
| CAN | Linux SocketCAN，诊断板完成隔离与保护 |
| GPIO | libgpiod，仅用于低风险状态和控制信号 |
| NFC | USB 或串口读卡器，通过设备适配器接入 |
| 环境传感器 | 由安全控制器采集后通过结构化协议上报 |
| 灯光 | 软件可调，但保留独立物理按键 |
| 急停 | 只读取状态；切断动作由硬件电路完成 |

### 4.4 OCR 与 AI

- 二维码识别优先于 OCR，团队自有设备优先使用二维码/NFC 建档。
- OCR 通过统一接口调用，可配置本地轻量 OCR 或联网增强 OCR。
- AI 通过 Provider Adapter 接口调用，本地模型和云端模型共享相同输入输出结构。
- 复杂视觉理解可以上传经过用户确认的图片；离线时降级为 OCR、设备库匹配和手动确认。
- 所有 AI 结论必须保存引用来源、置信等级和人工确认状态。

---

## 5. 软件模块设计

### 5.1 账号与权限

角色建议：

| 角色 | 权限 |
|---|---|
| 访客 | 查看公开展示内容 |
| 队员 | 查看比赛、资料和任务，借还工具 |
| 技术成员 | 创建维修任务、上传日志、使用诊断功能 |
| 负责人 | 分配任务、确认可上场状态、发布战术卡片 |
| 管理员 | 管理用户、模块、库存、配置和数据备份 |

实现要求：

- 本地 PIN 或账号登录，不依赖互联网。
- 危险操作不能只依赖普通登录，需要二次确认和硬件许可。
- 所有库存变更、维修关闭、资料发布和硬件命令写入审计日志。
- Pit Interview 只读取已发布的公开资料。

### 5.2 工具、备件与库存

核心能力：

- 工具、耗材、备件和模块建档。
- 仓位、照片、规格、数量、阈值和状态管理。
- 扫码借用、归还、损坏、消耗和补货。
- 赛事装箱模板和出发检查。
- 维修任务关闭时自动扣减已使用备件。
- 工具盘传感器属于增强输入，人工扫码始终可作为降级路径。

关键状态：

    AVAILABLE 可用
    BORROWED 借出
    IN_USE 使用中
    MISSING 缺失
    DAMAGED 损坏
    MAINTENANCE 维护中
    RETIRED 报废

### 5.3 比赛与战术中心

核心能力：

- 在线同步或离线导入赛程。
- 显示下一场比赛、倒计时、红蓝联盟和集合时间。
- 允许负责人手工修正数据，并记录数据来源和更新时间。
- 机器人状态与比赛倒计时联动。
- 创建战术卡片，记录联盟分工、目标、风险和负责人。
- 远程建议进入待确认状态，未经现场负责人确认不自动发布。

机器人出赛状态：

    UNKNOWN 未确认
    INSPECTING 检查中
    REPAIRING 维修中
    BLOCKED 阻塞
    READY 待出赛
    QUEUED 已候场

### 5.4 机器人、设备与 3D 模型

核心能力：

- 管理机器人赛季、版本和子系统。
- 将设备、文档、代码版本、工具和维修记录关联到机器人部位。
- Web 端展示轻量化 GLB/glTF，不直接加载大型 CAD 原始工程文件。
- CAD 原文件在电脑端或后台预处理，生成适合树莓派浏览的轻量模型。
- 支持预设视角、部件高亮和部件信息卡。
- 设备关键电压、引脚和协议字段必须带来源。

### 5.5 维修任务

任务流程：

    OPEN 已创建
      → TRIAGED 已分诊
      → IN_PROGRESS 处理中
      → VERIFYING 验证中
      → RESOLVED 已解决
      → CLOSED 已归档

任务包含：

- 比赛场次、机器人版本、故障现象和优先级。
- 机械、电控、软件子任务及负责人。
- 照片、视频、日志、测量值和 AI 建议。
- 实际根因、解决方式、更换备件和验证结果。
- 是否影响下一场比赛，以及预计完成时间。

### 5.6 文档知识库

导入范围：

- PDF 说明书。
- Markdown 和纯文本。
- 接线图和图片。
- 维修手册。
- 团队内部操作规程。
- 公开的机器人和技术展示资料。

处理流程：

    文件导入
      → 类型与大小检查
      → 文本提取 / OCR
      → 分段
      → 关键词索引
      → 可选向量索引
      → 关联机器人、设备和版本

每个文档保存：

- 来源、版本、更新时间、是否公开。
- 内容校验值，避免重复导入。
- 适用机器人、设备、赛季和软件版本。
- 原文件与索引状态。

### 5.7 AI 工程助手

AI 不直接执行维修，而是生成有依据的下一步建议。

处理流程：

    用户问题 / 照片 / 日志 / 测量结果
                    │
            上下文与安全检查
                    │
       检索设备档案、手册和历史案例
                    │
              生成候选结论
                    │
        结构化校验、引用检查和风险分级
                    │
         显示下一步、预期结果和停止条件
                    │
                用户确认

AI 输出结构：

| 字段 | 说明 |
|---|---|
| summary | 当前判断摘要 |
| evidence | 资料引用和实际测量依据 |
| hypotheses | 候选原因及置信等级 |
| next_step | 建议执行的下一项检查 |
| expected_result | 正常与异常结果分别代表什么 |
| risk_level | LOW、MEDIUM、HIGH、CRITICAL |
| stop_conditions | 出现哪些情况应立即停止 |
| requires_confirmation | 是否需要人工或负责人确认 |

强制规则：

- 无可靠来源时不得把引脚、电压和极性描述为确定事实。
- 高风险建议必须引用资料，并由用户确认。
- 涉及上电、输出切换和执行器动作时，只能生成请求，不能绕过安全控制器。
- AI 原始回答和最终展示结果分别保存，便于追踪安全规则做出的修改。

### 5.8 视觉扫描

设备扫描流程：

1. 拍摄正面、背面和接口特写。
2. 执行图像质量检查：模糊、过曝、反光和裁切。
3. 优先识别二维码、条形码和团队资产标签。
4. OCR 提取厂商、型号、芯片丝印和接口文字。
5. 使用规范化文本匹配本地设备库。
6. 返回 Top-N 候选及匹配依据。
7. 用户确认候选，或创建“未知设备”记录。
8. 进入资料查询、接线检查或维修任务。

MVP 不进行仅凭照片确定未知 PCB 引脚的承诺。

### 5.9 Pit Interview

- 管理公开的团队介绍、机器人亮点、技术架构和演示顺序。
- 支持 3D 模型、图片、短视频和关键指标卡片。
- 支持角色提示、分段计时和常见问题库。
- 展示模式隐藏库存、维修、内部战术和账号信息。
- 对外二维码指向只读公开页面，并设置有效期或版本。

### 5.10 硬件状态与控制

- 展示外部电源、电池、温度、风扇、急停和模块状态。
- 灯光等低风险负载允许软件控制。
- 危险输出需要权限、安全规则、硬件许可和明确确认。
- 所有硬件命令包含 command_id、目标、参数、有效期和请求人。
- Hardware Agent 对重复 command_id 返回已有结果，避免网络重试造成重复执行。
- 命令超时、通信断开或树莓派重启时，危险输出回到断电状态。

---

## 6. 数据模型

### 6.1 主要实体

| 表 | 关键字段 |
|---|---|
| users | id、name、role、pin_hash、status |
| teams | id、name、season |
| robots | id、team_id、name、season、version、status |
| robot_subsystems | id、robot_id、name、model_node_id |
| inventory_items | id、type、name、spec、location_id、quantity、threshold、status |
| inventory_events | id、item_id、action、quantity、user_id、task_id、created_at |
| storage_locations | id、module_id、code、name、sensor_id |
| modules | id、type、version、power_profile、hardware_id、status |
| devices | id、manufacturer、model、voltage、protocols、source_document_id |
| documents | id、name、version、visibility、checksum、path、index_status |
| device_documents | device_id、document_id、relation_type |
| scans | id、image_path、ocr_text、candidates、confirmed_device_id、user_id |
| competitions | id、name、location、start_at、end_at |
| matches | id、competition_id、match_no、scheduled_at、alliance_data、source、updated_at |
| strategy_cards | id、match_id、content、status、author_id、approved_by |
| repair_tasks | id、robot_id、match_id、title、priority、status、owner_id、root_cause |
| task_events | id、task_id、type、payload、user_id、created_at |
| diagnostic_records | id、task_id、interface_type、parameters、data_path、summary |
| telemetry | id、source_id、metric、value、unit、timestamp |
| hardware_commands | id、target、action、parameters、risk_level、status、expires_at |
| audit_logs | id、user_id、action、object_type、object_id、before_data、after_data |
| sync_outbox | id、entity_type、entity_id、operation、payload、status |

### 6.2 数据设计规则

- 所有业务表使用不可复用 ID。
- 业务记录使用软删除，避免误删审计数据。
- 关键记录包含 created_at、updated_at 和版本号。
- 附件存文件系统，数据库保存路径、校验值和元数据。
- 维修、库存和危险操作采用事务写入。
- 时间统一以 UTC 存储，界面按赛事时区显示。
- 同步冲突默认保留双方版本，由负责人处理。

---

## 7. API 设计

### 7.1 REST API 分组

| 路径 | 用途 |
|---|---|
| /api/auth | 登录、退出、当前用户 |
| /api/inventory | 工具、备件、仓位和库存事件 |
| /api/checklists | 装箱与归位检查 |
| /api/robots | 机器人、子系统、版本和出赛状态 |
| /api/devices | 硬件设备档案 |
| /api/documents | 文档上传、搜索和引用 |
| /api/scans | 摄像头扫描、OCR 和候选确认 |
| /api/matches | 赛程、联盟和倒计时 |
| /api/strategies | 战术卡片和审批 |
| /api/repairs | 维修任务和时间线 |
| /api/diagnostics | 诊断会话与数据 |
| /api/hardware | 模块状态和受控命令请求 |
| /api/presentation | Pit Interview 发布内容 |
| /api/system | 健康检查、备份、版本和存储状态 |

### 7.2 WebSocket 事件

| 事件 | 内容 |
|---|---|
| telemetry.updated | 温度、电压、电流、电池和风扇 |
| hardware.state_changed | 模块、急停、输出和故障状态 |
| repair.updated | 维修任务、负责人和机器人状态 |
| match.countdown | 下一场比赛和倒计时 |
| inventory.alert | 缺失、低库存和未归还 |
| job.progress | OCR、文档处理和 AI 任务进度 |
| system.alert | 存储、网络、温度和服务异常 |

### 7.3 错误返回

统一返回：

    {
      "code": "HARDWARE_NOT_ARMED",
      "message": "硬件未进入允许输出状态",
      "details": {},
      "request_id": "..."
    }

前端根据 code 显示明确处理方式，不能只显示“操作失败”。

---

## 8. Hardware Agent 设计

### 8.1 职责

- 发现并维护摄像头、扫码器、串口、CAN 和安全控制器连接。
- 将不同设备转换为统一状态和事件。
- 对硬件命令进行格式校验、去重、超时和重试。
- 缓存短时间遥测，批量写入数据库。
- 与 API 服务进程隔离，设备驱动崩溃不应导致主业务退出。

### 8.2 设备适配器接口

每个适配器实现：

    discover()
    connect()
    get_capabilities()
    read_state()
    execute(command)
    subscribe_events()
    health_check()
    disconnect()

### 8.3 安全控制器通信

建议消息包含：

- 协议版本。
- 设备 ID 和固件版本。
- 消息序号和时间戳。
- 命令 ID、动作、参数和有效期。
- 当前急停、互锁、温度和故障位。
- CRC 或等效完整性校验。

危险命令流程：

    前端确认
      → API 权限与规则校验
      → 生成短有效期命令
      → Hardware Agent 发送
      → 安全控制器检查急停与互锁
      → 执行或拒绝
      → 回传最终状态
      → 写入审计日志

---

## 9. 离线、同步与远程访问

### 9.1 本地优先

以下数据以工程箱本地数据库为运行时事实源：

- 工具和库存。
- 当前机器人状态。
- 维修任务。
- 本地文档。
- 硬件状态和告警。
- 最后一次有效赛程。

### 9.2 同步机制

- 本地变更同时写入业务表和 sync_outbox。
- 联网后同步进程按顺序发送未同步事件。
- 服务端确认后标记成功，不直接删除 outbox。
- 下载的远程变更通过版本号判断冲突。
- 赛事数据保存来源和获取时间，过期时提醒用户确认。

### 9.3 远程访问

- MVP 默认只开放本地局域网。
- 远程技术支持应通过受控 VPN 或中继服务，不直接暴露树莓派端口。
- 外部用户默认只读，且只能访问明确发布的内容。
- 图片、日志和战术信息分别设置可同步范围。

---

## 10. 部署方案

### 10.1 树莓派系统

- 使用 64 位 Raspberry Pi OS。
- 操作系统、应用数据和用户文件分目录管理。
- 摄像头使用官方 Picamera2/rpicam 软件栈。
- 生产环境禁止使用开发服务器直接对外提供服务。

### 10.2 进程布局

建议生产环境使用 systemd 管理：

    robopit-api.service
    robopit-worker.service
    robopit-hardware.service
    robopit-ui.service
    robopit-backup.timer
    robopit-health.timer

开发和 CI 环境可使用容器。若生产环境采用容器，Hardware Agent 建议继续作为宿主机服务，减少 USB、GPIO、摄像头和 SocketCAN 映射复杂度。

### 10.3 启动顺序

1. 操作系统与存储检查。
2. Hardware Agent 启动并读取安全状态。
3. API 与数据库迁移。
4. Worker 启动。
5. Web UI 与本地热点启动。
6. 系统自检并进入“可用”或“降级”状态。

### 10.4 更新与回滚

- 更新包必须有版本、校验值和升级说明。
- 数据库迁移前自动备份。
- 应用保留上一可用版本。
- 更新失败自动回滚，不修改安全控制器固件。
- 安全控制器固件使用单独流程和物理确认。

---

## 11. 文件和代码结构

    robopit/
    ├─ apps/
    │  ├─ web/                 React PWA
    │  ├─ api/                 FastAPI 应用
    │  ├─ worker/              OCR、索引和 AI 后台任务
    │  └─ hardware_agent/      硬件设备适配器
    ├─ packages/
    │  ├─ api_contracts/       前后端共享接口定义
    │  ├─ domain/              领域模型与业务规则
    │  ├─ safety_rules/        风险分级和控制规则
    │  └─ ui/                  通用 UI 组件
    ├─ migrations/             数据库迁移
    ├─ configs/                环境和模块配置模板
    ├─ deploy/
    │  ├─ systemd/
    │  ├─ docker/
    │  └─ raspberrypi/
    ├─ tests/
    │  ├─ unit/
    │  ├─ integration/
    │  ├─ hardware_sim/
    │  └─ e2e/
    ├─ docs/
    └─ scripts/

硬件模拟器与真实 Hardware Agent 使用相同协议，使大部分开发可以在普通电脑上完成。

---

## 12. 测试方案

### 12.1 单元测试

- 库存数量和状态转换。
- 比赛倒计时与时区。
- 维修任务状态机。
- 权限和危险操作规则。
- AI 输出结构与引用校验。
- 同步冲突和重试。

### 12.2 集成测试

- API 与 SQLite 事务。
- Worker 处理失败和恢复。
- 摄像头拍照、OCR 和设备匹配。
- Hardware Agent 断线、重连、超时和重复命令。
- WebSocket 重连与状态补发。
- 非正常断电后的数据库恢复。

### 12.3 端到端场景

1. 赛前扫码检查并发现缺失工具。
2. 工程箱断网后继续创建维修任务和查询资料。
3. 扫描设备并确认候选型号。
4. AI 使用本地手册生成带引用的排障步骤。
5. 负责人确认机器人可上场，首页同步更新。
6. 急停触发后危险命令被拒绝。
7. 树莓派重启后危险输出不自动恢复。
8. 切换到 Pit Interview 时内部信息不可见。

### 12.4 性能目标

| 项目 | 目标 |
|---|---|
| 本地首页首次加载 | 不超过 2 秒 |
| 普通 API P95 | 不超过 300 ms |
| 本地文档搜索 | 不超过 3 秒 |
| 二维码识别 | 常规条件下不超过 2 秒 |
| WebSocket 状态更新 | 局域网内不超过 1 秒 |
| 同时在线终端 | 至少 10 台 |
| 非 AI 功能启动 | 开机后 3 分钟内可访问 |

---

## 13. 安全、隐私与可靠性

- 密码和 PIN 只保存安全哈希。
- API 密钥放在服务端密钥存储或受限配置中，不进入前端。
- 默认不记录不必要的人脸和访客信息。
- 摄像头开启时提供可见指示。
- 上传云端前显示文件范围并允许用户取消。
- 高风险硬件请求必须包含请求人、设备、参数、理由和结果。
- 审计日志只能追加，管理员更正通过新增事件实现。
- 每日自动备份数据库与配置，维修任务关闭时触发增量备份。
- 存储空间不足、数据库异常和备份失败必须在首页报警。

---

## 14. 分阶段开发计划

以 2～4 名软件成员并行开发估算，具体周期需根据硬件到位时间调整。

### 阶段 0：技术验证，1～2 周

- 树莓派系统镜像、触控屏和本地热点。
- FastAPI、React 和 SQLite 最小闭环。
- Picamera2 拍照与二维码识别。
- Hardware Agent 模拟器。
- 非正常断电和自动启动验证。

AI 摄像头识别的详细范围、接口、数据表、算法流水线与验收标准见《第一阶段_AI摄像头硬件识别开发文档.md》。

退出条件：树莓派开机后可通过手机访问页面、拍照、保存记录并在断网状态工作。

### 阶段 1：基础平台，2 周

- 用户、角色和审计日志。
- 工具、备件、仓位和模块档案。
- 扫码借还与装箱清单。
- 系统健康页、备份和恢复。

退出条件：完成一次完整赛前物资检查。

### 阶段 2：比赛与维修，2～3 周

- 赛程、联盟、倒计时和手工导入。
- 机器人状态和维修任务。
- 多终端 WebSocket 更新。
- 战术卡片与现场确认。

退出条件：模拟两场比赛间的维修和候场流程。

### 阶段 3：资料、3D 与展示，2～3 周

- 文档导入、全文搜索和关联。
- 轻量化 GLB 模型查看。
- 机器人部件信息卡。
- Pit Interview 展示和公开页面。

退出条件：离线完成资料查询与 5 分钟技术展示。

### 阶段 4：视觉与 AI，3～4 周

- 图像质量检查、OCR 和设备候选匹配。
- 本地知识检索。
- AI Provider Adapter。
- 带引用的分步排障与风险分级。
- AI 降级和错误处理。

退出条件：完成预设电控故障的辅助排查，关键结论均可追溯。

### 阶段 5：硬件联调，2～4 周

- 安全控制器协议。
- 温度、电源、急停和灯光状态。
- UART/CAN 诊断适配器。
- 命令去重、超时和安全状态机。
- 树莓派故障与通信断开测试。

退出条件：硬件急停在软件失效时仍有效，危险输出重启后保持关闭。

### 阶段 6：FRC 场景验证，1 个训练或赛事周期

- 全流程压力测试。
- 多人同时操作。
- 网络拥塞和断网。
- 工具丢失、维修超时、比赛信息变更等异常演练。
- 根据真实使用数据调整界面、流程和性能。

---

## 15. MVP 开发优先级

### P0：必须完成

1. 本地 Web/PWA、账号和角色。
2. 工具库存、扫码、仓位和装箱检查。
3. 比赛看板、机器人状态和维修任务。
4. 本地文档库和全文搜索。
5. 摄像头拍照、二维码和基础 OCR。
6. 设备候选确认和维修记录。
7. Hardware Agent、温度、电源和急停状态读取。
8. 审计日志、备份、恢复和系统健康页。
9. 断网运行和重启恢复。
10. Pit Interview 只读展示模式。

### P1：首个正式版本

1. AI 带引用问答和分步排障。
2. 3D 模型部件关联。
3. UART/CAN 隔离诊断。
4. NFC、工具盘传感器。
5. 战术卡片和远程技术支持。
6. 在线赛事同步和多设备同步。
7. 软件控制灯光与环境模式。

### P2：增强功能

1. 工具盘视觉盘点。
2. 自动协议候选识别。
3. 语音交互。
4. 多摄像头维修记录。
5. 本地大模型或专用 AI 加速。
6. 跨赛季知识分析和预测性补货。

---

## 16. 第一轮迭代任务拆分

| 任务 | 负责人方向 | 交付物 |
|---|---|---|
| 建立 Monorepo 与 CI | 软件基础设施 | 前端、API、Worker、Hardware Agent 可独立运行 |
| 设计数据库 V1 | 后端 | 迁移文件、种子数据和 ER 说明 |
| 实现 PWA 框架 | 前端 | 首页、导航、离线壳和触控组件 |
| 实现库存闭环 | 前后端 | 建档、仓位、扫码、借还、装箱 |
| 实现摄像头 PoC | 视觉 | 拍照、二维码、图像保存、质量检测 |
| 实现硬件模拟器 | 嵌入式/后端 | 温度、电源、急停和模块事件模拟 |
| 实现 Hardware Agent | 嵌入式/后端 | 设备发现、状态读取、断线重连 |
| 实现系统健康页 | 后端/前端 | 服务、温度、存储、网络和备份状态 |
| 建立测试基线 | 全员 | 单元、集成、E2E 和断电恢复测试 |

第一轮结束时，应能演示：

    开机
      → 手机连接本地热点
      → 登录
      → 扫码检查工具
      → 摄像头识别资产二维码
      → 查看模拟温度与急停状态
      → 断网继续工作
      → 重启后数据仍然存在

---

## 17. 需要在开发前确认的问题

1. 树莓派具体型号、内存和存储方案。
2. 触控屏分辨率、横竖屏方向和安装方式。
3. 摄像头数量、接口类型和实际拍摄距离。
4. 安全控制器由哪种 MCU 实现，通信使用 USB 串口还是 CAN。
5. 首版必须接入哪些真实传感器和输出。
6. 赛程数据使用人工导入、官方接口还是两者兼有。
7. 团队是否允许将图片、日志和资料上传云端 AI。
8. 3D 模型原始格式、大小和脱敏要求。
9. 远程支持是否需要首版实现。
10. 首次整机联调和 FRC 场景演练日期。

---

## 18. 技术依据

- Raspberry Pi 官方摄像头软件使用 rpicam/libcamera，Python 应用可通过 Picamera2 接入：
  https://www.raspberrypi.com/documentation/computers/camera_software.html
- FastAPI 官方部署文档用于规划生产进程、启动和服务管理：
  https://fastapi.tiangolo.com/deployment/
- SQLite WAL 设计参考：
  https://www.sqlite.org/wal.html
- 如使用容器，Docker 官方 Debian 安装说明列出了 ARM64 支持和网络安全注意事项：
  https://docs.docker.com/engine/install/debian/
