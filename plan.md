# Video AI Review Frontend — 開發計劃

---

## 0. Repo / Tech Stack

| 項目 | 內容 |
|------|------|
| **Repo** | `erickh826/video_ai_review_frontend`（自訂） |
| **Stack** | Next.js 14+（App Router）+ React + TypeScript |
| **Deploy** | Vercel |
| **Auth（MVP）** | 先用簡單 token（`X-Admin-Token`）保護 API route；之後再換 Cognito / NextAuth |

---

## 1. 功能範圍（MVP）

### 必須實作

- 讀取 transcript（JSON）
- 顯示 phrase list（含 `speaker`、`offset`、`duration`、`text`）
- **Click-to-play**（點一句 → 播放該句片段）
- **Toggle speaker**（快速切換：Guest-1 / Guest-2 / …）
- Save edited transcript → 上傳 S3 成 `<stem>.transcript.edited.json`
- Trigger backend analysis-only（Vercel API Route → SQS）
- 顯示 `analysis.edited.json`（optional 但建議，做閉環）

### 非必須（之後）

- 批次選取多句改 speaker
- Undo / Redo
- Keyboard shortcuts（`1`/`2` 切 speaker、`j`/`k` 上下句、`space` 播放）
- Diff view（raw vs edited）
- 多 speaker 支援（Guest-3…）

---

## 2. Data Contracts（前後端交互）

### 2.1 S3 Keys（約定）

| 用途 | Key |
|------|-----|
| transcript（原始） | `video-review/<video_id>/ai/<stem>.transcript.json` |
| transcript（人手修正） | `video-review/<video_id>/ai/<stem>.transcript.edited.json` |
| analysis（原始） | `video-review/<video_id>/ai/<stem>.analysis.json` |
| analysis（人手修正後） | `video-review/<video_id>/ai/<stem>.analysis.edited.json` |
| raw video（播放用） | `video-review/<video_id>/raw/<stem>.mp4` |

> 如果 raw key 唔一定係呢個格式，前端就要由 backend API 回傳 media key / url。

### 2.2 Edited Transcript JSON 格式（建議）

沿用原始 transcript schema，加 metadata（放頂層）：

**頂層 metadata**

| 欄位 | 說明 |
|------|------|
| `edited` | `true` |
| `edited_at` | ISO string |
| `edited_by` | string（email / login） |
| `edit_source` | `"web_ui"` |
| `edit_version` | number（每次 save +1，optional） |

**`phrases[]` 每句保留**

- `speaker_id_raw` — 原始 speaker
- `speaker_id` — 可被修改
- 其他欄位不動（`offset_ms` / `duration_ms` / `text`）

---

## 3. Vercel API Routes（核心）

> 用 Next.js route handlers（`app/api/.../route.ts`）。所有 AWS key 只放 server side env var。

### 3.1 `POST /api/presign-upload`

**用途**：前端取得「上傳 edited transcript」presigned URL（PUT）。

**Request**
```json
{
  "bucket": "video-review-ai-useast",
  "key": "video-review/<video_id>/ai/<stem>.transcript.edited.json",
  "contentType": "application/json"
}
```

**Response**
```json
{
  "uploadUrl": "https://s3....(presigned)",
  "headers": { "Content-Type": "application/json" }
}
```

---

### 3.2 `POST /api/presign-download`

**用途**：前端取得「下載 transcript / analysis / raw mp4」presigned URL（GET）。

**Request**
```json
{ "bucket": "...", "key": "video-review/<video_id>/ai/<stem>.transcript.json" }
```

**Response**
```json
{ "downloadUrl": "https://s3....(presigned)" }
```

> 播放 mp4 建議用 presigned GET；如果之後上 CloudFront，就改回固定 `https` url。

---

### 3.3 `POST /api/trigger-analysis`

**用途**：Vercel server side push SQS message（analysis-only）。

