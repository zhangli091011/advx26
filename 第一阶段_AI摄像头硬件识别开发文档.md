# 第一阶段：AI 摄像头硬件信息识别开发文档

## 1. 文档信息

| 项目 | 内容 |
|---|---|
| 项目 | RoboPit AI 摄像头硬件识别 |
| 阶段 | Phase 1 / MVP |
| 文档版本 | V1.0 |
| 运行平台 | ARM64 树莓派、Raspberry Pi OS 64-bit |
| 输入 | 硬件照片、二维码/条形码、用户补充信息 |
| 输出 | 候选硬件、可追溯的基本信息、识别依据、置信度 |
| 预计周期 | 4～6 周 |

---

## 2. 阶段目标

第一阶段实现以下完整闭环：

    摄像头预览
      → 拍摄硬件正反面
      → 图像质量检测
      → 二维码/条形码识别
      → OCR 提取型号、丝印和接口文字
      → 本地设备库匹配
      → 返回 Top-3 候选
      → 用户确认或创建未知设备
      → 展示有资料来源的硬件信息

### 2.1 用户价值

- 将团队常用控制器、传感器、驱动器和转换板快速数字化。
- 减少手工搜索型号、手册、接线图和协议资料的时间。
- 为后续 AI 排障提供确定的设备上下文。
- 通过人工确认持续积累团队自己的硬件识别库。

### 2.2 第一阶段成功条件

1. 在触控屏或手机上完成拍摄和确认流程。
2. 能识别团队资产二维码和常见一维条形码。
3. 能提取硬件表面的型号、厂商、芯片丝印和接口文字。
4. 对已录入设备返回 Top-3 候选及匹配依据。
5. 用户确认后展示设备资料库中的电压、协议、接口、手册和接线图。
6. 断网时仍可完成拍照、OCR、匹配、确认和本地资料查询。
7. 所有识别结果和用户修正均可追溯。

---

## 3. 功能边界

### 3.1 本阶段包含

- 单个硬件的正面、背面和局部特写拍摄。
- 自动对焦、曝光稳定和补光控制。
- 模糊、过曝、反光和主体过小检测。
- QR Code 和常见一维条形码识别。
- 英文、数字和常见符号 OCR。
- 厂商、型号、芯片丝印、接口标签等字段提取。
- 本地设备库候选匹配。
- 识别结果人工确认、修正和保存。
- 设备资料展示及原始文档跳转。
- 未知设备建档。
- 扫描记录、识别耗时和错误日志。

### 3.2 本阶段不包含

- 仅凭照片确定未知 PCB 的完整原理图。
- 仅凭接口外形确定真实电压、极性和引脚定义。
- 对任意硬件保证唯一正确识别。
- 自动接通电源或进行电气测量。
- 自动逆向未知通信协议。
- 对严重遮挡、烧毁或无任何文字的电路板保证识别。
- 训练大规模通用视觉基础模型。

### 3.3 安全原则

识别结果分为两类：

| 类型 | 示例 | 展示方式 |
|---|---|---|
| 观察结果 | OCR 读到 REV、SPARK MAX、CAN 等文字 | 显示原图位置和 OCR 置信度 |
| 资料库事实 | 额定电压、接口定义、协议、接线图 | 必须关联设备档案和资料来源 |

AI 推测不得作为资料库事实保存。用户确认型号后，系统只能展示该型号档案中已有且有来源的信息。

---

## 4. 目标识别对象

### 4.1 P0 对象

- FRC 团队常用控制器。
- 电机控制器。
- 传感器与编码器。
- 电源分配、保护和转换模块。
- USB、CAN、UART、RS485 转接板。
- 团队自制 PCB。
- 带团队资产二维码的工具和模块。

### 4.2 对象分类

    MOTOR_CONTROLLER
    ROBOT_CONTROLLER
    POWER_MODULE
    SENSOR
    ENCODER
    CAMERA
    NETWORK_DEVICE
    COMMUNICATION_ADAPTER
    CUSTOM_PCB
    TOOL
    UNKNOWN

### 4.3 识别字段

