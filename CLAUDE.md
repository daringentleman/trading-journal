@AGENTS.md

# 交易日誌專案規範

這是 Darin 的專屬交易儀表板，使用 Next.js + Supabase。

## 帳戶結構
- **Prop Firm** (`tradovate`)：Lucid prop firm，初始本金 $50,000
- **Crypto** (`bingx`)：BingX 永續合約，初始本金 $500

## 數據對齊目標
- 目標總 Equity = **$50,679.00**
- Tradovate 淨利 = $635.78，BingX 淨利 = $43.22
- 手續費固定採 **$0.5248/口/單邊**（Lucid 隱含手續費，FIFO 配對後自動扣除）

## CSV 匯入規則（Tradovate）
- 格式：Tradovate Fills CSV（需含 B/S, Contract, Fill Time, filledQty, avgPrice, Status）
- 自動去重：同合約 + 同方向 + 同秒 + 同價格的成交單合併數量
- 自動 FIFO 配對：多空部位逐筆 FIFO 匹配，支援部分平倉與反向開倉
- 自動計算淨利：gross_pnl - fee（fee = qty × $0.5248 × 2）
- 合約點值：MNQ=$2, MES=$5, MGC=$10, MYM=$0.5, NQ=$20, ES=$50

## 合約點值
| 合約前綴 | 每點美元 |
|---------|---------|
| MNQ     | $2      |
| MES     | $5      |
| MGC     | $10     |
| MYM     | $0.5    |
| NQ      | $20     |
| ES      | $50     |