**Request**
```json
{
  "bucket": "video-review-ai-useast",
  "key": "video-review/<video_id>/ai/<stem>.transcript.edited.json"
}
```

**Server action** — send SQS message body：
```json
{
  "kind": "analysis_only",
  "bucket": "<bucket>",
  "key": "<key>"
}
```

**Response**
```json
{ "ok": true, "messageId": "..." }
```

---

### 3.4 `GET /api/health`

簡單回傳 `ok`，方便確認 Vercel env 有冇 set 錯。

---

## 4. UI / Pages（建議路由）

### 4.1 `/videos/[videoId]/[stem]` — Transcript Editor

畫面分 **3 區**：

1. **Media Player**（video / audio）
2. **Transcript list**
3. **Side panel**（save 狀態、analysis 結果）

#### Transcript Row UI

每行顯示：

- Speaker badge（可 click toggle）
- Text
- Time：`mm:ss.SSS`（由 `offset_ms` 換算）
- Suspects 標記（`duration <= 600` 或 `len <= 6`）

#### Row Click 行為

1. Seek 到 `offset_ms`
2. Play `duration_ms + buffer`（例如 +200ms）
3. 播完 auto pause（用 timer）

#### Toggle Speaker

- 若 `all_speakers = ['Guest-1', 'Guest-2', ...]`，點 badge → 循環切換下一個 speaker
- 右鍵開 menu 揀 speaker（多於 2 個時）

---

### 4.2 `/videos/[videoId]/[stem]/analysis`

顯示 `analysis.edited.json`（如存在）；否則顯示「未生成，請 trigger」。

---

## 5. 播放（Click-to-play）實作規格

- 使用 `<video>` tag（支援 mp4）或 `<audio>`
- **Seek**：`video.currentTime = offset_ms / 1000`
- **播放片段**：
  ```ts
  video.play()
  setTimeout(() => video.pause(), duration_ms + 200)
  ```
- **需要處理**：
  - 用戶連點時取消上一個 timeout
  - offset 接近結尾時唔好報錯（clamp）
  - iOS / Safari autoplay 限制（要由 user gesture 觸發，click row OK）

---

## 6. Save / Publish Flow（MVP）

按「**Save & Run Analysis**」流程：

1. 前端生成 edited transcript JSON（加 metadata）
2. Call `/api/presign-upload` 拿 `uploadUrl`
3. `PUT` JSON 到 S3
4. Call `/api/trigger-analysis`
5. UI 顯示 `queued` / `done`

### 輪詢（可選）

每 3–5 秒用 `/api/presign-download` 嘗試 GET `analysis.edited.json`：

- `200` → 顯示結果
- `404` → 繼續等
- 超時 → 提示 user refresh later

---

## 7. 環境變數（Vercel）

> Server side env（不 expose 給 client）：

| 變數 | 說明 |
|------|------|
| `AWS_REGION` | AWS region |
| `AWS_ACCESS_KEY_ID` | AWS access key |
| `AWS_SECRET_ACCESS_KEY` | AWS secret key（或改用 IAM role / OIDC） |
| `S3_BUCKET` | Default bucket |
| `SQS_QUEUE_URL` | SQS queue URL |
| `ADMIN_TOKEN` | 保護 API routes |

---

## 8. Security（MVP 可接受）

- API route 檢查 `Authorization: Bearer <ADMIN_TOKEN>`
- S3 presign 僅允許 key prefix：`video-review/`（防止濫用）
- 限制 `content-type`、限制最大 size（edited JSON 一般好細）

---

## 9. Milestones（交付節奏）

| Milestone | 內容 |
|-----------|------|
| **M1** | 讀 transcript + list + click-to-play + toggle speaker（不保存） |
| **M2** | Save to S3（presigned PUT） |
| **M3** | Trigger analysis-only（SQS）+ 輪詢顯示 `analysis.edited.json` |
| **M4** | 批次修改 + 快捷鍵 + diff view（可選） |
