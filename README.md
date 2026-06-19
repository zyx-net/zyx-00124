# 自习预约与签到系统

一个完整的自习教室座位预约、审批、签到签退与统计管理系统。前后端一体化，数据持久化存储，重启后状态保持一致。

## 功能特性

### 核心业务链路

1. **教室座位配置** - 管理员可增删改教室，配置行列座位布局，启用/禁用单个座位
2. **开放时段配置** - 为每个教室设置每日开放时间段、生效星期、关闭日期（节假日/维护日）
3. **预约申请** - 学生选择日期、教室、时段和可用座位后提交申请，进入"待审批"状态
4. **预约审批** - 管理员对待审批预约执行"批准"或"退回（填写原因）"操作
5. **签到签退** - 批准后学生在预约时段内签到（自动身份校验防代签），使用结束后签退
6. **违约记录** - 迟到、未签到、未签退、被退回均自动生成违约记录
7. **历史查询** - 预约记录、违约记录、操作日志（含失败原因）全量可查
8. **统计导出** - 按学生或教室维度统计使用数据，支持 CSV 格式导出

### 异常拦截（均记录操作日志且不改变原预约状态）

| 异常场景 | 处理方式 |
|---------|---------|
| 关闭日期申请 | 拒绝申请，记录"该日期为关闭日" |
| 同座位同时间重复批准 | 拒绝操作，记录"已有冲突预约" |
| 学生替他人签到 | 拒绝签到，记录"不能替他人签到" |
| 普通用户执行审批 | 权限校验失败，记录"权限不足" |
| 非预约当日签到 | 拒绝签到，记录"非预约当日" |
| 未到/超过签到时段 | 拒绝签到，记录相应原因 |

## 技术栈

- **前端**：React 18 + TypeScript + Tailwind CSS + Zustand + React Router + Lucide React
- **后端**：Express 4 + TypeScript
- **数据存储**：JSON 文件持久化（`data/db.json`），服务重启后数据完全一致
- **构建工具**：Vite 6 + tsx + Nodemon

## 快速开始

### 安装依赖

```bash
npm install
```

### 启动开发环境

```bash
npm run dev
```

该命令会同时启动：
- 前端开发服务器（默认端口 5173）
- 后端 API 服务器（默认端口 3001）

访问 <http://localhost:5173> 即可使用系统。

### 仅运行前端

```bash
npm run client:dev
```

### 仅运行后端

```bash
npm run server:dev
```

### 类型检查

```bash
npm run check
```

## 预置样例用户

系统首次启动时自动创建以下账户，可直接登录体验：

| 角色 | 用户名 | 密码 | 姓名 | 学号 |
|------|--------|------|------|------|
| 管理员 | `admin` | `admin123` | 系统管理员 | - |
| 学生 | `student01` | `123456` | 张三 | 2024001 |
| 学生 | `student02` | `123456` | 李四 | 2024002 |

## 功能链路演示（本地复核指南）

### 链路 1：完整预约-签到-签退流程

1. **student01 登录** → 进入仪表盘
2. 进入「预约申请」→ 选择教室 A101 → 选择今天日期 → 选择一个时段 → 点击一个绿色可用座位 → 提交预约
3. 预约状态变为 **待审批**，列表可见
4. **退出，使用 admin 登录** → 进入「审批管理」→ 待审批标签页可见刚提交的申请
5. 点击「批准」→ 状态变为 **已批准**
6. **退出，使用 student01 登录** → 进入「签到签退」（需确保系统时间处于所选时段内）
7. 点击「签到」→ 状态变为 **已签到**
8. 使用结束后点击「签退」→ 状态变为 **已完成**
9. 进入「历史记录」→ 预约记录可看到完整记录

### 链路 2：违约判定

- **迟到**：student01 预约 08:00-10:00 的座位，08:16 之后签到 → 自动标记"迟到=是"并生成违约记录
- **未签退**：student01 签到后未签退，时段结束后访问任意页面时自动标记"未签退"并生成违约记录
- **未签到**：student01 预约被批准后未在时段内签到，超时后自动标记为违约
- **被退回**：admin 审批时选择"退回"并填写原因 → 生成违约记录，学生可在历史中看到退回原因

### 链路 3：异常拦截验证

1. **关闭日期申请**：
   - admin 登录 → 教室配置 → 选一个教室 →「关闭日期」标签 → 添加明天及原因并保存
   - student01 登录 → 预约申请 → 选择该教室和明天 → 提示"该日期为关闭日"，申请失败
   - admin 登录 → 历史记录 → 操作日志 → 可见失败记录及原因