| 字段 | 来源 | 是否允许推测 |
|---|---|---:|
| 资产编号 | 二维码/条形码 | 否 |
| 厂商 | OCR、Logo 候选、设备库 | 可以作为候选，需确认 |
| 产品型号 | OCR、二维码、设备库 | 可以作为候选，需确认 |
| 产品类别 | 用户选择或候选模型 | 可以，需确认 |
| PCB 版本 | OCR 丝印 | 可以，保存原始文字 |
| 芯片丝印 | OCR 局部特写 | 可以，保存原始文字 |
| 接口标签 | OCR | 可以，不能等同真实引脚 |
| 通信协议 | 已确认设备档案 | 不允许仅靠外观确定 |
| 额定电压 | 已确认设备档案 | 不允许仅靠外观确定 |
| 引脚图 | 已确认文档 | 不允许生成无来源引脚图 |
| 手册和接线图 | 本地文档库 | 否 |

---

## 5. 硬件与拍摄工位要求

### 5.1 摄像头

- 使用树莓派 CSI 摄像头或兼容 USB 摄像头。
- 软件通过 Camera Adapter 屏蔽具体摄像头差异。
- 优先支持自动对焦；若使用定焦摄像头，工位必须限定拍摄高度。
- 建议实际有效分辨率不低于 1920 × 1080，详细丝印拍摄使用更高分辨率静态照片。
- 摄像头支架应能固定俯拍，也能调整角度拍摄接口。

### 5.2 识别区域

- 使用哑光灰色或黑色背景，减少高反射 PCB 和金属表面的干扰。
- 设置硬件放置轮廓和推荐拍摄区域。
- 在背景四角放置定位标记，用于透视矫正和尺寸参考。
- 设置独立的正面、背面和局部接口拍摄指引。
- 背景板应易于更换和清洁。

### 5.3 补光

- 使用左右或环形漫射补光，避免单点强光。
- 支持至少关闭、低亮、标准和高亮四档。
- 补光亮度和曝光在拍摄前稳定。
- 对金属屏蔽罩、亮面标签等强反光目标，允许用户切换斜向补光。
- 可选偏振片作为后续抗反光增强，不作为 MVP 必需条件。

### 5.4 物理操作

- 箱体提供“拍摄”物理按键或脚踏输入接口。
- 拍摄状态通过 LED 显示：预览、正在拍摄、处理中、失败、完成。
- 摄像头开启时必须有明显指示。
- 拍摄过程中不控制任何危险电源输出。

---

## 6. 技术架构

    浏览器扫描页面
          │ REST / WebSocket
          ▼
      Scan API Service
          │
          ├─ 创建扫描会话
          ├─ 请求拍照
          ├─ 获取进度
          └─ 确认候选
          │
          ▼
      Vision Worker
    ├─ 图像质量检测
    ├─ 几何校正与预处理
    ├─ QR/条形码识别
    ├─ OCR Adapter
    ├─ 文本实体提取
    └─ Device Matcher
          │
          ├─ SQLite 设备库
          ├─ 本地图像文件
          └─ 文档知识库
          │
          ▼
      Hardware Agent
          │
      Camera Adapter
    ├─ Picamera2
    └─ USB/V4L2

### 6.1 服务职责

| 组件 | 职责 |
|---|---|
| Scan UI | 预览、拍摄引导、结果展示和人工确认 |
| Scan API | 会话、权限、任务调度和结果查询 |
| Vision Worker | 执行耗时图像处理和识别 |
| Camera Adapter | 统一 Picamera2 与 USB 摄像头接口 |
| Quality Analyzer | 判断照片是否适合识别 |
| Barcode Adapter | QR Code 和条形码识别 |
| OCR Adapter | 本地 OCR 及未来云端 OCR |
| Entity Extractor | 提取厂商、型号、版本和接口文字 |
| Device Matcher | 设备库检索、打分和候选排序 |
| Device Repository | 设备、别名、文档和已确认样本 |

### 6.2 为什么不直接使用单一图像分类模型

- 团队实际设备种类有限，但型号外观相似、版本变化频繁。
- 二维码和型号文字比纯外观特征更容易解释和维护。
- 纯分类模型难以给出协议、引脚和电压的可靠来源。
- 新设备出现时，设备库可以立即更新，不必等待重新训练模型。
- 第一阶段先建立高质量扫描数据，后续再评估是否训练外观检索模型。

