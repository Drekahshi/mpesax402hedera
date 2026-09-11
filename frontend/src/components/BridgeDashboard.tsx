'use client';

import { useState, useEffect } from 'react';
import { useAccount, useBalance, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseEther, formatUnits } from 'viem';
import { 
  ArrowUpRight, 
  ArrowDownLeft, 
  Send, 
  History, 
  Smartphone, 
  DollarSign, 
  RefreshCw, 
  ExternalLink,
  Wallet,
  Play
} from 'lucide-react';
import WalletConnectModal from './WalletConnectModal';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_API_URL || 'http://localhost:8000';
const NIT_TOKEN_ADDRESS = process.env.NEXT_PUBLIC_NITOKEN_ADDRESS || '0xE1b62649b183617300c3F16cfB47cFEc83130c0B';

export default function BridgeDashboard() {
  const { address, isConnected } = useAccount();
  const { data: ethBalance, refetch: refetchNative } = useBalance({ address });
  
  const [nitBalance, setNitBalance] = useState<number>(0);
  const [isFetchingNit, setIsFetchingNit] = useState(false);
  const [activeTab, setActiveTab] = useState<'deposit' | 'withdraw' | 'transfer' | 'history'>('deposit');
  const [showWalletModal, setShowWalletModal] = useState(false);

  // Form states
  const [depositAmount, setDepositAmount] = useState('');
  const [depositPhone, setDepositPhone] = useState('');
  const [depositStatus, setDepositStatus] = useState<{ type: 'idle' | 'loading' | 'success' | 'error', message: string, orderId?: number, checkoutId?: string }>({ type: 'idle', message: '' });

  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawPhone, setWithdrawPhone] = useState('');
  const [withdrawStatus, setWithdrawStatus] = useState<{ type: 'idle' | 'loading' | 'success' | 'error', message: string }>({ type: 'idle', message: '' });

  const [transferAmount, setTransferAmount] = useState('');
  const [transferTo, setTransferTo] = useState('');
  const [transferStatus, setTransferStatus] = useState<{ type: 'idle' | 'loading' | 'success' | 'error', message: string, txHash?: string }>({ type: 'idle', message: '' });

  const [history, setHistory] = useState<any[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [isSimulatingMpesa, setIsSimulatingMpesa] = useState(false);

  const { writeContractAsync } = useWriteContract();

  // Fetch balances
  const fetchNitBalance = async () => {
    if (!address) return;
    setIsFetchingNit(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/wallet/balance/${address}/`);
      if (res.ok) {
        const data = await res.json();
        setNitBalance(data.balance_nit || 0);
      }
    } catch (e) {
      console.error('Failed to fetch NIT balance from bridge backend:', e);
    } finally {
      setIsFetchingNit(false);
    }
  };

  // Fetch History
  const fetchHistory = async () => {
    if (!address) return;
    setIsHistoryLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/payments/history/?wallet_address=${address}`);
      if (res.ok) {
        const data = await res.json();
        setHistory(data);
      }
    } catch (e) {
      console.error('Failed to fetch history:', e);
    } finally {
      setIsHistoryLoading(false);
    }
  };

  const handleRefresh = () => {
    refetchNative();
    fetchNitBalance();
    fetchHistory();
  };

  useEffect(() => {
    if (isConnected && address) {
      handleRefresh();
    }
  }, [isConnected, address]);

  // STK Push Deposit
  const handleDepositSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!address) return;
    setDepositStatus({ type: 'loading', message: 'Sending STK Push request to M-Pesa...' });

    try {
      const res = await fetch(`${BACKEND_URL}/api/payments/pay/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount_kes: Number(depositAmount),
          phone_number: depositPhone,
          wallet_address: address
        })
      });

      const data = await res.json();
      if (res.ok && data.status === 'STK_SENT') {
        setDepositStatus({ 
          type: 'success', 
          message: 'STK push sent! Please enter your M-Pesa PIN on your phone to complete.',
          orderId: data.order_id,
          // Extract order request temp id or checkout id from backend mock or logic
          checkoutId: `TEMP_${data.order_id}` // Django uses order.id inside initiate_stk_push mock
        });
        handleRefresh();
      } else {
        setDepositStatus({ type: 'error', message: data.error || 'Failed to initiate M-Pesa STK push.' });
      }
    } catch (err: any) {
      setDepositStatus({ type: 'error', message: err.message || 'Server error. Is the Python backend running?' });
    }
  };

  // Simulate payment callback for local developer workflow
  const handleSimulatePaymentCallback = async (success: boolean) => {
    if (!depositStatus.orderId) return;
    setIsSimulatingMpesa(true);
    try {
      // First get the order details from backend to find checkout_request_id
      // In local debug we can pass checkout_request_id directly or get it
      // Let's call mock-callback endpoint on django backend
      // We will need order's checkout_request_id. Let's try checkout_request_id: TEMP_<id> as structured in Django
      const checkoutRequestId = `TEMP_${depositStatus.orderId}`;
      const res = await fetch(`${BACKEND_URL}/api/payments/mock-callback/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          checkout_request_id: checkoutRequestId,
          status: success ? 'SUCCESS' : 'FAILED'
        })
      });
      const data = await res.json();
      if (res.ok) {
        setDepositStatus(prev => ({
          ...prev,
          type: success ? 'success' : 'error',
          message: success 
            ? 'Success callback simulated! ' + (data.message || 'M-Pesa payment received and tokens minted.')
            : 'Fail callback simulated: ' + (data.message || 'Callback marked as failed.')
        }));
        handleRefresh();
      } else {
        alert(data.error || 'Simulate callback failed.');
      }
    } catch (e) {
      console.error(e);
      alert('Network error simulating callback');
    } finally {
      setIsSimulatingMpesa(false);
    }
  };

  // Withdraw (Burn & Send B2C KES)
  const handleWithdrawSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!address) return;
    setWithdrawStatus({ type: 'loading', message: 'Processing withdrawal...' });

    try {
      const res = await fetch(`${BACKEND_URL}/api/wallet/withdraw/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: Number(withdrawAmount),
          phone_number: withdrawPhone,
          wallet_address: address
        })
      });

      const data = await res.json();
      if (res.ok && data.result) {
        setWithdrawStatus({ 
          type: 'success', 
          message: data.message || 'Withdrawal initiated successfully! You will receive KES shortly.' 
        });
        setWithdrawAmount('');
        handleRefresh();
      } else {
        setWithdrawStatus({ type: 'error', message: data.error || 'Failed to initiate withdrawal.' });
      }
    } catch (err: any) {
      setWithdrawStatus({ type: 'error', message: err.message || 'Server connection error.' });
    }
  };

  // On-Chain EVM Transfer -> Record in django
  const handleTransferSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!address) return;
    setTransferStatus({ type: 'loading', message: 'Requesting wallet signature for transaction...' });

    try {
      // 1. Write the transfer transaction to the blockchain using MetaMask/Core
      const txHash = await writeContractAsync({
        address: NIT_TOKEN_ADDRESS as `0x${string}`,
        abi: [
          {
            name: 'transfer',
            type: 'function',
            stateMutability: 'nonpayable',
            inputs: [
              { name: 'recipient', type: 'address' },
              { name: 'amount', type: 'uint256' },
            ],
            outputs: [{ name: '', type: 'bool' }],
          },
        ],
        functionName: 'transfer',
        args: [transferTo as `0x${string}`, parseEther(transferAmount)],
      });

      setTransferStatus({ 
        type: 'loading', 
        message: 'Transaction sent to Ethereum & Hedera! Recording transfer in Django backend history...',
        txHash 
      });

      // 2. Report it to backend database so history lists it
      const res = await fetch(`${BACKEND_URL}/api/wallet/transfer/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet_address: address,
          to_address: transferTo,
          amount: Number(transferAmount),
          tx_hash: txHash
        })
      });

      if (res.ok) {
        setTransferStatus({ 
          type: 'success', 
          message: `Transfer completed & recorded! Tx Hash: ${txHash.slice(0, 10)}...`,
          txHash
        });
        setTransferAmount('');
        setTransferTo('');
        handleRefresh();
      } else {
        const errorData = await res.json();
        setTransferStatus({ 
          type: 'success', 
          message: `Transfer executed on-chain, but failed to record in DB history: ${JSON.stringify(errorData)}`,
          txHash
        });
      }
    } catch (err: any) {
      console.error(err);
      setTransferStatus({ type: 'error', message: err.message || 'Transfer failed or was rejected.' });
    }
  };

  return (
    <div className="w-full max-w-lg mx-auto p-4 sm:p-6 pb-20">
      
      {/* ── HEADER & NETWORK BRANDING ── */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-red-600 to-red-400 flex items-center justify-center shadow-lg text-white font-extrabold text-lg">
            A
          </div>
          <div>
            <h1 className="text-lg font-black text-white tracking-wider glow-text-gold shimmer-text">
              CROSS-CHAIN X402 BRIDGE
            </h1>
            <p className="text-[10px] text-white/40 tracking-wider">
              KAI NUVARI WEALTH BRIDGE · ETHEREUM & HEDERA
            </p>
          </div>
        </div>

        {isConnected ? (
          <button 
            onClick={() => setShowWalletModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-full border border-emerald-500/30 text-emerald-400 text-xs font-semibold bg-emerald-500/10 hover:bg-emerald-500/20 transition-all cursor-pointer"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            {address?.slice(0, 6)}...{address?.slice(-4)}
          </button>
        ) : (
          <button 
            onClick={() => setShowWalletModal(true)}
            className="btn-gold px-5 py-2.5 rounded-full text-xs"
          >
            Connect MetaMask / Core
          </button>
        )}
      </div>

      {/* ── BALANCES WIDGET ── */}
      {isConnected && (
        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="glass-panel p-4 rounded-2xl flex flex-col justify-between h-28 relative overflow-hidden">
            <span className="text-[10px] font-bold text-white/40 tracking-wider">GAS BALANCE</span>
            <div className="mt-2">
              <span className="text-xl font-black text-white glow-text-gold">
                {ethBalance ? Number(formatUnits(ethBalance.value, ethBalance.decimals)).toFixed(4) : '0.0000'}
              </span>
              <span className="text-[10px] text-white/50 ml-1 font-bold">ETH</span>
            </div>
            <div className="absolute right-3 bottom-3 text-red-500/15 text-5xl font-black select-none pointer-events-none">
              ETH
            </div>
          </div>

          <div className="glass-panel p-4 rounded-2xl flex flex-col justify-between h-28 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-white/40 tracking-wider">STABLECOIN BALANCE</span>
              <button 
                onClick={handleRefresh}
                className="text-white/40 hover:text-white transition-colors cursor-pointer"
                disabled={isFetchingNit}
              >
                <RefreshCw size={12} className={isFetchingNit ? "animate-spin" : ""} />
              </button>
            </div>
            <div className="mt-2">
              <span className="text-xl font-black text-gold-base glow-text-gold">
                {Number(nitBalance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className="text-[10px] text-gold-base/70 ml-1 font-bold">NIT</span>
            </div>
            <div className="absolute right-3 bottom-3 text-gold-base/5 text-5xl font-black select-none pointer-events-none">
              NIT
            </div>
          </div>
        </div>
      )}

      {/* ── TAB BAR ── */}
      <div className="flex rounded-xl bg-black/40 border border-white/10 p-1 mb-6">
        {[
          { id: 'deposit', label: 'Deposit', icon: ArrowDownLeft },
          { id: 'withdraw', label: 'Withdraw', icon: ArrowUpRight },
          { id: 'transfer', label: 'Transfer', icon: Send },
          { id: 'history', label: 'History', icon: History }
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                isActive 
                  ? 'bg-gradient-to-tr from-gold-base to-gold-dark text-black shadow-md' 
                  : 'text-white/60 hover:text-white hover:bg-white/5'
              }`}
            >
              <Icon size={14} />
              <span className="hidden min-[360px]:inline">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ── TAB CONTENT ── */}
      {!isConnected ? (
        <div className="glass-panel p-8 rounded-2xl text-center flex flex-col items-center justify-center border border-white/5">
          <Wallet className="w-12 h-12 text-gold-base/50 mb-3 float-anim" />
          <h3 className="font-bold text-white mb-2">Wallet Connection Required</h3>
          <p className="text-xs text-white/50 max-w-xs mb-5">
            Connect your MetaMask or Web3 Wallets to perform gas-in deposits, withdrawals, or on-chain stablecoin transactions.
          </p>
          <button 
            onClick={() => setShowWalletModal(true)}
            className="btn-gold px-6 py-3 rounded-xl text-xs font-bold w-full max-w-[200px]"
          >
            Connect Wallet
          </button>
        </div>
      ) : (
        <div className="glass-panel p-5 rounded-2xl border border-white/5">
          
          {/* 1. DEPOSIT (M-Pesa -> Sepolia Stablecoin) */}
          {activeTab === 'deposit' && (
            <form onSubmit={handleDepositSubmit} className="space-y-4">
              <div>
                <h3 className="text-sm font-bold text-white mb-1">M-Pesa STK Push Deposit</h3>
                <p className="text-[11px] text-white/50">
                  Fund your wallet by paying KES via M-Pesa. 1 KES = 1 NIT token minted directly.
                </p>
              </div>

              <div className="space-y-3">
                <div className="relative">
                  <Smartphone className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" size={16} />
                  <input
                    type="tel"
                    placeholder="Phone Number (e.g. 254712345678)"
                    value={depositPhone}
                    onChange={(e) => setDepositPhone(e.target.value)}
                    required
                    className="w-full pl-10 pr-4 py-3 glass-input text-sm"
                  />
                </div>

                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" size={16} />
                  <input
                    type="number"
                    placeholder="Amount in KES (Min: 1 KES)"
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    required
                    min="1"
                    className="w-full pl-10 pr-4 py-3 glass-input text-sm"
                  />
                </div>
              </div>

              <button 
                type="submit" 
                disabled={depositStatus.type === 'loading'}
                className="btn-gold w-full py-3.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2"
              >
                {depositStatus.type === 'loading' ? (
                  <RefreshCw size={14} className="animate-spin" />
                ) : null}
                Initiate M-Pesa STK Push
              </button>

              {/* Status alerts */}
              {depositStatus.type !== 'idle' && (
                <div className={`p-4 rounded-xl text-xs border ${
                  depositStatus.type === 'error' 
                    ? 'text-red-400 bg-red-500/10 border-red-500/20' 
                    : depositStatus.type === 'success' 
                      ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' 
                      : 'text-gold-base bg-gold-base/5 border-gold-base/10'
                }`}>
                  <p>{depositStatus.message}</p>
                  
                  {/* Local testing helper: Simulate payment callback */}
                  {depositStatus.type === 'success' && depositStatus.orderId && (
                    <div className="mt-4 pt-3 border-t border-white/10 flex flex-col gap-2">
                      <p className="text-[10px] text-white/40">
                        LOCAL DEV MOCK TOOL: Since M-Pesa is mocked on the Python backend, click below to simulate the Safaricom Callback:
                      </p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleSimulatePaymentCallback(true)}
                          disabled={isSimulatingMpesa}
                          className="flex-1 py-2 px-3 bg-emerald-500 hover:bg-emerald-600 text-black font-bold rounded-lg text-[10px] flex items-center justify-center gap-1 cursor-pointer"
                        >
                          <Play size={10} /> Simulate Callback Success
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSimulatePaymentCallback(false)}
                          disabled={isSimulatingMpesa}
                          className="py-2 px-3 bg-red-500/20 hover:bg-red-500/40 text-red-300 font-semibold rounded-lg text-[10px] cursor-pointer"
                        >
                          Simulate Fail
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </form>
          )}

          {/* 2. WITHDRAW (Stablecoin -> M-Pesa B2C KES) */}
          {activeTab === 'withdraw' && (
            <form onSubmit={handleWithdrawSubmit} className="space-y-4">
              <div>
                <h3 className="text-sm font-bold text-white mb-1">M-Pesa B2C Withdrawal</h3>
                <p className="text-[11px] text-white/50">
                  Burn your NIT stablecoin tokens and receive cash directly in your M-Pesa wallet.
                </p>
              </div>

              <div className="space-y-3">
                <div className="relative">
                  <Smartphone className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" size={16} />
                  <input
                    type="tel"
                    placeholder="Phone Number (e.g. 254712345678)"
                    value={withdrawPhone}
                    onChange={(e) => setWithdrawPhone(e.target.value)}
                    required
                    className="w-full pl-10 pr-4 py-3 glass-input text-sm"
                  />
                </div>

                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" size={16} />
                  <input
                    type="number"
                    placeholder="Amount to Withdraw (NIT)"
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                    required
                    max={nitBalance}
                    min="1"
                    className="w-full pl-10 pr-4 py-3 glass-input text-sm"
                  />
                </div>
              </div>

              <button 
                type="submit" 
                disabled={withdrawStatus.type === 'loading' || Number(withdrawAmount) > nitBalance}
                className="btn-gold w-full py-3.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {withdrawStatus.type === 'loading' ? (
                  <RefreshCw size={14} className="animate-spin" />
                ) : null}
                Withdraw to M-Pesa (Burn NIT)
              </button>

              {withdrawStatus.type !== 'idle' && (
                <div className={`p-4 rounded-xl text-xs border ${
                  withdrawStatus.type === 'error' 
                    ? 'text-red-400 bg-red-500/10 border-red-500/20' 
                    : withdrawStatus.type === 'success' 
                      ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' 
                      : 'text-gold-base bg-gold-base/5 border-gold-base/10'
                }`}>
                  {withdrawStatus.message}
                </div>
              )}
            </form>
          )}

          {/* 3. TRANSFER (Crypto P2P On-chain) */}
          {activeTab === 'transfer' && (
            <form onSubmit={handleTransferSubmit} className="space-y-4">
              <div>
                <h3 className="text-sm font-bold text-white mb-1">On-Chain P2P Transfer</h3>
                <p className="text-[11px] text-white/50">
                  Transfer NIT stablecoins directly to another EVM address on Ethereum & Hedera. Requires ETH for gas.
                </p>
              </div>

              <div className="space-y-3">
                <div>
                  <input
                    type="text"
                    placeholder="Recipient Wallet Address (0x...)"
                    value={transferTo}
                    onChange={(e) => setTransferTo(e.target.value)}
                    required
                    pattern="^0x[a-fA-F0-9]{40}$"
                    className="w-full px-4 py-3 glass-input text-sm"
                  />
                </div>

                <div className="relative">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" size={16} />
                  <input
                    type="number"
                    placeholder="Amount to Transfer (NIT)"
                    value={transferAmount}
                    onChange={(e) => setTransferAmount(e.target.value)}
                    required
                    max={nitBalance}
                    min="0.0001"
                    step="any"
                    className="w-full pl-10 pr-4 py-3 glass-input text-sm"
                  />
                </div>
              </div>

              <button 
                type="submit" 
                disabled={transferStatus.type === 'loading' || Number(transferAmount) > nitBalance}
                className="btn-gold w-full py-3.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2"
              >
                {transferStatus.type === 'loading' ? (
                  <RefreshCw size={14} className="animate-spin" />
                ) : null}
                Confirm & Sign Transfer
              </button>

              {transferStatus.type !== 'idle' && (
                <div className={`p-4 rounded-xl text-xs border ${
                  transferStatus.type === 'error' 
                    ? 'text-red-400 bg-red-500/10 border-red-500/20' 
                    : transferStatus.type === 'success' 
                      ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' 
                      : 'text-gold-base bg-gold-base/5 border-gold-base/10'
                }`}>
                  <p>{transferStatus.message}</p>
                  {transferStatus.txHash && (
                    <a 
                      href={`https://sepolia.etherscan.io/tx/${transferStatus.txHash}`} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="mt-2 text-gold-base font-bold flex items-center gap-1 hover:underline"
                    >
                      View on Etherscan <ExternalLink size={12} />
                    </a>
                  )}
                </div>
              )}
            </form>
          )}

          {/* 4. HISTORY (Recent Transactions) */}
          {activeTab === 'history' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white">Transaction History</h3>
                  <p className="text-[10px] text-white/50">Recent cash-in/out and transfers</p>
                </div>
                <button 
                  onClick={fetchHistory}
                  className="text-white/40 hover:text-white transition-colors cursor-pointer"
                  disabled={isHistoryLoading}
                >
                  <RefreshCw size={12} className={isHistoryLoading ? "animate-spin" : ""} />
                </button>
              </div>

              {isHistoryLoading ? (
                <div className="py-8 flex justify-center">
                  <RefreshCw size={24} className="animate-spin text-gold-base" />
                </div>
              ) : history.length === 0 ? (
                <div className="py-8 text-center text-xs text-white/45">
                  No transaction records found on this address.
                </div>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {history.map((tx) => {
                    const isDeposit = tx.type === 'DEPOSIT';
                    const isCompleted = tx.status === 'COMPLETED' || tx.status === 'PAID';
                    const isFailed = tx.status === 'FAILED';
                    
                    return (
                      <div 
                        key={tx.id} 
                        className="flex items-center justify-between p-3 bg-black/35 rounded-xl border border-white/5 hover:border-white/10 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm ${
                            isDeposit ? 'bg-emerald-500/10 text-emerald-400' : 'bg-blue-500/10 text-blue-400'
                          }`}>
                            {isDeposit ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}
                          </div>
                          <div>
                            <p className="text-xs font-bold text-white">
                              {isDeposit ? 'M-Pesa Cash-In' : 'On-Chain Transfer'}
                            </p>
                            <p className="text-[9px] text-white/40">
                              {new Date(tx.created_at).toLocaleString()}
                            </p>
                          </div>
                        </div>
                        
                        <div className="text-right">
                          <p className={`text-xs font-black ${isDeposit ? 'text-emerald-400' : 'text-blue-400'}`}>
                            {isDeposit ? '+' : '-'}{Number(tx.amount).toFixed(2)} NIT
                          </p>
                          <span className={`inline-block px-1.5 py-0.5 rounded text-[8px] font-bold ${
                            isCompleted 
                              ? 'bg-emerald-500/15 text-emerald-400' 
                              : isFailed 
                                ? 'bg-red-500/15 text-red-400' 
                                : 'bg-gold-base/15 text-gold-base animate-pulse'
                          }`}>
                            {tx.status}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
          
        </div>
      )}

      {/* Wallet Selector Modal */}
      {showWalletModal && (
        <WalletConnectModal onClose={() => setShowWalletModal(false)} />
      )}

    </div>
  );
}