2. **同座位同时间重复批准**：
   - student01 和 student02 对同一教室同日期同时段同座位各提交一次预约
   - admin 批准其中一条后，再批准另一条时提示"同座位同时段已有批准的预约"，操作失败

3. **学生代签**：
   - student01 的预约被批准
   - student02 登录 → 在 URL 或通过接口尝试对该预约执行签到 → 提示"这不是您的预约，不能替他人签到"

4. **普通用户审批**：
   - student01 登录 → 直接访问 `/approvals` → 自动跳转回仪表盘，无审批权限
   - 操作日志中记录"尝试执行权限不足的操作"

### 链路 4：统计导出

1. admin 登录 → 进入「统计导出」
2. 可见总览卡片、学生统计表格、教室统计表格（含使用率进度条）
3. 点击顶部「导出学生统计」或「导出教室统计」→ 下载 CSV 文件

## 数据持久化说明

- 所有业务数据存储在 `data/db.json` 文件中
- 包含：用户、教室、座位、开放时段、关闭日期、预约、违约记录、操作日志、系统配置
- 停止服务后重启，所有预约状态、审批记录、违约记录、历史数据完全保持不变
- 如需重置数据，删除 `data/db.json` 后重启服务，系统会自动重建初始数据

## 系统配置

可在 `data/db.json` 中调整以下配置：

```json
{
  "config": {
    "lateThresholdMinutes": 15,
    "violationWarningThreshold": 3
  }
}
```

- `lateThresholdMinutes`：迟到判定阈值（分钟），超过此时长签到即记为迟到违约
- `violationWarningThreshold`：违约警示阈值，学生违约次数达到此数时申请预约会显示警告提示

## 目录结构

```
.
├── api/                    # 后端代码
│   ├── data/               # 数据访问层（JSON 文件存储）
│   ├── middleware/         # 中间件（鉴权、审计日志）
│   ├── routes/             # API 路由
│   ├── services/           # 业务逻辑（预约、统计）
│   ├── app.ts              # Express 应用
│   └── server.ts           # 服务入口
├── src/                    # 前端代码
│   ├── components/         # 通用组件（Layout、Toast、路由保护）
│   ├── lib/                # API 客户端、工具函数
│   ├── pages/              # 业务页面
│   ├── store/              # Zustand 状态管理
│   └── main.tsx            # 应用入口
├── shared/                 # 前后端共享类型定义
├── data/                   # JSON 数据持久化目录（自动创建）
└── package.json
```

## API 概览

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| POST | `/api/auth/login` | 登录 | 公开 |
| POST | `/api/auth/logout` | 退出 | 登录 |
| GET | `/api/classrooms` | 教室列表 | 登录 |
| POST | `/api/classrooms` | 创建教室 | 管理员 |
| PUT | `/api/classrooms/:id/seats` | 更新座位配置 | 管理员 |
| PUT | `/api/classrooms/:id/slots` | 更新开放时段 | 管理员 |
| GET | `/api/classrooms/closed-dates/list` | 关闭日期列表 | 登录 |
| PUT | `/api/classrooms/closed-dates/batch` | 手动更新关闭日期 | 管理员 |
| GET | `/api/classrooms/closed-dates/export` | 导出关闭日期 CSV | 管理员 |
| POST | `/api/classrooms/closed-dates/import/preview` | 批量导入预览 | 管理员 |
| POST | `/api/classrooms/closed-dates/import/execute` | 批量导入执行 | 管理员 |
| POST | `/api/classrooms/closed-dates/import/undo` | 撤销最近一次批量导入 | 管理员 |
| GET | `/api/classrooms/closed-dates/import/last` | 查询最近一次导入快照 | 管理员 |
| GET | `/api/reservations` | 预约列表 | 登录 |
| POST | `/api/reservations` | 提交预约 | 学生 |
| PUT | `/api/reservations/:id/approve` | 批准预约 | 管理员 |
| PUT | `/api/reservations/:id/reject` | 退回预约 | 管理员 |
| POST | `/api/reservations/:id/checkin` | 签到 | 学生本人 |
| POST | `/api/reservations/:id/checkout` | 签退 | 学生本人 |
| GET | `/api/violations` | 违约记录 | 登录 |
| GET | `/api/history` | 历史记录 | 登录 |
| GET | `/api/students` | 学生统计 | 登录 |
| GET | `/api/classroom-stats` | 教室统计 | 登录 |
| GET | `/api/export/:type` | 导出 CSV | 登录 |
| GET | `/api/audit-logs` | 操作日志 | 登录 |

---

## 教室停课日批量导入完整链路