---

## 7. 识别处理流水线

### 7.1 扫描会话

一次 scan_session 至少包括：

- 正面图 front。
- 背面图 back。
- 可选局部图 detail。
- 摄像头参数。
- 图像质量结果。
- 二维码和 OCR 结果。
- 候选设备。
- 用户最终确认。

会话状态：

    CREATED
      → CAPTURING
      → QUALITY_CHECK
      → PROCESSING
      → NEEDS_RETAKE / NEEDS_CONFIRMATION
      → CONFIRMED / UNKNOWN
      → COMPLETED

### 7.2 图像采集

1. 打开预览流。
2. 等待自动曝光和白平衡稳定。
3. 用户将目标放入引导框。
4. 采集低分辨率预览帧进行质量提示。
5. 用户触发拍摄。
6. 获取高分辨率静态图。
7. 保存原图和摄像头元数据。
8. 将识别任务写入 Job 表。

Camera Adapter 接口：

    class CameraAdapter:
        list_cameras()
        open(camera_id)
        start_preview()
        get_preview_frame()
        capture_still(settings)
        set_focus(value)
        set_exposure(value)
        health_check()
        close()

### 7.3 图像质量检测

检测项：

| 检测 | 方法建议 | 不通过处理 |
|---|---|---|
| 模糊 | 拉普拉斯方差或等效清晰度指标 | 提示稳定设备、重新对焦 |
| 过曝 | 高亮像素占比 | 降低补光或曝光 |
| 欠曝 | 暗部像素占比 | 增加补光或曝光 |
| 反光 | 连续高亮区域比例 | 改变灯光或硬件角度 |
| 主体过小 | 前景占画面比例 | 提示靠近或使用局部拍摄 |
| 主体越界 | 引导框和定位标记 | 提示重新摆放 |
| 透视过大 | 背景定位标记几何关系 | 调整摄像头或自动矫正 |

质量结果：

    {
      "accepted": false,
      "score": 0.61,
      "issues": [
        {"code": "GLARE_HIGH", "region": [x, y, w, h]},
        {"code": "TEXT_TOO_SMALL"}
      ],
      "recommended_action": "切换斜向补光并拍摄型号区域特写"
    }

阈值不能硬编码在算法中，应放入 camera_profile 配置，并通过真实数据标定。

### 7.4 图像预处理

处理顺序建议：

1. 读取相机标定参数，进行镜头畸变修正。
2. 使用背景定位标记进行透视矫正。
3. 保留原始彩色图，同时生成灰度和对比度增强版本。
4. 对不同区域生成原图、增强图、二值图和旋转版本。
5. 限制最大处理分辨率，局部区域使用原始高分辨率。
6. 每种预处理结果记录参数，方便复现误识别。

不建议对整张 PCB 只使用一种强二值化方法，因为不同颜色丝印、反光和阴影可能导致文字丢失。

### 7.5 二维码和条形码

识别优先级：

1. 团队资产 QR Code。
2. 厂商产品二维码。
3. 一维条形码。
4. OCR。

团队资产二维码内容建议只保存稳定标识：

    robopit://asset/DEV-000123

详细设备信息从本地数据库读取，不将易变参数写死在二维码中。

二维码命中团队资产后：

- 直接返回唯一候选。
- 仍保存当前照片用于状态和外观记录。
- 若二维码与人工选择设备不一致，必须提示冲突。

### 7.6 OCR

MVP OCR 策略：

- 默认识别英文、数字和常见符号。
- 对 PCB 丝印使用短文本模式和多角度识别。
- 正面、背面和局部图分别识别。
- 保留每个文本框、原始文字、规范化文字和置信度。
- 第一版使用 Tesseract 作为基线；若树莓派实测精度不足，再评估 PaddleOCR ARM 部署或云端增强。
- OCR Adapter 不向业务层暴露具体引擎字段。

OCR Adapter 接口：

    class OCRAdapter:
        recognize(image, language, profile) -> OCRResult

    OCRResult:
        engine
        engine_version
        duration_ms
        blocks[]

    OCRBlock:
        text
        normalized_text
        confidence
        polygon
        source_image_variant

