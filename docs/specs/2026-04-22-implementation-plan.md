# 交易日誌 App — 實作計畫

## 執行順序

### Phase 1 — 基礎建設（先跑起來）

1. **建立 Next.js 專案**
   - `npx create-next-app@latest trading-journal --typescript --tailwind --app`
   - 安裝套件：`@supabase/supabase-js`, `lightweight-charts`, `papaparse`

2. **Supabase 建表**
   執行以下 SQL（在 Supabase Dashboard > SQL Editor）：
   ```sql
   create table accounts (
     id uuid primary key default gen_random_uuid(),
     name text not null,
     initial_capital numeric not null default 10000,
     risk_percent numeric not null default 1.0
   );

   create table strategies (
     id uuid primary key default gen_random_uuid(),
     account_id uuid references accounts(id),
     name text not null,
     sort_order integer default 0
   );

   create table trades (
     id uuid primary key default gen_random_uuid(),
     account_id uuid references accounts(id),
     external_id text unique,
     symbol text not null,
     direction text not null,
     entry_price numeric,
     exit_price numeric,
     entry_time timestamptz,
     exit_time timestamptz,
     quantity numeric,
     pnl numeric,
     risk_used numeric,
     rr_ratio numeric,
     strategy_id uuid references strategies(id),
     notes text,
     chart_image_url text,
     created_at timestamptz default now()
   );
   ```
   插入預設資料：
   ```sql
   insert into accounts (name, initial_capital, risk_percent)
   values ('bingx', 10000, 1.0), ('tradovate', 50000, 0.5);

   insert into strategies (account_id, name, sort_order)
   select id, unnest(array['推進塊','OTE','頭肩頂','失敗突破','均線反彈']),
          generate_series(1,5)
   from accounts where name = 'bingx';
   ```

3. **Vercel 環境變數設定**
   ```
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   BINGX_API_KEY=...
   BINGX_SECRET_KEY=...
   ```

---

### Phase 2 — 後端 API Routes

4. **`/api/bingx-sync`**
   - HMAC-SHA256 簽名 BingX `/openApi/swap/v2/trade/fillHistory`
   - 過濾已存在的 external_id
   - 寫入 Supabase

5. **`/api/bingx-kline`**
   - 接收 symbol、startTime、endTime、interval
   - 代理呼叫 BingX K 線 API
   - 回傳 OHLCV 陣列

6. **`/api/import-csv`**
   - 接收 FormData（CSV 檔案）
   - 用 papaparse 解析 Tradovate 格式
   - 寫入 Supabase

---

### Phase 3 — 前端頁面（依此順序）

7. **設定頁** — 最先做，確保資料能進來
   - 帳戶本金 / 風險% 設定
   - 策略標籤 CRUD
   - CSV 上傳按鈕

8. **總覽頁**
   - 帳戶 tab 切換
   - 同步按鈕
   - 風險管理卡片
   - 四格統計
   - 資產走勢 SVG 折線圖
   - 最近 5 筆交易

9. **交易記錄頁**
   - 列表 + 策略篩選
   - 點進去跳到詳情頁

10. **交易詳情頁**
    - 進出場資訊
    - 策略 / RR 輸入（存回 Supabase）
    - TradingView Lightweight Charts K 線（BingX）
    - 截圖上傳（Tradovate）

11. **統計頁**
    - 月份切換
    - 資產走勢圖
    - 策略卡片 grid
    - 月度損益表

---

### Phase 4 — 部署

12. **推上 GitHub**
13. **Vercel 連接 repo，填環境變數，Deploy**
14. **測試完整流程**：同步 BingX → 補標記 → 看統計

---

## 檔案結構

```
trading-journal/
├── app/
│   ├── page.tsx              # 總覽
│   ├── log/page.tsx          # 記錄
│   ├── trade/[id]/page.tsx   # 詳情
│   ├── stats/page.tsx        # 統計
│   ├── settings/page.tsx     # 設定
│   └── api/
│       ├── bingx-sync/route.ts
│       ├── bingx-kline/route.ts
│       └── import-csv/route.ts
├── components/
│   ├── TradeItem.tsx
│   ├── EquityChart.tsx
│   ├── KLineChart.tsx
│   ├── StrategyCard.tsx
│   └── RiskCard.tsx
├── lib/
│   ├── supabase.ts
│   └── bingx.ts
└── docs/specs/
```