本链路支持管理员通过 CSV 文件批量导入教室关闭日期（停课日），支持**全局关闭**和**指定教室关闭**两种模式。整条链路包括：**CSV 准备 → 预览校验 → 正式执行 → 结果对账 → 导出备份 → 服务重启 → 快照恢复 → 撤销回滚**。

### 整体调用顺序

```
管理员登录 (POST /api/auth/login)
    │
    ▼
上传/粘贴 CSV 内容
    │
    ▼
① 导入预览  POST /api/classrooms/closed-dates/import/preview
    │  返回：每条行状态（new / duplicate / invalid）及错误原因
    │
    ▼  （如存在 invalid 行，需修正后重新预览）
② 正式执行  POST /api/classrooms/closed-dates/import/execute
    │  返回：added / skipped / failed 计数 + 逐条明细 + batchId
    │
    ├─→ ③ 查询快照  GET /api/classrooms/closed-dates/import/last
    │       获取最近一次导入的元数据（含导入前完整备份）
    │
    ├─→ ④ 导出对账  GET /api/classrooms/closed-dates/export
    │       下载当前全部关闭日期 CSV，与导入结果核对
    │
    ├─→ ⑤ 服务重启验证
    │       关闭后重启服务 → 快照/数据依然完整（持久化到 db.json）
    │       再次调用 ③ 确认快照存在
    │
    └─→ ⑥ 撤销导入  POST /api/classrooms/closed-dates/import/undo
            按快照恢复到导入前状态，清除快照
```

---

### CSV 格式规范

支持两种模式，**表头支持中英文混用**，自动去掉 BOM 头。

#### 模式 A：全局关闭（所有教室关闭）

```csv
日期,关闭原因
2026-01-01,元旦放假
2026-02-17,全校设备检修
```

或英文表头：
```csv
date,reason
2026-01-01,元旦放假
```

#### 模式 B：指定教室关闭（推荐，带教室列）

```csv
日期,关闭原因,教室
2026-07-01,建党节活动,cls-a101
2026-08-01,建军节训练,Z999
2026-09-10,教师节活动,B202
2026-10-01,国庆维修,NOT-EXIST
2026-11-11,双11活动,
2026-12-25,圣诞活动,cls-a101
```

**教室列支持 4 种匹配方式**（不区分大小写）：
| 匹配方式 | 示例 | 说明 |
|---------|------|------|
| 教室 ID | `cls-a101` | 精确匹配 `classrooms[].id` |
| 教室名称 | `A101` | 匹配 `classrooms[].name` |
| 楼栋+名称（无空格） | `A栋教学楼A101` | 拼接 `building + name` |
| 楼栋+名称（有空格） | `A栋教学楼 A101` | 拼接 `building + " " + name` |

> **注意**：当 CSV 含教室列时，该列不能为空，否则标记为 invalid。全局关闭模式（无教室列）保持向后兼容。

---

### ① 导入预览 API

**方法**：`POST /api/classrooms/closed-dates/import/preview`