### 7.7 文本规范化

规范化步骤：

- Unicode 标准化。
- 转为大写用于匹配，同时保存原始文字。
- 合并被错误分开的产品编号。
- 清理多余空格和不合理标点。
- 对连字符、斜杠和点号生成别名。
- 根据字段上下文处理 O/0、I/1、S/5 等混淆。
- 不直接覆盖原始 OCR 结果。

示例：

    原始：SPARK  MAX
    规范：SPARK MAX

    原始：REV-11-2158
    候选别名：REV 11 2158、REV-11-2158、112158

### 7.8 实体提取

实体类型：

    MANUFACTURER
    MODEL
    PART_NUMBER
    REVISION
    CHIP_MARKING
    INTERFACE_LABEL
    VOLTAGE_TEXT
    SERIAL_NUMBER
    ASSET_ID

第一阶段使用：

- 厂商词典。
- 产品型号和别名表。
- 正则表达式。
- 设备库倒排索引。
- 可选轻量语言模型只做候选补充。

电压文字即使被 OCR 识别，也只作为观察结果，不自动写入设备额定电压字段。

### 7.9 设备候选匹配

候选评分建议：

| 信号 | 权重建议 |
|---|---:|
| 团队资产二维码精确命中 | 1.00，直接唯一候选 |
| 厂商二维码/产品编号精确命中 | 0.90 |
| 型号文本精确匹配 | 0.55 |
| 型号别名或模糊匹配 | 0.35 |
| 厂商文本匹配 | 0.15 |
| PCB 版本匹配 | 0.10 |
| 接口标签组合匹配 | 0.10 |
| 已确认外观特征相似度 | P1 再加入 |

最终得分应归一化，并返回解释：

    {
      "device_id": "DEV-REV-SPARK-MAX",
      "score": 0.91,
      "reasons": [
        {"type": "MODEL_EXACT", "evidence": "SPARK MAX"},
        {"type": "MANUFACTURER_MATCH", "evidence": "REV ROBOTICS"},
        {"type": "PART_NUMBER_MATCH", "evidence": "REV-11-2158"}
      ]
    }

候选规则：

- 资产二维码精确命中：可以默认选中，仍需用户确认当前对象。
- 第一名高于确认阈值：突出显示，但不自动保存为确定结果。
- 第一、第二名差距过小：提示拍摄型号或背面特写。
- 所有候选低于未知阈值：进入未知设备流程。
- 阈值由验证集确定，不在开发文档中假设固定数值。

---

## 8. 设备资料库

### 8.1 数据来源

- 厂商官方说明书和产品页面。
- 团队已确认的硬件记录。
- 团队接线图和维护文档。
- 资产标签。
- 用户对扫描结果的人工确认。

关键参数不从搜索摘要或无来源 AI 回答直接写入资料库。

### 8.2 数据表

#### hardware_devices

| 字段 | 类型 | 说明 |
|---|---|---|
| id | UUID/Text | 稳定设备 ID |
| manufacturer | Text | 厂商 |
| model | Text | 正式型号 |
| category | Text | 设备类别 |
| part_number | Text | 产品编号 |
| revision | Text | 版本 |
| voltage_summary | Text | 由资料库维护的供电摘要 |
| protocols_json | JSON | 已确认协议 |
| interface_summary | Text | 接口摘要 |
| primary_document_id | Text | 主要资料来源 |
| status | Text | ACTIVE/DEPRECATED/UNKNOWN |
| created_at | DateTime | 创建时间 |
| updated_at | DateTime | 更新时间 |

#### device_aliases

| 字段 | 说明 |
|---|---|
| device_id | 关联设备 |
| alias_type | MANUFACTURER/MODEL/PART_NUMBER/OCR_VARIANT |
| alias_text | 原始别名 |
| normalized_text | 用于匹配的规范文本 |
| source | MANUAL/CONFIRMED_SCAN/DOCUMENT |

#### scan_sessions

| 字段 | 说明 |
|---|---|
| id | 扫描会话 ID |
| status | 会话状态 |
| user_id | 操作人 |
| camera_id | 摄像头 |
| confirmed_device_id | 最终确认设备 |
| result_type | CONFIRMED/UNKNOWN/CANCELLED |
| started_at | 开始时间 |
| completed_at | 完成时间 |

