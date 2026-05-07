import type { Trade, Strategy, Account } from './types'

// In-memory cache so the trade-detail modal can render instantly without re-fetching.
const tradesById = new Map<string, Trade>()
const strategiesByAccount = new Map<string, Strategy[]>()
const accountsById = new Map<string, Account>()

export const tradeCache = {
  set(trade: Trade) { tradesById.set(trade.id, trade) },
  setMany(trades: Trade[]) { for (const t of trades) tradesById.set(t.id, t) },
  get(id: string): Trade | undefined { return tradesById.get(id) },

  setStrategies(accountId: string, strategies: Strategy[]) {
    strategiesByAccount.set(accountId, strategies)
  },
  getStrategies(accountId: string): Strategy[] | undefined {
    return strategiesByAccount.get(accountId)
  },

  setAccount(account: Account) { accountsById.set(account.id, account) },
  setAccounts(accounts: Account[]) { for (const a of accounts) accountsById.set(a.id, a) },
  getAccount(id: string): Account | undefined { return accountsById.get(id) },
}