**请求体**：
```json
{
  "csv": "日期,关闭原因,教室\n2026-07-01,建党节,cls-a101\n..."
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `csv` | string | 是 | 完整的 CSV 文本（含表头），支持 UTF-8 BOM |

**成功响应**（200）：
```json
{
  "total": 6,
  "newCount": 3,
  "duplicateCount": 0,
  "invalidCount": 3,
  "rows": [
    {
      "line": 2,
      "date": "2026-07-01",
      "reason": "建党节活动",
      "classroomId": "cls-a101",
      "classroomName": "A栋教学楼 A101",
      "status": "new",
      "message": null
    },
    {
      "line": 3,
      "date": "2026-08-01",
      "reason": "建军节训练",
      "classroomId": null,
      "classroomName": null,
      "status": "invalid",
      "message": "教室 \"Z999\" 不存在"
    }
  ]
}
```

| 返回字段 | 类型 | 说明 |
|---------|------|------|
| `total` | number | CSV 数据总行数（不含表头） |
| `newCount` | number | 可新增的行数（`status === 'new'`） |
| `duplicateCount` | number | 重复的行数（与现有数据或同批内冲突） |
| `invalidCount` | number | 无效的行数（格式错误或校验失败） |
| `rows[]` | array | 逐行明细 |
| `rows[].line` | number | CSV 中的行号（从 1 开始，表头为第 1 行） |
| `rows[].date` | string | 原始日期文本 |
| `rows[].reason` | string | 原始关闭原因 |
| `rows[].classroomId` | string \| undefined | 匹配到的教室 ID（教室列模式） |
| `rows[].classroomName` | string \| undefined | 匹配到的教室显示名（楼栋+名称） |
| `rows[].status` | `'new' \| 'duplicate' \| 'invalid'` | 该行状态 |
| `rows[].message` | string \| undefined | 非 `new` 行的错误描述，多个原因用 `；` 连接 |

**状态判定逻辑**：

| 状态 | 触发条件 |
|------|---------|
| `invalid` | 日期格式非 `YYYY-MM-DD`（含不存在日期如 02-30）、关闭原因空、教室列存在但教室为空/匹配不到 |
| `duplicate` | 已通过基础校验，但该 `(日期, 教室)` 组合在数据库或同批前面行中已存在；全局模式下检测 `(日期)` |
| `new` | 通过所有校验且未重复 |

**重复判定 Key**：
- 指定教室模式：`${date}|${classroomId}`（同一天 A101 关闭 ≠ B202 关闭，不算重复）
- 全局模式：`${date}`（同一天全局关闭与单教室关闭互不冲突）

---

### ② 正式执行导入 API

**方法**：`POST /api/classrooms/closed-dates/import/execute`

**请求体**：
```json
{
  "csv": "日期,关闭原因,教室\n2026-07-01,建党节,cls-a101\n...",
  "skipDuplicates": true
}
```

| 字段 | 类型 | 必填 | 默认 | 说明 |
|------|------|------|------|------|
| `csv` | string | 是 | - | 同预览接口的 CSV 文本 |
| `skipDuplicates` | boolean | 否 | `true` | 遇到重复时是否自动跳过；当前实现恒按「跳过重复」处理（重复只计入 skipped，不写入） |

**成功响应**（200）：
```json
{
  "success": true,
  "added": 3,
  "skipped": 0,
  "failed": 3,
  "rows": [ /* 同预览返回的 rows[]，共 6 条 */ ],
  "batchId": "batch-lwxyz123",
  "summary": "成功导入 3 条，无效 3 条"
}
```

| 返回字段 | 类型 | 说明 |
|---------|------|------|
| `success` | boolean | 是否完成执行（只要 HTTP 200 即为 true；部分失败不抛错，体现在 failed 计数） |
| `added` | number | 实际写入数据库的新记录数（= `newCount`） |
| `skipped` | number | 跳过的重复数（= `duplicateCount`，因 skipDuplicates=true） |
| `failed` | number | 无效未写入数（= `invalidCount`） |
| `rows[]` | array | 与预览一致的逐条明细，方便前端对账 |
| `batchId` | string | 本次导入的批次编号，用于审计日志和撤销定位 |
| `summary` | string | 人类可读的汇总文案，适合直接 Toast |

**数据写入语义**：
- 只写入 `status === 'new'` 的行，其余行完全不动
- 写入时保留原有 `closedDates` 数组，并按日期升序+教室ID升序排序
- 新写入带教室列的记录会带上 `classroomId` 字段
- 执行完成后立即生成「导入快照」写入 `db.json.lastClosedDateImport`

---

### ③ 最近一次导入快照 API

**方法**：`GET /api/classrooms/closed-dates/import/last`

**请求参数**：无

**成功响应**（200，存在快照时）：
```json
{
  "batchId": "batch-lwxyz123",
  "previousClosedDates": [
    { "date": "2026-01-01", "reason": "基线数据" }
  ],
  "importedCount": 3,
  "importedBy": "admin-001",
  "importedByName": "系统管理员",
  "importedAt": "2026-06-20T10:30:00.000Z",
  "summary": "成功导入 3 条，无效 3 条"
}
```

无快照时返回 `null`（HTTP 200，body 为 `null`）。

| 字段 | 类型 | 说明 |
|------|------|------|
| `batchId` | string | 批次号，与 execute 返回一致 |
| `previousClosedDates` | array | 导入**前**完整的 `closedDates` 数组深拷贝，用于撤销时精确还原 |
| `importedCount` | number | 本次实际新增的条数 |
| `importedBy` | string | 执行导入的用户 ID |
| `importedByName` | string | 执行导入的用户姓名 |
| `importedAt` | string | ISO 时间戳 |
| `summary` | string | 与 execute 返回的汇总文案一致 |

**快照生命周期**：
- 每次执行 `import/execute` 成功后，**覆盖**上一次快照
- 执行 `import/undo` 成功后，**清除**快照（置为 `null`）
- 手动调用 `PUT /closed-dates/batch` 不影响快照（但会让快照中的 `previousClosedDates` 与实际基线不一致，撤销时以快照数据为准）

---

### ④ 撤销最近一次导入 API

**方法**：`POST /api/classrooms/closed-dates/import/undo`

**请求参数**：无（无 body）

**成功响应**（200）：
```json
{
  "success": true,
  "batchId": "batch-lwxyz123",
  "restoredCount": 3,
  "summary": "已撤销最近一次导入（3 条）"
}
```

**无快照时响应**（400）：
```json
{ "error": "没有可撤销的批量导入" }
```

| 字段 | 类型 | 说明 |
|---------|------|------|
| `success` | boolean | 撤销是否成功 |
| `batchId` | string | 被撤销的批次号 |
| `restoredCount` | number | 被移除的记录数（= 快照中 `importedCount`） |
| `summary` | string | 人类可读结果 |

**撤销语义**：
- 将 `db.closedDates` **整体替换**为快照中的 `previousClosedDates`（而非逐条删除，保证幂等）
- 撤销后将 `db.lastClosedDateImport` 置为 `null`，再次撤销会返回 400
- **注意**：如果导入后有人手动增删了关闭日期，撤销会覆盖那些手动改动（因为整体替换）。建议导入后如有手动修改先自行导出备份。

---

### ⑤ 导出关闭日期 CSV API

**方法**：`GET /api/classrooms/closed-dates/export`

**请求参数**：无

**响应**（200）：
- `Content-Type: text/csv; charset=utf-8`
- `Content-Disposition: attachment; filename=closed-dates-<timestamp>.csv`
- Body 以 UTF-8 BOM（`\uFEFF`）开头，保证 Excel 打开中文不乱码

**输出内容规则**：
- 当全部记录都是全局关闭（无 `classroomId`）→ 输出两列表头：`日期,关闭原因`
- 只要存在 ≥1 条带 `classroomId` 的记录 → 输出三列表头：`日期,关闭原因,教室`
- 教室列内容为 `楼栋 名称`（如 `A栋教学楼 A101`），缺失时为空字符串
- 字段含逗号、双引号、换行时，自动用双引号包裹并转义

**示例导出（三列）**：
```csv
日期,关闭原因,教室
2026-07-01,建党节活动,A栋教学楼 A101
2026-09-10,教师节活动,B栋教学楼 B202
2026-12-25,圣诞活动,A栋教学楼 A101
```

---

### 权限控制矩阵

所有 5 个批量接口（preview/execute/undo/last/export）都叠加了以下中间件，按顺序校验：

| 中间件 | 未登录 | 学生（student） | 管理员（admin） |
|--------|-------|----------------|----------------|
| `authMiddleware` | 401 `{error:'未登录' 或 '登录已过期'}` | 通过 | 通过 |
| `roleMiddleware('admin')` | - | 403 `{error:'权限不足'}` | 通过 |
| 业务逻辑 | - | - | 正常处理 |

**学生尝试调用示例**：
```
学生 Token → POST /import/preview → HTTP 403
学生 Token → GET /export → HTTP 403
```
且操作日志会记录一条 `success=false, reason='权限不足'` 的审计记录。

---

### 冲突行与无效行的提示说明

**预览阶段（import/preview）**：每行均带有明确的 `status` 和 `message`，前端可按状态着色：
| status | 推荐颜色 | message 示例 |
|--------|---------|-------------|
| `new` | 绿色 | —（无 message） |
| `duplicate` | 橙色/琥珀色 | `A栋教学楼 A101 在该日期已有关闭记录`（单教室模式）或 `日期已存在`（全局模式） |
| `invalid` | 红色 | `日期格式错误（应为 YYYY-MM-DD）`、`关闭原因不能为空`、`教室 "Z999" 不存在`、`教室不能为空`；多个错误用 `；` 连接 |

**执行阶段（import/execute）**：不会因某行 invalid 导致整体失败（原子性为「行级」而非「批次级」），结果体现在：
- `added + skipped + failed === total`
- `rows[]` 与预览结果 1:1 对应，方便对账
- `summary` 字段将无效/跳过条数拼接成自然语言

---

### 导入结果与导出文件对账

完成导入后，可通过以下步骤做数据对账：

1. **执行导入后**：记录 `ImportExecuteResult` 中的 `added / skipped / failed / batchId`
2. **查询列表**：调用 `GET /closed-dates/list`，核对总数是否 = 导入前基数 + `added`
3. **导出 CSV**：调用 `GET /closed-dates/export` 下载文件
4. **一致性校验**：
   - 用导出的 CSV 作为输入再次调用 `import/preview`，理论上 `duplicateCount = added`（所有新记录现在都「已存在」）且 `invalidCount = 0`（导出内容本身是合法的）
   - 计数关系：`preview.duplicateCount === execute.added`
5. **按教室维度抽查**：导出的教室列应为「楼栋 名称」而非原始 ID；抽样若干条核对 `(日期, 教室, 原因)` 三元组是否与输入一致

---

### 服务重启后的快照恢复能力

**持久化介质**：所有业务数据写入 `data/db.json`，包括：
- `closedDates` 数组（关闭日期主表）
- `lastClosedDateImport` 对象（最近导入快照，含完整 `previousClosedDates`）

**重启验证路径**：
```bash
# 1. 执行导入
POST /import/execute → 得到 batchId ABC