#### scan_images

| 字段 | 说明 |
|---|---|
| id | 图片 ID |
| session_id | 会话 |
| view_type | FRONT/BACK/DETAIL |
| original_path | 原图路径 |
| preview_path | 预览路径 |
| checksum | 内容校验值 |
| metadata_json | 曝光、焦距、尺寸等 |
| quality_json | 图像质量结果 |

#### ocr_blocks

保存文字、坐标、置信度、OCR 引擎、预处理版本和源图片。

#### scan_candidates

保存候选设备、总分、各项证据和排序。

#### scan_confirmations

保存用户选择、修正字段、确认时间和备注。

### 8.3 图片存储

目录建议：

    data/
    ├─ scans/
    │  └─ 2026/
    │     └─ 07/
    │        └─ session-id/
    │           ├─ front-original.jpg
    │           ├─ front-preview.webp
    │           ├─ back-original.jpg
    │           └─ detail-001-original.jpg
    ├─ device_reference/
    └─ quarantine/

- 原图只读保存。
- 派生图可重新生成。
- 数据库保存校验值，检测重复和损坏。
- 删除扫描需要管理员权限，并保留审计事件。

---

## 9. API 设计

### 9.1 创建扫描会话

    POST /api/scans

请求：

    {
      "target_type": "HARDWARE",
      "robot_id": "ROBOT-2026",
      "task_id": null
    }

响应：

    {
      "id": "SCAN-...",
      "status": "CREATED",
      "required_views": ["FRONT", "BACK"]
    }

### 9.2 获取摄像头和预览状态

    GET /api/cameras
    GET /api/scans/{scan_id}/preview

预览可以采用低帧率 MJPEG、WebRTC 或定时 JPEG。MVP 优先选择实现简单且局域网稳定的方式，最终通过树莓派性能实测决定。

### 9.3 拍照

    POST /api/scans/{scan_id}/capture

请求：

    {
      "view_type": "FRONT",
      "camera_id": "CAMERA-0",
      "lighting_profile": "STANDARD"
    }

响应：

    {
      "image_id": "IMG-...",
      "job_id": "JOB-...",
      "status": "QUALITY_CHECK"
    }

### 9.4 获取识别进度

    GET /api/scans/{scan_id}

响应包含：

- 当前状态。
- 已拍摄视角。
- 图像质量问题。
- OCR 文本块。
- 候选设备。
- 建议下一步。

### 9.5 重拍

    POST /api/scans/{scan_id}/retake

旧图不直接覆盖，而是标记 superseded，便于分析失败原因。

### 9.6 确认候选

    POST /api/scans/{scan_id}/confirm

请求：

    {
      "device_id": "DEV-...",
      "corrected_text": [],
      "note": "型号与背面产品编号一致"
    }

### 9.7 标记未知设备

    POST /api/scans/{scan_id}/unknown

请求：

    {
      "temporary_name": "Unknown CAN Adapter",
      "category": "COMMUNICATION_ADAPTER",
      "observed_text": ["CAN", "USB-C", "REV B"]
    }

### 9.8 WebSocket 事件

    scan.quality_checked
    scan.processing_started
    scan.ocr_completed
    scan.candidates_ready
    scan.failed
    scan.confirmed
    camera.state_changed

---

## 10. 前端交互

### 10.1 页面流程

    扫描首页
      → 选择“识别硬件”
      → 正面拍摄
      → 质量反馈/重拍
      → 背面拍摄
      → 可选局部特写
      → 处理中
      → 候选结果
      → 确认设备 / 未知设备
      → 硬件详情

### 10.2 拍摄页面

显示：

- 实时预览。
- 硬件放置引导框。
- 当前视角：正面、背面或局部。
- 对焦和曝光状态。
- 补光档位。
- 图像质量即时提示。
- 大尺寸拍摄按钮。
- 物理按钮状态。

### 10.3 候选页面

每个候选显示：

- 参考图片。
- 厂商、型号、类别。
- 总匹配分。
- 命中的文字和二维码。
- “为什么是这个设备”。
- 关键资料是否完整。
- 确认和查看差异按钮。

禁止只显示一个看似确定的答案。

