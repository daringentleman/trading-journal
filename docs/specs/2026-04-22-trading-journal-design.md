# 交易日誌 App — 設計文件

**日期：** 2026-04-22  
**作者：** Darin  
**狀態：** 已核准

---

## 1. 專案概述

一個個人日內交易日誌 Web App，支援兩個獨立帳戶：

- **BingX** — 加密貨幣永續合約（BTC、ETH、SOL 等）
- **Tradovate / Lucid** — 美股指數期貨（NQ、ES micro contracts）

核心目標：交易資料自動進來，交易完只需補充策略標籤與盈虧比，其餘自動計算。

---

## 2. 技術架構

### 服務組成

| 服務 | 用途 | 費用 |
|------|------|------|
| Vercel | 託管 Next.js app | 免費 |
| Supabase | 雲端 PostgreSQL 資料庫 | 免費（500MB） |
| BingX API | 唯讀同步交易記錄 | 免費 |
| TradingView Lightweight Charts | K 線圖渲染 | 免費開源 |

### 架構圖

```
瀏覽器（手機 / 電腦）
    ↓
Vercel — Next.js App
    ├── 前端（React pages + components）
    └── API Routes（serverless functions）
         ├── /api/bingx-sync   → 代理 BingX REST API（解決 CORS）
         ├── /api/bingx-kline  → 抓指定時段 OHLCV 資料
         └── /api/import-csv   → 解析 Tradovate CSV
              ↓
         Supabase（PostgreSQL）
              ├── trades 表
              ├── strategies 表
              └── accounts 表
```

### 部署流程（使用者只需做一次）

1. Fork 或 clone GitHub repo
2. 在 Supabase 建立免費專案，執行初始化 SQL
3. 在 Vercel 連接 repo，填入環境變數（Supabase URL + Key）
4. Deploy — 完成

---

## 3. 資料模型

### `accounts` 表

| 欄位 | 類型 | 說明 |
|------|------|------|
| id | uuid | primary key |
| name | text | 'bingx' 或 'tradovate' |
| initial_capital | numeric | 起始本金（USD） |
| risk_percent | numeric | 每筆風險比例（如 1.0 = 1%） |

### `strategies` 表

| 欄位 | 類型 | 說明 |
|------|------|------|
| id | uuid | primary key |
| account_id | uuid | 所屬帳戶 |
| name | text | 策略名稱（如「推進塊」） |
| sort_order | integer | 顯示順序 |

預設策略：推進塊、OTE、頭肩頂、失敗突破、均線反彈

### `trades` 表

| 欄位 | 類型 | 說明 |
|------|------|------|
| id | uuid | primary key |
| account_id | uuid | 所屬帳戶 |
| external_id | text | BingX 原始訂單 ID（防重複匯入） |
| symbol | text | 商品（BTC/USDT、NQ 等） |
| direction | text | 'long' 或 'short' |
| entry_price | numeric | 進場價格 |
| exit_price | numeric | 出場價格 |
| entry_time | timestamptz | 進場時間 |
| exit_time | timestamptz | 出場時間 |
| quantity | numeric | 倉位大小 |
| pnl | numeric | 損益（USD） |
| risk_used | numeric | 本筆實際風險金額 |
| rr_ratio | numeric | 使用者填入的實際 RR |
| strategy_id | uuid | 策略標籤（可為 null，待填） |
| notes | text | 備註 |
| chart_image_url | text | Tradovate 截圖（存 Supabase Storage） |
| created_at | timestamptz | 建立時間 |

---

## 4. 頁面與功能

### 4.1 總覽頁（Dashboard）

- 帳戶切換：BingX / Tradovate tab
- **同步按鈕**（BingX 專用）：手動觸發抓取最新成交記錄
- **風險管理卡片**：顯示當前本金、風險比例、每筆可虧損 U 數
- **四格統計**：本月損益、勝率、平均 RR、交易次數
- **資產走勢折線圖**：月內每日權益曲線
- 最近 5 筆交易預覽

### 4.2 交易記錄頁

- 帳戶切換
- 按策略標籤篩選（pill 按鈕）
- 每筆顯示：商品、多空方向、進出場價格、進出場時間、持倉時長、策略、RR

### 4.3 交易詳情頁

- 進出場完整資訊（價格 + 精確時間戳）
- 倉位大小、持倉時長
- 風險使用額度（本筆風險 / 帳戶可用額度）
- 策略標籤選擇（單選，可自訂）
- RR 盈虧比輸入
- **K 線圖**：
  - BingX：自動從 BingX API 抓 OHLCV，用 TradingView Lightweight Charts 渲染，自動標進出場箭頭
  - Tradovate：手動上傳 TradingView 截圖
- 備註欄

### 4.4 統計頁

- 帳戶切換
- 月份切換（上月 / 下月）
- 本月資產走勢折線圖
- **策略表現卡片**（2 欄 grid）：每個策略獨立顯示勝率、做單次數、平均 RR、進度條
- 月度複利追蹤表：起始本金 → 月度損益 → 期末結餘，自動串聯每月

### 4.5 設定頁

- BingX API Key + Secret Key 輸入（加密儲存於環境變數）
- Tradovate CSV 上傳
- **策略標籤管理**：顯示現有標籤、× 刪除、輸入框新增（按 Enter 或 + 按鈕）
- **本金與風險設定**：兩個帳戶各自設定起始本金（U）+ 風險比例（%），即時換算每筆可虧損 U 數

---

## 5. BingX 同步邏輯

1. 使用者按「同步」按鈕
2. 前端呼叫 `/api/bingx-sync`
3. Serverless function 用 HMAC-SHA256 簽名呼叫 BingX `/openApi/swap/v2/trade/fillHistory`
4. 過濾掉 `external_id` 已存在的記錄（防重複）
5. 新記錄寫入 Supabase `trades` 表
6. 回傳新增筆數給前端顯示

---

## 6. Tradovate CSV 匯入邏輯

1. 使用者上傳 CSV 檔
2. 呼叫 `/api/import-csv`
3. 解析欄位：Symbol、B/S、Qty、Entry Price、Exit Price、Entry Time、Exit Time、P&L
4. 同樣用 external_id 防重複
5. 寫入 Supabase

---

## 7. 視覺設計

### 色彩系統（4 色）

| 變數 | 色碼 | 用途 |
|------|------|------|
| `--text` | `#f0ead8` | 主文字（鵝黃白） |
| `--accent` | `#c89b3c` | 金色，accent、圖表線、策略標籤 |
| `--profit` | `#16a34a` | 深綠，獲利 |
| `--loss` | `#b91c1c` | 深紅，虧損 |

背景使用純灰階層次：`#08080d` → `#0f0f18` → `#161622`

### 參考風格

Lucid 交易平台視覺語言：極暗底色、低飽和邊框、數字優先、無裝飾元素。

---

## 8. 已確認決策

- **BingX API Key**：存在 Vercel 環境變數，不進資料庫，設定頁只顯示遮罩，需重新部署才能更換
- **月度損益表**：每月獨立計算，固定以使用者設定的起始本金為基準，不自動接上月結餘

---

## 9. 不在範圍內

- 自動背景同步（需付費伺服器）
- 多用戶 / 登入系統
- 情緒標記
- 推播通知