# 2. 检查磁盘
cat data/db.json | jq '.lastClosedDateImport.batchId'  # 应为 "ABC"
cat data/db.json | jq '.closedDates | length'            # 应为 导入后总数

# 3. 关闭服务（Ctrl+C）
# 4. 重新启动 npm run dev

# 5. 启动后查询快照
GET /import/last → 应返回完整 snapshot 对象（含 ABC）
GET /closed-dates/list → 总数与重启前一致

# 6. 此时依然可以撤销
POST /import/undo → 仍能恢复到 ABC 导入之前的状态
```

**结论**：快照 100% 持久化，服务重启不丢失，撤销能力跨重启有效。

---

### 撤销后的日志记录

以下操作**全部**写入 `db.auditLogs`（通过 `logAudit()` 统一函数），可通过 `GET /api/audit-logs` 查询：

| 操作 | auditLog.action 示例 | success | targetId | reason |
|------|--------------------|---------|----------|--------|
| 预览导入 | `预览关闭日期导入` | `true` | `undefined` | - |
| 执行导入 | `批量导入关闭日期: 成功导入 3 条，无效 3 条` | `true` | `batch-xxx` | - |
| 导出 CSV | `导出关闭日期CSV` | `true` | `undefined` | - |
| 撤销导入 | `撤销关闭日期批量导入，恢复 3 条前的状态` | `true` | `batch-xxx` | - |
| 学生越权调用 | `尝试执行权限不足的操作: POST /api/classrooms/closed-dates/import/preview` | `false` | `undefined` | `权限不足` |

审计日志字段完整结构见 `AuditLog` 类型定义。日志按时间倒序排列，最近 500 条可通过 API 查看。

---

### 链路 5：管理员批量导入教室停课日完整流程（端到端）

准备：使用 `data/sample-closed-dates-with-classroom.csv` 作为输入文件（含 Z999 不存在、NOT-EXIST、空教室 3 个无效行，共 6 行）。

1. **admin 登录** → 进入「教室配置」→ 点击任意教室进入详情 → 切换到「关闭日期」标签
2. 点击「批量导入」→ 选择上述 CSV 文件 → 点击「预览导入结果」
3. 预览面板显示：`总行数 6 / 可新增 3 / 重复 0 / 无效 3`
   - 第 2 行 (07-01, cls-a101)：new，教室解析为「A栋教学楼 A101」
   - 第 3 行 (08-01, Z999)：invalid，错误「教室 "Z999" 不存在」
   - 第 4 行 (09-10, B202)：new，教室解析为「B栋教学楼 B202」
   - 第 5 行 (10-01, NOT-EXIST)：invalid
   - 第 6 行 (11-11, 空教室)：invalid，错误「教室不能为空」
   - 第 7 行 (12-25, cls-a101)：new
4. 点击「确认导入」→ Toast 显示汇总信息，关闭日期列表新增 3 条，顶部出现「撤销上次导入 (3 条)」按钮
5. 点击「导出 CSV」→ 下载 `closed-dates-xxx.csv`，打开检查三列齐全、中文字段正确
6. 用导出的文件再次执行「预览导入」→ 3 条有效记录全部显示为重复（`duplicateCount = 3`），说明导出-导入闭环一致
7. **模拟服务重启**：停止后端进程再启动 → 重新进入页面 → 「撤销上次导入」按钮仍在 → 点击「撤销」→ 3 条记录消失，按钮隐藏
8. **审计日志验证**：进入「历史记录」→ 操作日志 → 可看到「预览、批量导入、导出 CSV、撤销」共 4 条记录，以及 student01 越权尝试时的「权限不足」记录
9. **student01 登录验证**：直接用 curl/接口访问上述 5 个批量接口 → 全部返回 403「权限不足」

---

### 可复现验证脚本（curl 一键跑通）

将以下脚本保存为 `test-batch-import.ps1`（Windows PowerShell）或转为 bash，需先启动后端 `npm run dev`（端口 3001）。脚本自动备份 `data/db.json`，测试完成后恢复。

```powershell
# === 可复现验证：教室停课日批量导入完整链路 ===
$BASE = "http://localhost:3001"
$DB = "d:\workSpace\AI__SPACE\zyx-00124\data\db.json"
$DB_BAK = "$DB.bak"
Copy-Item $DB $DB_BAK -Force