### 10.4 硬件详情页面

分为：

1. 已确认信息：来自设备档案。
2. 本次观察：OCR 和图片检测到的内容。
3. 技术资料：手册、接线图和维护记录。
4. 风险提示：电压、极性、未知版本等。
5. 后续操作：加入机器人、创建维修任务、补充资料。

---

## 11. 项目代码结构

    apps/
    ├─ web/
    │  └─ src/features/scanner/
    │     ├─ pages/
    │     ├─ components/
    │     ├─ api/
    │     └─ state/
    ├─ api/
    │  └─ robopit/
    │     ├─ scans/
    │     ├─ devices/
    │     └─ cameras/
    ├─ worker/
    │  └─ vision/
    │     ├─ quality/
    │     ├─ preprocessing/
    │     ├─ barcode/
    │     ├─ ocr/
    │     ├─ extraction/
    │     └─ matching/
    └─ hardware_agent/
       └─ adapters/camera/
          ├─ base.py
          ├─ picamera2_adapter.py
          ├─ v4l2_adapter.py
          └─ mock_adapter.py
    tests/
    ├─ vision/
    ├─ api/
    ├─ hardware_sim/
    └─ datasets/

---

## 12. 配置设计

配置文件示例：

    camera_profiles:
      overhead:
        adapter: picamera2
        camera_id: 0
        still_width: 4056
        still_height: 3040
        preview_width: 1280
        preview_height: 720
        focus_mode: continuous
        quality_profile: pcb_default

    ocr:
      default_engine: tesseract
      languages: ["eng"]
      timeout_seconds: 20

    matching:
      max_candidates: 3
      require_user_confirmation: true

    storage:
      scan_root: /var/lib/robopit/scans
      keep_derived_days: 30

具体分辨率、阈值和 OCR 超时通过目标树莓派性能测试确定，不能直接使用示例值作为最终生产配置。

---

## 13. 设备库初始化

### 13.1 初始范围

第一阶段先录入团队高频使用的 30～50 种硬件，不追求覆盖所有 FRC 产品。

每种设备至少准备：

- 正式厂商和型号。
- 产品编号和常见别名。
- 正面、背面参考图片。
- 常见 OCR 文字。
- 设备类别。
- 官方说明书。
- 已确认的供电摘要。
- 已确认的通信协议。
- 接口和接线资料来源。

### 13.2 资料录入流程

1. 管理员创建设备。
2. 上传官方文档并记录来源。
3. 填写型号、产品编号和别名。
4. 审核关键电气参数。
5. 上传参考图片。
6. 执行识别回归测试。
7. 发布到生产设备库。

关键字段需要第二人审核后发布。

---

## 14. 数据集与评测

### 14.1 数据集采集

每种设备建议采集不少于 20 组照片，覆盖：

- 正面和背面。
- 不同方向：0°、90°、180°、270°。
- 标准光、低亮、斜向光和轻微反光。
- 不同拍摄高度。
- 部分线缆连接。
- 正常使用痕迹。
- 同型号不同物理个体。

训练集、验证集和测试集应按“物理设备个体”划分，避免同一块硬件的近似照片同时进入训练和测试。

### 14.2 指标

| 指标 | MVP 目标 |
|---|---:|
| 团队资产二维码识别成功率 | ≥ 98% |
| 合格图像质量判定召回率 | ≥ 95% |
| 已录入设备 Top-1 命中率 | ≥ 80% |
| 已录入设备 Top-3 命中率 | ≥ 90% |
| 未知设备错误确认率 | ≤ 5% |
| 型号关键字段字符准确率 | ≥ 85% |
| 二维码端到端响应 | ≤ 2 秒 |
| 完整 OCR 与候选匹配 | 目标 ≤ 10 秒 |
| 扫描任务异常后可恢复率 | 100% |

以上指标均在团队定义的标准拍摄工位和测试集上评估。自然杂乱场景另行统计，不能混用。

### 14.3 错误分类

    E01 摄像头不可用
    E02 图像模糊
    E03 过曝/欠曝
    E04 反光严重
    E05 二维码无法读取
    E06 OCR 无有效文字
    E07 候选差距过小
    E08 未知设备
    E09 任务超时
    E10 存储不足

