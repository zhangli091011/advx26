import "server-only";

import bcrypt from "bcryptjs";
import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const dataRoot = process.env.FRC_DATA_DIR
  ? path.resolve(process.env.FRC_DATA_DIR)
  : path.join(process.cwd(), "data");

const globalForDb = globalThis as unknown as {
  frcDb?: Database.Database;
};

function seedDemoData(database: Database.Database) {
  const count = database.prepare("SELECT COUNT(*) AS count FROM users").get() as { count: number };
  if (count.count > 0) return;

  const now = Date.now();
  const passwordHash = bcrypt.hashSync("FRC2026!Demo", 12);
  const users = [
    ["demo-captain", "captain", "captain@frc.local", "高队", "ADMIN"],
    ["demo-mech", "mechanic", "mechanic@frc.local", "机械组 · 林澈", "ENGINEER"],
    ["demo-code", "programmer", "programmer@frc.local", "软件组 · 夏眠", "MEMBER"],
    ["demo-elec", "electrical", "electrical@frc.local", "电控组 · 阿岚", "MEMBER"],
  ] as const;

  const insertUser = database.prepare(`
    INSERT INTO users (id, username, email, display_name, password_hash, role, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertWork = database.prepare(`
    INSERT INTO work_sessions (
      id, user_id, clock_in_at, plan_task, clock_out_at, completed_task,
      duration_seconds, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const demoTasks = [
    ["demo-captain", 3.4, "复核本周制造排期", "完成底盘制造排期和采购优先级确认"],
    ["demo-mech", 5.8, "修改升降机构 CAD", "完成升降机构第二版装配并检查干涉"],
    ["demo-code", 4.6, "调试自动路径", "完成两条自动路径和里程计漂移记录"],
    ["demo-elec", 3.9, "整理电控板布线", "重新压接主回路端子并更新线号"],
  ] as const;

  database.transaction(() => {
    for (const user of users) {
      insertUser.run(user[0], user[1], user[2], user[3], passwordHash, user[4], now, now);
    }
    for (let day = 1; day <= 5; day += 1) {
      for (const [index, task] of demoTasks.entries()) {
        const hours = task[1] + ((day + index) % 3) * 0.35;
        const clockIn = now - day * 86_400_000 - (12 + index) * 3_600_000;
        const duration = Math.round(hours * 3600);
        insertWork.run(
          randomUUID(),
          task[0],
          clockIn,
          task[2],
          clockIn + duration * 1000,
          task[3],
          duration,
          clockIn,
          clockIn + duration * 1000,
        );
      }
    }
  })();
}

function seedHardwareCatalog(database: Database.Database) {
  const now = Date.now();
  const insertDevice = database.prepare(
    `INSERT INTO hardware_devices
      (id, manufacturer, model, category, part_number, revision, voltage_summary,
       protocols_json, interfaces_json, description, source_url, usage_url, pinout_url,
       created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       manufacturer = excluded.manufacturer,
       model = excluded.model,
       category = excluded.category,
       part_number = excluded.part_number,
       voltage_summary = excluded.voltage_summary,
       protocols_json = excluded.protocols_json,
       interfaces_json = excluded.interfaces_json,
       description = excluded.description,
       source_url = excluded.source_url,
       usage_url = excluded.usage_url,
       pinout_url = excluded.pinout_url,
       updated_at = excluded.updated_at`,
  );
  const insertAlias = database.prepare(
    `INSERT INTO hardware_device_aliases (id, device_id, alias_text, normalized_text, source)
     SELECT ?, ?, ?, ?, 'SEED'
     WHERE NOT EXISTS (
       SELECT 1 FROM hardware_device_aliases WHERE device_id = ? AND normalized_text = ?
     )`,
  );
  const devices = [
    {
      id: "catalog-rev-spark-max",
      manufacturer: "REV Robotics",
      model: "SPARK MAX",
      category: "MOTOR_CONTROLLER",
      partNumber: "REV-11-2158",
      voltageSummary: "5.5–24 V 输入；FRC 通常使用 12 V 系统",
      protocols: ["CAN", "PWM", "USB"],
      interfaces: ["USB-C", "CAN/PWM JST-PH", "Encoder Port", "Data Port"],
      description: "支持有刷与无刷电机的智能电机控制器。",
      sourceUrl: "https://docs.revrobotics.com/brushless/spark-max/overview",
      usageUrl: "https://docs.revrobotics.com/brushless/spark-max/gs",
      pinoutUrl: "https://docs.revrobotics.com/brushless/spark-max/specs/data-port",
      aliases: ["SPARKMAX", "REV SPARK MAX", "11-2158"],
    },
    {
      id: "catalog-rev-spark-flex",
      manufacturer: "REV Robotics",
      model: "SPARK Flex",
      category: "MOTOR_CONTROLLER",
      partNumber: "REV-11-2159",
      voltageSummary: "面向 FRC 12 V 电机系统",
      protocols: ["CAN", "PWM", "USB"],
      interfaces: ["USB-C", "CAN/PWM", "Expanded Data Port", "Motor Dock"],
      description: "可直接安装至 NEO Vortex 的智能电机控制器。",
      sourceUrl: "https://docs.revrobotics.com/brushless/spark-flex/overview",
      usageUrl: "https://docs.revrobotics.com/brushless/spark-flex/gs",
      pinoutUrl: "https://docs.revrobotics.com/brushless/spark-flex/gs/wiring",
      aliases: ["SPARKFLEX", "REV SPARK FLEX", "11-2159"],
    },
    {
      id: "catalog-rev-pdh",
      manufacturer: "REV Robotics",
      model: "Power Distribution Hub",
      category: "POWER_MODULE",
      partNumber: "REV-11-1850",
      voltageSummary: "FRC 12 V 电池配电模块",
      protocols: ["CAN", "USB"],
      interfaces: ["USB-C", "CAN", "20× 40A Channels", "4× 15A Channels"],
      description: "带电流遥测和可切换低电流通道的 FRC 配电中心。",
      sourceUrl: "https://docs.revrobotics.com/ion-control/pdh/overview",
      usageUrl: "https://docs.revrobotics.com/ion-control/pdh/gs",
      pinoutUrl: "https://docs.revrobotics.com/ion-control/pdh/gs/wiring",
      aliases: ["PDH", "REV PDH", "POWER DISTRIBUTION HUB"],
    },
    {
      id: "catalog-rev-ph",
      manufacturer: "REV Robotics",
      model: "Pneumatic Hub",
      category: "POWER_MODULE",
      partNumber: "REV-11-1852",
      voltageSummary: "4.7–18 V 输入；12 V 或 24 V 电磁阀输出",
      protocols: ["CAN", "USB"],
      interfaces: ["USB-C", "CAN", "16× Solenoid", "Pressure Sensor"],
      description: "集成压缩机、压力传感器和 16 路电磁阀控制的气动模块。",
      sourceUrl: "https://docs.revrobotics.com/ion-control/ph/overview",
      usageUrl: "https://docs.revrobotics.com/ion-control/ph/gs",
      pinoutUrl: "https://docs.revrobotics.com/ion-control/ph/gs/wiring",
      aliases: ["PH", "REV PH", "PNEUMATIC HUB", "11-1852"],
    },
    {
      id: "catalog-rev-through-bore",
      manufacturer: "REV Robotics",
      model: "Through Bore Encoder V1",
      category: "ENCODER",
      partNumber: "REV-11-1271",
      voltageSummary: null,
      protocols: ["Quadrature", "Duty Cycle PWM"],
      interfaces: ["JST-PH 6-pin", "roboRIO DIO"],
      description: "同时提供 ABI 增量输出和绝对位置脉宽输出的穿轴编码器。",
      sourceUrl: "https://docs.revrobotics.com/rev-crossover-products/sensors/tbe/v1",
      usageUrl: "https://docs.revrobotics.com/rev-crossover-products/sensors/tbe/v1/application-examples",
      pinoutUrl: "https://docs.revrobotics.com/rev-crossover-products/sensors/tbe/v1/application-examples",
      aliases: ["TBE", "THROUGH BORE", "THROUGH BORE ENCODER", "11-1271"],
    },
    {
      id: "catalog-ni-roborio-2",
      manufacturer: "National Instruments",
      model: "roboRIO 2.0",
      category: "ROBOT_CONTROLLER",
      partNumber: null,
      voltageSummary: "FRC 机器人主控制器电源输入",
      protocols: ["CAN", "Ethernet", "USB", "I2C", "SPI", "RS-232", "PWM"],
      interfaces: ["Ethernet", "USB-A", "USB-B", "MXP", "DIO", "Analog", "Relay"],
      description: "运行赛队程序并连接机器人控制系统设备的 FRC 主控制器。",
      sourceUrl: "https://docs.wpilib.org/en/stable/docs/software/roborio-info/roborio-introduction.html",
      usageUrl: "https://docs.wpilib.org/en/stable/docs/zero-to-robot/introduction.html",
      pinoutUrl: "https://docs.wpilib.org/en/stable/docs/software/roborio-info/roborio-introduction.html",
      aliases: ["ROBORIO", "ROBORIO 2", "NI ROBORIO"],
    },
    {
      id: "catalog-ctre-talon-fx",
      manufacturer: "Cross The Road Electronics",
      model: "Talon FX",
      category: "MOTOR_CONTROLLER",
      partNumber: null,
      voltageSummary: "面向 FRC 12 V 电机系统",
      protocols: ["CAN", "CAN FD"],
      interfaces: ["CAN", "Integrated Encoder"],
      description: "用于 Falcon 500、Kraken X60 或 Kraken X44 的集成智能电机控制器。",
      sourceUrl: "https://v6.docs.ctr-electronics.com/en/stable/docs/hardware-reference/index.html",
      usageUrl: "https://v6.docs.ctr-electronics.com/en/stable/docs/installation/requirements.html",
      pinoutUrl: null,
      aliases: ["TALONFX", "CTRE TALON FX", "FALCON CONTROLLER"],
    },
    {
      id: "catalog-ctre-talon-fxs",
      manufacturer: "Cross The Road Electronics",
      model: "Talon FXS",
      category: "MOTOR_CONTROLLER",
      partNumber: "24-708883",
      voltageSummary: "面向 FRC 12 V 电机系统",
      protocols: ["CAN", "CAN FD"],
      interfaces: ["CAN", "PWM/Sensor Inputs"],
      description: "Phoenix 6 智能电机控制器，可连接外置电机与传感器。",
      sourceUrl: "https://v6.docs.ctr-electronics.com/en/stable/docs/hardware-reference/index.html",
      usageUrl: "https://v6.docs.ctr-electronics.com/en/stable/docs/installation/requirements.html",
      pinoutUrl: null,
      aliases: ["TALONFXS", "CTRE TALON FXS", "24-708883"],
    },
    {
      id: "catalog-ctre-cancoder",
      manufacturer: "Cross The Road Electronics",
      model: "CANcoder",
      category: "ENCODER",
      partNumber: null,
      voltageSummary: null,
      protocols: ["CAN", "CAN FD"],
      interfaces: ["CAN", "Magnetic Encoder"],
      description: "Phoenix 6 支持的绝对磁编码器。",
      sourceUrl: "https://v6.docs.ctr-electronics.com/en/stable/docs/hardware-reference/index.html",
      usageUrl: "https://v6.docs.ctr-electronics.com/en/stable/docs/installation/requirements.html",
      pinoutUrl: null,
      aliases: ["CANCODER", "CTRE CANCODER"],
    },
    {
      id: "catalog-ctre-pigeon-2",
      manufacturer: "Cross The Road Electronics",
      model: "Pigeon 2.0",
      category: "SENSOR",
      partNumber: null,
      voltageSummary: null,
      protocols: ["CAN", "CAN FD"],
      interfaces: ["CAN", "IMU"],
      description: "提供偏航、俯仰、横滚和惯性测量的 FRC IMU。",
      sourceUrl: "https://v6.docs.ctr-electronics.com/en/stable/docs/hardware-reference/index.html",
      usageUrl: "https://v6.docs.ctr-electronics.com/en/stable/docs/installation/requirements.html",
      pinoutUrl: null,
      aliases: ["PIGEON2", "PIGEON 2", "CTRE PIGEON"],
    },
    {
      id: "catalog-ctre-canivore",
      manufacturer: "Cross The Road Electronics",
      model: "CANivore",
      category: "COMMUNICATION_ADAPTER",
      partNumber: null,
      voltageSummary: null,
      protocols: ["CAN FD", "USB"],
      interfaces: ["USB", "CAN"],
      description: "用于 roboRIO 或桌面调试的独立 CAN FD 总线适配器。",
      sourceUrl: "https://v6.docs.ctr-electronics.com/en/stable/docs/canivore/canivore-api.html",
      usageUrl: "https://v6.docs.ctr-electronics.com/en/stable/docs/canivore/canivore-api.html",
      pinoutUrl: null,
      aliases: ["CANIVORE", "CTRE CANIVORE"],
    },
    {
      id: "catalog-limelight",
      manufacturer: "Limelight Vision",
      model: "Limelight 3",
      category: "CAMERA",
      partNumber: null,
      voltageSummary: "FRC 机器人视觉设备电源输入",
      protocols: ["Ethernet", "HTTP", "NetworkTables"],
      interfaces: ["Ethernet", "USB", "GPIO"],
      description: "用于目标识别、AprilTag 定位和机器人视觉的智能相机。",
      sourceUrl: "https://docs.limelightvision.io/",
      usageUrl: "https://docs.limelightvision.io/",
      pinoutUrl: "https://docs.limelightvision.io/",
      aliases: ["LIMELIGHT", "LIMELIGHT 3", "LIMELIGHT VISION"],
    },
    {
      id: "catalog-vivid-vh109",
      manufacturer: "Vivid-Hosting",
      model: "VH-109",
      category: "NETWORK_DEVICE",
      partNumber: "VH-109",
      voltageSummary: "支持机器人电池未稳压输入及被动 PoE",
      protocols: ["Ethernet", "Wi-Fi 6E", "HTTP"],
      interfaces: ["RIO Ethernet", "DS Ethernet", "AUX1", "AUX2", "Power Input"],
      description: "面向 FRC 的 Wi-Fi 6E 机器人无线电与四口以太网设备。",
      sourceUrl: "https://frc-radio.vivid-hosting.net/",
      usageUrl: "https://frc-radio.vivid-hosting.net/overview/quick-start-guide",
      pinoutUrl: "https://frc-radio.vivid-hosting.net/overview/wiring-your-radio",
      aliases: ["VH109", "FRC RADIO", "VIVID RADIO"],
    },
    {
      id: "catalog-kauai-navx2-mxp",
      manufacturer: "Kauai Labs",
      model: "navX2-MXP",
      category: "SENSOR",
      partNumber: null,
      voltageSummary: null,
      protocols: ["SPI", "I2C", "USB", "Serial"],
      interfaces: ["roboRIO MXP", "USB"],
      description: "安装在 roboRIO MXP 扩展口上的九轴惯性测量与导航传感器。",
      sourceUrl: "https://pdocs.kauailabs.com/navx-mxp/",
      usageUrl: "https://pdocs.kauailabs.com/navx-mxp/guidance/selecting-an-interface/",
      pinoutUrl: "https://pdocs.kauailabs.com/navx-mxp/installation/io-expansion/",
      aliases: ["NAVX", "NAVX2", "NAVX2 MXP", "KAUAI NAVX"],
    },
  ] as const;

  database.transaction(() => {
    for (const item of devices) {
      insertDevice.run(
        item.id,
        item.manufacturer,
        item.model,
        item.category,
        item.partNumber,
        null,
        item.voltageSummary,
        JSON.stringify(item.protocols),
        JSON.stringify(item.interfaces),
        item.description,
        item.sourceUrl,
        item.usageUrl,
        item.pinoutUrl,
        now,
        now,
      );
      for (const alias of [item.manufacturer, item.model, item.partNumber, ...item.aliases]) {
        if (!alias) continue;
        insertAlias.run(
          randomUUID(),
          item.id,
          alias,
          alias.toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim(),
          item.id,
          alias.toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim(),
        );
      }
    }
  })();
}

function createDatabase() {
  fs.mkdirSync(dataRoot, { recursive: true });
  fs.mkdirSync(path.join(dataRoot, "storage", "avatars"), { recursive: true });
  fs.mkdirSync(path.join(dataRoot, "storage", "drawings"), { recursive: true });
  fs.mkdirSync(path.join(dataRoot, "storage", "finance"), { recursive: true });
  fs.mkdirSync(path.join(dataRoot, "storage", "hardware-scans"), { recursive: true });

  const database = new Database(path.join(dataRoot, "frc-team-hub.db"));
  database.pragma("busy_timeout = 5000");
  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");

  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      email TEXT UNIQUE COLLATE NOCASE,
      display_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'MEMBER'
        CHECK (role IN ('MEMBER', 'ENGINEER', 'FINANCE', 'ADMIN')),
      avatar_path TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      token_hash TEXT NOT NULL UNIQUE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);

    CREATE TABLE IF NOT EXISTS work_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      clock_in_at INTEGER NOT NULL,
      plan_task TEXT NOT NULL,
      clock_out_at INTEGER,
      completed_task TEXT,
      duration_seconds INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      CHECK (length(trim(plan_task)) BETWEEN 2 AND 2000),
      CHECK (completed_task IS NULL OR length(trim(completed_task)) BETWEEN 2 AND 4000),
      CHECK (duration_seconds IS NULL OR duration_seconds >= 0)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_one_open_session_per_user
      ON work_sessions(user_id) WHERE clock_out_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_work_user_clock ON work_sessions(user_id, clock_in_at DESC);

    CREATE TABLE IF NOT EXISTS drawings (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      part_number TEXT NOT NULL,
      subsystem TEXT NOT NULL,
      revision TEXT NOT NULL,
      description TEXT,
      original_name TEXT NOT NULL,
      storage_key TEXT NOT NULL UNIQUE,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      sha256 TEXT NOT NULL,
      uploaded_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_drawings_created ON drawings(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_drawings_part ON drawings(part_number COLLATE NOCASE);

    CREATE TABLE IF NOT EXISTS finance_documents (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL CHECK (kind IN ('INVOICE', 'PURCHASE')),
      title TEXT NOT NULL,
      vendor TEXT,
      amount_cents INTEGER,
      document_date TEXT,
      notes TEXT,
      original_name TEXT NOT NULL,
      storage_key TEXT NOT NULL UNIQUE,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      sha256 TEXT NOT NULL,
      uploaded_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_finance_kind_created
      ON finance_documents(kind, created_at DESC);

    CREATE TABLE IF NOT EXISTS hardware_devices (
      id TEXT PRIMARY KEY,
      manufacturer TEXT NOT NULL,
      model TEXT NOT NULL,
      category TEXT NOT NULL,
      part_number TEXT,
      revision TEXT,
      voltage_summary TEXT,
      protocols_json TEXT NOT NULL DEFAULT '[]',
      interfaces_json TEXT NOT NULL DEFAULT '[]',
      description TEXT,
      source_url TEXT,
      usage_url TEXT,
      pinout_url TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_hardware_device_identity
      ON hardware_devices(manufacturer COLLATE NOCASE, model COLLATE NOCASE, IFNULL(revision, ''));

    CREATE TABLE IF NOT EXISTS hardware_device_aliases (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL REFERENCES hardware_devices(id) ON DELETE CASCADE,
      alias_text TEXT NOT NULL,
      normalized_text TEXT NOT NULL,
      source TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_hardware_alias_device ON hardware_device_aliases(device_id);
    CREATE INDEX IF NOT EXISTS idx_hardware_alias_normalized
      ON hardware_device_aliases(normalized_text COLLATE NOCASE);

    CREATE TABLE IF NOT EXISTS hardware_scans (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      status TEXT NOT NULL
        CHECK (status IN ('PROCESSING', 'NEEDS_CONFIRMATION', 'CONFIRMED', 'UNKNOWN', 'FAILED')),
      front_storage_key TEXT NOT NULL UNIQUE,
      back_storage_key TEXT UNIQUE,
      front_quality_json TEXT NOT NULL,
      back_quality_json TEXT,
      provider TEXT NOT NULL,
      provider_model TEXT,
      summary TEXT NOT NULL,
      observed_text_json TEXT NOT NULL,
      visual_guess_json TEXT NOT NULL,
      candidates_json TEXT NOT NULL,
      confirmed_device_id TEXT REFERENCES hardware_devices(id) ON DELETE SET NULL,
      user_note TEXT,
      error_message TEXT,
      created_at INTEGER NOT NULL,
      completed_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_hardware_scans_user_created
      ON hardware_scans(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_hardware_scans_status_created
      ON hardware_scans(status, created_at DESC);
  `);

  const hardwareColumns = database.prepare("PRAGMA table_info(hardware_devices)").all() as Array<{ name: string }>;
  const hardwareColumnNames = new Set(hardwareColumns.map((column) => column.name));
  if (!hardwareColumnNames.has("usage_url")) {
    database.exec("ALTER TABLE hardware_devices ADD COLUMN usage_url TEXT");
  }
  if (!hardwareColumnNames.has("pinout_url")) {
    database.exec("ALTER TABLE hardware_devices ADD COLUMN pinout_url TEXT");
  }

  seedHardwareCatalog(database);
  if (process.env.SEED_DEMO_DATA !== "false") seedDemoData(database);
  return database;
}

export function getDb() {
  if (!globalForDb.frcDb) globalForDb.frcDb = createDatabase();
  return globalForDb.frcDb;
}

const db = new Proxy({} as Database.Database, {
  get(_target, property) {
    const database = getDb();
    const value = Reflect.get(database, property, database);
    return typeof value === "function" ? value.bind(database) : value;
  },
});

export default db;