function Send-Json($method, $path, $body, $token) {
    $headers = @{ "Content-Type" = "application/json" }
    if ($token) { $headers["Authorization"] = "Bearer $token" }
    $params = @{ Method=$method; Uri="$BASE$path"; Headers=$headers }
    if ($body) { $params["Body"] = ($body | ConvertTo-Json -Compress) }
    try { return Invoke-RestMethod @params } catch { return $_.Exception.Response }
}

function Login($u, $p) {
    $r = Send-Json POST "/api/auth/login" @{username=$u; password=$p}
    return $r.token
}

Write-Host "=== Step 0: 登录 ===" -ForegroundColor Cyan
$admin = Login "admin" "admin123"
$stu   = Login "student01" "123456"
Write-Host "admin token: $($admin.Substring(0,10))..."
Write-Host "student token: $($stu.Substring(0,10))..."

$CSV_WITH_CLASSROOM = @"
日期,关闭原因,教室
2026-07-01,建党节活动关闭,cls-a101
2026-08-01,建军节训练,Z999
2026-09-10,教师节活动,B202
2026-10-01,国庆维修,NOT-EXIST
2026-11-11,双11活动,
2026-12-25,圣诞活动,cls-a101
"@

Write-Host "`n=== Step 1: 权限验证 - 学生访问所有批量接口 ===" -ForegroundColor Cyan
foreach ($path in @(
    @("GET","/api/classrooms/closed-dates/export",$null),
    @("POST","/api/classrooms/closed-dates/import/preview",@{csv=$CSV_WITH_CLASSROOM}),
    @("POST","/api/classrooms/closed-dates/import/execute",@{csv=$CSV_WITH_CLASSROOM}),
    @("POST","/api/classrooms/closed-dates/import/undo",$null),
    @("GET","/api/classrooms/closed-dates/import/last",$null)
)) {
    $m, $p, $b = $path
    try {
        $resp = Send-Json $m $p $b $stu
        Write-Host "$m $p -> 期望 403，实际: $resp"
    } catch {
        $status = [int]$_.Exception.Response.StatusCode
        Write-Host "$m $p -> HTTP $status $(if($status -eq 403){'✅ PASS'}else{'❌ FAIL'})"
    }
}