每类错误都需要有面向用户的明确解决建议。

---

## 15. 测试计划

### 15.1 单元测试

- 图像质量评分。
- 文本规范化。
- 型号和产品编号正则。
- 候选打分与排序。
- 二维码内容校验。
- 扫描状态机。
- 路径和文件校验值。

### 15.2 集成测试

- Picamera2/模拟摄像头拍摄。
- 拍摄任务到 Worker 的完整流程。
- OCR 超时和崩溃恢复。
- 数据库写入与文件保存一致性。
- WebSocket 进度更新。
- 候选确认后设备资料查询。
- 断网环境下完整扫描。

### 15.3 硬件测试

- 摄像头断开和重新连接。
- 补光切换。
- 连续拍摄 100 次。
- 树莓派高温降频条件。
- 存储空间不足。
- 扫描处理中突然断电。
- 重启后未完成任务恢复或明确失败。

### 15.4 用户测试

让机械、电控、软件和新队员分别完成：

1. 扫描已录入设备。
2. 处理反光和重拍。
3. 在 Top-3 中确认正确候选。
4. 扫描未知设备并建档。
5. 从结果页打开接线图。

记录完成时间、误操作和需要口头指导的步骤。

---

## 16. 日志与可观测性

每次扫描记录：

- 会话 ID 和请求 ID。
- 摄像头、拍摄参数和补光配置。
- 每一步处理耗时。
- 质量分数和问题。
- 二维码结果。
- OCR 引擎与版本。
- 原始 OCR 文字。
- 候选得分和理由。
- 用户最终选择。
- 错误码和重试次数。

首页健康状态：

- 摄像头是否在线。
- 最近一次成功拍摄。
- Worker 队列长度。
- OCR 引擎状态。
- 剩余存储空间。
- 最近 24 小时扫描成功率。

---

## 17. 隐私与数据安全

- 摄像头仅在扫描页面或明确调用时启动。
- 开启摄像头时点亮物理状态灯。
- 默认不上传云端。
- 云端增强识别必须由用户确认上传图片。
- 可配置自动裁剪，只上传硬件区域。
- 设备照片和技术资料按内部/公开分类。
- 未授权访客不能访问扫描原图和内部设备库。
- 所有删除和导出操作写入审计日志。

---

## 18. 开发排期

### Week 1：摄像头与扫描骨架

- 树莓派摄像头驱动验证。
- Camera Adapter 和模拟摄像头。
- 创建扫描会话 API。
- 前端预览与拍摄页面。
- 原图保存和扫描状态机。

验收：手机能够查看预览、拍摄正反面并在刷新后查看原图。

### Week 2：质量检测与二维码

- 模糊、曝光、反光和主体区域检测。
- 重拍流程。
- QR Code 和条形码识别。
- 团队资产二维码格式。
- 设备库精确命中。

验收：扫描团队资产标签后在 2 秒目标时间内返回对应设备。

### Week 3：OCR 与字段提取

- OCR Adapter。
- Tesseract 基线。
- 多图和多方向识别。
- 文本规范化。
- 厂商、型号、产品编号和接口标签提取。

验收：对验证集输出带坐标和置信度的 OCR 结果。

### Week 4：设备匹配与确认

- 设备、别名和参考文档表。
- 候选评分和 Top-3。
- 候选解释。
- 人工确认和未知设备流程。
- 硬件详情页面。

验收：已录入设备达到初步 Top-3 指标，未知设备不会被自动确认为已知型号。

### Week 5：数据集、性能与可靠性

- 采集标准测试集。
- OCR 与匹配阈值标定。
- Worker 超时、取消和重试。
- 断网、断电和存储不足测试。
- 树莓派性能优化。

验收：完成自动评测报告和异常恢复测试。

### Week 6：用户测试与交付

- 机械、电控、软件和新队员测试。
- 优化引导、错误提示和拍摄工位。
- 整理设备库录入规范。
- 完成部署脚本、备份和使用手册。

验收：通过本文第 19 节交付验收。

---

## 19. 最终验收清单

### 功能