Write-Host "`n=== Step 2: 预览导入（admin） ===" -ForegroundColor Cyan
$preview = Send-Json POST "/api/classrooms/closed-dates/import/preview" @{csv=$CSV_WITH_CLASSROOM} $admin
Write-Host "total=$($preview.total) new=$($preview.newCount) dup=$($preview.duplicateCount) invalid=$($preview.invalidCount)"
$preview.rows | ForEach-Object { Write-Host "  行$($_.line): $($_.status) $($_.date) $($_.classroomName) - $($_.message)" }
Write-Host "  断言: total=6, newCount=3, invalidCount=3 $(if($preview.total -eq 6 -and $preview.newCount -eq 3 -and $preview.invalidCount -eq 3){'✅ PASS'}else{'❌ FAIL'})"

Write-Host "`n=== Step 3: 执行导入（admin） ===" -ForegroundColor Cyan
$exec = Send-Json POST "/api/classrooms/closed-dates/import/execute" @{csv=$CSV_WITH_CLASSROOM; skipDuplicates=$true} $admin
Write-Host "added=$($exec.added) skipped=$($exec.skipped) failed=$($exec.failed) batchId=$($exec.batchId)"
Write-Host "  summary: $($exec.summary)"
Write-Host "  断言: added=3, failed=3 $(if($exec.added -eq 3 -and $exec.failed -eq 3){'✅ PASS'}else{'❌ FAIL'})"

Write-Host "`n=== Step 4: 查询最近导入快照（admin） ===" -ForegroundColor Cyan
$last = Send-Json GET "/api/classrooms/closed-dates/import/last" $null $admin
Write-Host "snap batchId=$($last.batchId) importedCount=$($last.importedCount) importedBy=$($last.importedByName)"
Write-Host "previousClosedDates 基线条数: $($last.previousClosedDates.Count)"
Write-Host "  断言: importedCount=3, previousClosedDates=0 $(if($last.importedCount -eq 3 -and $last.previousClosedDates.Count -eq 0){'✅ PASS'}else{'❌ FAIL'})"