- [ ] 可选择摄像头并显示实时预览。
- [ ] 可分别拍摄正面、背面和局部图。
- [ ] 不合格照片会指出问题并允许重拍。
- [ ] 可识别团队资产二维码。
- [ ] 可输出 OCR 文字、位置和置信度。
- [ ] 可返回最多 3 个候选及匹配理由。
- [ ] 用户可确认、纠正或选择未知设备。
- [ ] 确认后可查看有来源的设备基本信息。
- [ ] 断网时完整流程可用。

### 安全

- [ ] 不把 OCR 电压文字自动当作额定电压。
- [ ] 不生成无资料来源的引脚图。
- [ ] 识别流程不能开启危险输出。
- [ ] 摄像头开启时有状态指示。
- [ ] 云端上传必须明确确认。

### 稳定性

- [ ] 连续 100 次拍摄无不可恢复故障。
- [ ] 摄像头断线后能恢复或给出明确错误。
- [ ] OCR 超时不会阻塞后续任务。
- [ ] 非正常断电后已完成扫描可访问。
- [ ] 存储不足时拒绝新拍摄并保护已有数据。

### 指标

- [ ] 二维码、Top-1、Top-3、OCR 和未知拒识达到第 14 节目标。
- [ ] 评测结果可按设备类别和拍摄条件拆分。
- [ ] 所有误识别样本可以追溯到原图、预处理和算法版本。

---

## 20. 第一批开发任务

| ID | 任务 | 交付 |
|---|---|---|
| CAM-001 | 摄像头环境验证 | 摄像头测试报告 |
| CAM-002 | Camera Adapter | Picamera2、V4L2、Mock 三个实现 |
| CAM-003 | 扫描状态机 | 数据模型和状态转换测试 |
| CAM-004 | 拍摄 API | 创建会话、拍照、重拍和查询 |
| CAM-005 | 扫描前端 | 预览、引导框、拍摄和进度 |
| VIS-001 | 图像质量基线 | 模糊、曝光和反光检测 |
| VIS-002 | 二维码识别 | 资产二维码和冲突处理 |
| OCR-001 | OCR Adapter | 本地 OCR 基线实现 |
| OCR-002 | 文本规范化 | 型号、厂商和编号处理 |
| MATCH-001 | 设备资料库 | 设备、别名、文档和样本表 |
| MATCH-002 | 候选匹配 | Top-3、得分和解释 |
| UI-001 | 候选确认页 | 确认、修正和未知设备 |
| TEST-001 | 数据采集工具 | 批量拍摄和标注导出 |
| TEST-002 | 自动评测工具 | 指标和错误分类报告 |
| OPS-001 | systemd 部署 | API、Worker、Hardware Agent 自启 |
| OPS-002 | 日志与健康检查 | 摄像头、队列、存储和成功率 |

---

## 21. 开发环境建议

树莓派侧：

- Raspberry Pi OS 64-bit。
- 使用官方 Picamera2/rpicam 摄像头栈。
- OpenCV 用于图像处理和二维码基线。
- Tesseract 作为第一版离线 OCR 基线。
- Python 环境如果需要读取系统安装的 Picamera2，应正确处理系统包与虚拟环境的可见性。

开发电脑侧：

- 使用 Mock Camera 或测试图片目录模拟摄像头。
- 识别算法必须可以在不连接真实硬件的情况下运行测试。
- 数据集不提交包含敏感资料的原图到公开代码仓库。

部署前记录：

- 树莓派型号和内存。
- 摄像头型号。
- Raspberry Pi OS 版本。
- rpicam、Picamera2、OpenCV 和 OCR 引擎版本。
- 补光和摄像头支架配置。

---

## 22. 技术参考

- Raspberry Pi 官方摄像头软件说明。当前官方栈使用 rpicam/libcamera，Python 应用通过 Picamera2 接入：
  https://www.raspberrypi.com/documentation/computers/camera_software.html
- Picamera2 官方手册：
  https://datasheets.raspberrypi.com/camera/picamera2-manual.pdf
- Tesseract 官方用户手册：
  https://tesseract-ocr.github.io/tessdoc/
- PaddleOCR 官方部署说明，包含 ARM 侧部署路径，可作为后续 OCR 增强方案：
  https://github.com/PaddlePaddle/PaddleOCR/blob/main/deploy/README.md