Write-Host "`n=== Step 5: 导出 CSV 并对账 ===" -ForegroundColor Cyan
$headers2 = @{ Authorization = "Bearer $admin" }
$exportResp = Invoke-WebRequest -Uri "$BASE/api/classrooms/closed-dates/export" -Headers $headers2
$exportCsv = $exportResp.Content
Write-Host "Content-Type: $($exportResp.Headers['Content-Type'])"
Write-Host "CSV 片段: $($exportCsv.Substring(0, [Math]::Min(200, $exportCsv.Length)))"
# 再导入一次校验: 应该全部 duplicate
$rePreview = Send-Json POST "/api/classrooms/closed-dates/import/preview" @{csv=$exportCsv} $admin
Write-Host "  导出内容再预览: duplicateCount=$($rePreview.duplicateCount) invalidCount=$($rePreview.invalidCount)"
Write-Host "  断言: duplicateCount=3, invalidCount=0 $(if($rePreview.duplicateCount -eq 3 -and $rePreview.invalidCount -eq 0){'✅ PASS'}else{'❌ FAIL'})"

Write-Host "`n=== Step 6: 模拟服务重启（重新读取 db.json） ===" -ForegroundColor Cyan
# 直接删除 db.json 会被重建，这里用更精确的验证：检查磁盘文件内容
$dbOnDisk = Get-Content $DB | ConvertFrom-Json
Write-Host "磁盘 closedDates.Count=$($dbOnDisk.closedDates.Count)  snap存在=$( $null -ne $dbOnDisk.lastClosedDateImport )"
# 模拟重启: 再次 GET /list 和 /last 依然一致
$listAfter = Send-Json GET "/api/classrooms/closed-dates/list" $null $admin
Write-Host "API list 条数=$($listAfter.Count)"
Write-Host "  断言: 磁盘=3, API=3 $(if($dbOnDisk.closedDates.Count -eq 3 -and $listAfter.Count -eq 3){'✅ PASS'}else{'❌ FAIL'})"

Write-Host "`n=== Step 7: 撤销导入 ===" -ForegroundColor Cyan
$undo = Send-Json POST "/api/classrooms/closed-dates/import/undo" $null $admin
Write-Host "restoredCount=$($undo.restoredCount) batchId=$($undo.batchId) summary=$($undo.summary)"
$listUndo = Send-Json GET "/api/classrooms/closed-dates/list" $null $admin
$lastUndo = Send-Json GET "/api/classrooms/closed-dates/import/last" $null $admin
Write-Host "  撤销后 list 条数=$($listUndo.Count) 快照=$(if($lastUndo -eq $null){'null ✅ PASS'}else{'存在 ❌ FAIL'})"
Write-Host "  断言: restoredCount=3, list=0 $(if($undo.restoredCount -eq 3 -and $listUndo.Count -eq 0){'✅ PASS'}else{'❌ FAIL'})"

Write-Host "`n=== Step 8: 再次撤销应失败 ===" -ForegroundColor Cyan
try {
    Send-Json POST "/api/classrooms/closed-dates/import/undo" $null $admin | Out-Null
    Write-Host "  ❌ FAIL: 预期 HTTP 400"
} catch {
    $status = [int]$_.Exception.Response.StatusCode
    Write-Host "  HTTP $status $(if($status -eq 400){'✅ PASS (无快照撤销返回 400)'}else{'❌ FAIL'})"
}

Write-Host "`n=== Step 9: 审计日志检查 ===" -ForegroundColor Cyan
$logs = Send-Json GET "/api/audit-logs" $null $admin
$actions = $logs | ForEach-Object { $_.action }
function Check-Log($kw) {
    $found = $actions | Where-Object { $_ -match [regex]::Escape($kw) }
    Write-Host "  含[$kw] 的日志: $(if($found){'✅ PASS'}else{'❌ FAIL'})"
}
Check-Log "预览关闭日期导入"
Check-Log "批量导入关闭日期"
Check-Log "导出关闭日期CSV"
Check-Log "撤销关闭日期批量导入"

# 恢复原始数据
Copy-Item $DB_BAK $DB -Force
Remove-Item $DB_BAK -Force
Write-Host "`n=== 验证完成，原始 db.json 已恢复 ===" -ForegroundColor Green
```

运行方式（PowerShell）：
```powershell
cd d:\workSpace\AI__SPACE\zyx-00124
powershell -ExecutionPolicy Bypass -File test-batch-import.ps1
```

或运行项目已有的回归测试（更全量，含 19 个子场景）：
```bash
node --experimental-vm-modules test/closed-dates-import-regression.test.js
```
该脚本覆盖：权限、表头中英文、教室 4 种匹配方式、同批内重复检测、持久化、撤销原子性、导入导出闭环等全部断言。
