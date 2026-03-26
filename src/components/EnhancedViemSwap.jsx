'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  createWalletClient,
  createPublicClient,
  http,
  parseUnits,
  formatUnits,
  custom
} from 'viem';
import { arbitrum } from 'viem/chains';

const TOKENS = {
  USD24: {
    address: '0xbe00f3db78688d9704bcb4e0a827aea3a9cc0d62',
    symbol: 'USD24',
    decimals: 2,
    color: '#AF52DE',
    label: 'Fiat24 USD',
  },
  USDC: {
    address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    symbol: 'USDC',
    decimals: 6,
    color: '#2775CA',
    label: 'USD Coin',
  },
};

const UNISWAP_V3_CONFIG = {
  SWAP_ROUTER_ADDRESS: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45',
  QUOTER_ADDRESS: '0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6',
  POOL_ADDRESS: '0xef8cd93baf5d97d9d4da15263c56995038432db8',
  POOL_FEE: 100,
};

const ERC20_ABI = [
  {
    constant: true,
    inputs: [{ name: 'owner', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    type: 'function'
  },
  {
    constant: true,
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' }
    ],
    name: 'allowance',
    outputs: [{ name: '', type: 'uint256' }],
    type: 'function'
  },
  {
    constant: false,
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' }
    ],
    name: 'approve',
    outputs: [{ name: '', type: 'bool' }],
    type: 'function'
  }
];

const QUOTER_ABI = [
  {
    inputs: [
      { name: 'tokenIn', type: 'address' },
      { name: 'tokenOut', type: 'address' },
      { name: 'fee', type: 'uint24' },
      { name: 'amountIn', type: 'uint256' },
      { name: 'sqrtPriceLimitX96', type: 'uint160' }
    ],
    name: 'quoteExactInputSingle',
    outputs: [{ name: 'amountOut', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function'
  }
];

const SWAP_ROUTER_ABI = [
  {
    inputs: [
      {
        components: [
          { name: 'tokenIn', type: 'address' },
          { name: 'tokenOut', type: 'address' },
          { name: 'fee', type: 'uint24' },
          { name: 'recipient', type: 'address' },
          { name: 'amountIn', type: 'uint256' },
          { name: 'amountOutMinimum', type: 'uint256' },
          { name: 'sqrtPriceLimitX96', type: 'uint160' }
        ],
        name: 'params',
        type: 'tuple'
      }
    ],
    name: 'exactInputSingle',
    outputs: [{ name: 'amountOut', type: 'uint256' }],
    stateMutability: 'payable',
    type: 'function'
  }
];

const POOL_ABI = [
  {
    inputs: [],
    name: 'slot0',
    outputs: [
      { name: 'sqrtPriceX96', type: 'uint160' },
      { name: 'tick', type: 'int24' },
      { name: 'observationIndex', type: 'uint16' },
      { name: 'observationCardinality', type: 'uint16' },
      { name: 'observationCardinalityNext', type: 'uint16' },
      { name: 'feeProtocol', type: 'uint8' },
      { name: 'unlocked', type: 'bool' }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'liquidity',
    outputs: [{ name: '', type: 'uint128' }],
    stateMutability: 'view',
    type: 'function'
  }
];

// === Token Icon Component ===
function TokenIcon({ token, size = 36 }) {
  if (token === 'USDC') {
    return (
      <svg className="flex-shrink-0" width={size} height={size} viewBox="0 0 2000 2000" fill="none">
        <path d="M1000 2000c554.17 0 1000-445.83 1000-1000S1554.17 0 1000 0 0 445.83 0 1000s445.83 1000 1000 1000z" fill="#2775CA"/>
        <path d="M1275 1158.33c0-145.83-87.5-195.83-262.5-216.66-125-16.67-150-50-150-108.34s41.67-95.83 125-95.83c75 0 116.67 25 137.5 87.5 4.17 12.5 16.67 20.83 29.17 20.83h66.66c16.67 0 29.17-12.5 29.17-29.16v-4.17c-16.67-91.67-91.67-162.5-187.5-170.83v-100c0-16.67-12.5-29.17-33.33-33.34h-62.5c-16.67 0-29.17 12.5-33.34 33.34v95.83c-125 16.67-204.16 100-204.16 204.17 0 137.5 83.33 191.66 258.33 212.5 116.67 20.83 154.17 45.83 154.17 112.5s-58.34 112.5-137.5 112.5c-108.34 0-145.84-45.84-158.34-108.34-4.16-16.66-16.66-25-29.16-25h-70.84c-16.66 0-29.16 12.5-29.16 29.17v4.17c16.66 104.16 83.33 179.16 220.83 200v100c0 16.66 12.5 29.16 33.33 33.33h62.5c16.67 0 29.17-12.5 33.34-33.33v-100c125-20.84 208.33-108.34 208.33-220.84z" fill="#fff"/>
        <path d="M787.5 1595.83c-325-116.66-491.67-479.16-370.83-800 62.5-175 200-308.33 370.83-370.83 16.67-8.33 25-20.83 25-41.67V325c0-16.67-8.33-29.17-25-33.33-4.17 0-12.5 0-16.67 4.16-395.83 125-612.5 545.84-487.5 941.67 75 233.33 254.17 412.5 487.5 487.5 16.67 8.33 33.34 0 37.5-16.67 4.17-4.16 4.17-8.33 4.17-16.66v-58.34c0-12.5-12.5-29.16-25-37.5zM1229.17 295.83c-16.67-8.33-33.34 0-37.5 16.67-4.17 4.17-4.17 8.33-4.17 16.67v58.33c0 16.67 12.5 33.33 25 41.67 325 116.66 491.67 479.16 370.83 800-62.5 175-200 308.33-370.83 370.83-16.67 8.33-25 20.83-25 41.67V1700c0 16.67 8.33 29.17 25 33.33 4.17 0 12.5 0 16.67-4.16 395.83-125 612.5-545.84 487.5-941.67-75-237.5-258.34-416.67-487.5-491.67z" fill="#fff"/>
      </svg>
    );
  }
  // USD24 - use CoinGecko hosted logo
  return (
    <img
      src="https://assets.coingecko.com/coins/images/25598/standard/USD24.png?1696524732"
      alt="USD24"
      className="flex-shrink-0 rounded-full"
      width={size}
      height={size}
    />
  );
}

// === Main Component ===
export default function EnhancedViemSwap() {
  const [account, setAccount] = useState(null);
  const [balances, setBalances] = useState({});
  const [allowances, setAllowances] = useState({});
  const [fromToken, setFromToken] = useState('USDC');
  const [toToken, setToToken] = useState('USD24');
  const [inputAmount, setInputAmount] = useState('');
  const [outputAmount, setOutputAmount] = useState('');
  const [slippage, setSlippage] = useState('0.5');
  const [isLoading, setIsLoading] = useState(false);
  const [isQuoting, setIsQuoting] = useState(false);
  const [exchangeRate, setExchangeRate] = useState(null);
  const [priceImpact, setPriceImpact] = useState(0);
  const [error, setError] = useState('');
  const [transactionHistory, setTransactionHistory] = useState([]);
  const [poolBalances, setPoolBalances] = useState({});
  const [currentPrice, setCurrentPrice] = useState(null);
  const [showSettings, setShowSettings] = useState(false);

  const publicClient = createPublicClient({
    chain: arbitrum,
    transport: http()
  });

  const fromTokenData = TOKENS[fromToken];
  const toTokenData = TOKENS[toToken];

  const connectWallet = async () => {
    try {
      if (!window.ethereum) {
        setError('请安装 MetaMask 钱包');
        return;
      }
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      const address = accounts[0];
      setAccount(address);
      await loadBalances(address);
    } catch (err) {
      setError('连接钱包失败: ' + err.message);
    }
  };

  const loadBalances = async (address) => {
    try {
      const [
        usd24Balance, usdcBalance, usd24Allowance, usdcAllowance,
        poolUsd24Balance, poolUsdcBalance, slot0Data, liquidity
      ] = await Promise.all([
        publicClient.readContract({ address: TOKENS.USD24.address, abi: ERC20_ABI, functionName: 'balanceOf', args: [address] }),
        publicClient.readContract({ address: TOKENS.USDC.address, abi: ERC20_ABI, functionName: 'balanceOf', args: [address] }),
        publicClient.readContract({ address: TOKENS.USD24.address, abi: ERC20_ABI, functionName: 'allowance', args: [address, UNISWAP_V3_CONFIG.SWAP_ROUTER_ADDRESS] }),
        publicClient.readContract({ address: TOKENS.USDC.address, abi: ERC20_ABI, functionName: 'allowance', args: [address, UNISWAP_V3_CONFIG.SWAP_ROUTER_ADDRESS] }),
        publicClient.readContract({ address: TOKENS.USD24.address, abi: ERC20_ABI, functionName: 'balanceOf', args: [UNISWAP_V3_CONFIG.POOL_ADDRESS] }),
        publicClient.readContract({ address: TOKENS.USDC.address, abi: ERC20_ABI, functionName: 'balanceOf', args: [UNISWAP_V3_CONFIG.POOL_ADDRESS] }),
        publicClient.readContract({ address: UNISWAP_V3_CONFIG.POOL_ADDRESS, abi: POOL_ABI, functionName: 'slot0' }),
        publicClient.readContract({ address: UNISWAP_V3_CONFIG.POOL_ADDRESS, abi: POOL_ABI, functionName: 'liquidity' })
      ]);
      setBalances({ USD24: formatUnits(usd24Balance, TOKENS.USD24.decimals), USDC: formatUnits(usdcBalance, TOKENS.USDC.decimals) });
      setAllowances({ USD24: usd24Allowance.toString(), USDC: usdcAllowance.toString() });
      setPoolBalances({ USD24: formatUnits(poolUsd24Balance, TOKENS.USD24.decimals), USDC: formatUnits(poolUsdcBalance, TOKENS.USDC.decimals) });
      const sqrtPriceX96 = slot0Data[0];
      const price = calculatePriceFromSqrtX96(sqrtPriceX96);
      setCurrentPrice(price);
    } catch (err) {
      console.error('加载余额失败:', err);
      setError('加载余额失败: ' + err.message);
    }
  };

  const calculatePriceFromSqrtX96 = (sqrtPriceX96) => {
    const sqrtPrice = Number(sqrtPriceX96) / Math.pow(2, 96);
    const rawPrice = sqrtPrice * sqrtPrice;
    const precisionAdjustment = Math.pow(10, TOKENS.USDC.decimals - TOKENS.USD24.decimals);
    return rawPrice * precisionAdjustment;
  };

  const getQuote = useCallback(async (amount, from, to) => {
    if (!amount || parseFloat(amount) === 0 || !from || !to) {
      setOutputAmount('');
      setExchangeRate(null);
      setPriceImpact(0);
      return;
    }
    setIsQuoting(true);
    setError('');
    try {
      const fromTokenInfo = TOKENS[from];
      const toTokenInfo = TOKENS[to];
      const amountIn = parseUnits(amount, fromTokenInfo.decimals);
      const quote = await publicClient.readContract({
        address: UNISWAP_V3_CONFIG.QUOTER_ADDRESS, abi: QUOTER_ABI, functionName: 'quoteExactInputSingle',
        args: [fromTokenInfo.address, toTokenInfo.address, UNISWAP_V3_CONFIG.POOL_FEE, amountIn, 0n],
      });
      const formattedOutput = formatUnits(quote, toTokenInfo.decimals);
      setOutputAmount(formattedOutput);
      const rate = parseFloat(formattedOutput) / parseFloat(amount);
      setExchangeRate(rate);
      if (currentPrice) {
        const marketPrice = from === 'USD24' ? currentPrice : 1 / currentPrice;
        const impact = Math.abs((rate - marketPrice) / marketPrice * 100);
        setPriceImpact(impact);
      } else {
        setPriceImpact(Math.abs((rate - 1) * 100));
      }
    } catch (err) {
      console.error('获取报价失败:', err);
      let fallbackRate;
      if (currentPrice) {
        fallbackRate = from === 'USD24' ? currentPrice * 0.999 : (1 / currentPrice) * 0.999;
      } else {
        fallbackRate = from === 'USD24' ? 0.998 : 1.002;
      }
      const fallbackOutput = (parseFloat(amount) * fallbackRate).toFixed(toTokenData.decimals);
      setOutputAmount(fallbackOutput);
      setExchangeRate(fallbackRate);
      if (currentPrice) {
        const marketPrice = from === 'USD24' ? currentPrice : 1 / currentPrice;
        const impact = Math.abs((fallbackRate - marketPrice) / marketPrice * 100);
        setPriceImpact(impact);
      } else {
        setPriceImpact(Math.abs((fallbackRate - 1) * 100));
      }
    }
    setIsQuoting(false);
  }, [publicClient, toTokenData.decimals, currentPrice, poolBalances]);

  useEffect(() => {
    const debounceTimer = setTimeout(() => { getQuote(inputAmount, fromToken, toToken); }, 1000);
    return () => clearTimeout(debounceTimer);
  }, [inputAmount, fromToken, toToken, getQuote]);

  const handleInputChange = (value) => setInputAmount(value);

  const switchTokens = () => {
    setFromToken(toToken);
    setToToken(fromToken);
    setInputAmount('');
    setOutputAmount('');
    setExchangeRate(null);
    setPriceImpact(0);
    setError('');
  };

  const needsApproval = () => {
    if (!inputAmount || !allowances[fromToken]) return false;
    try {
      const amount = parseUnits(inputAmount, fromTokenData.decimals);
      return BigInt(allowances[fromToken]) < amount;
    } catch { return false; }
  };

  const hasInsufficientBalance = () => {
    if (!inputAmount || !balances[fromToken]) return false;
    return parseFloat(inputAmount) > parseFloat(balances[fromToken]);
  };

  const approve = async () => {
    if (!account) return;
    setIsLoading(true);
    setError('');
    try {
      const walletClient = createWalletClient({ chain: arbitrum, transport: custom(window.ethereum), account });
      const maxAmount = fromTokenData.decimals === 2 ? parseUnits('10000000', 2) : parseUnits('10000000', 6);
      const hash = await walletClient.writeContract({ address: fromTokenData.address, abi: ERC20_ABI, functionName: 'approve', args: [UNISWAP_V3_CONFIG.SWAP_ROUTER_ADDRESS, maxAmount] });
      await publicClient.waitForTransactionReceipt({ hash });
      await loadBalances(account);
      setError('');
    } catch (err) {
      console.error('授权失败:', err);
      setError('授权失败: ' + err.message);
    }
    setIsLoading(false);
  };

  const swap = async () => {
    if (!account || !inputAmount || !outputAmount) return;
    setIsLoading(true);
    setError('');
    try {
      const walletClient = createWalletClient({ chain: arbitrum, transport: custom(window.ethereum), account });
      const amountIn = parseUnits(inputAmount, fromTokenData.decimals);
      const minAmountOut = parseUnits(
        (parseFloat(outputAmount) * (1 - parseFloat(slippage) / 100)).toFixed(toTokenData.decimals),
        toTokenData.decimals
      );
      const hash = await walletClient.writeContract({
        address: UNISWAP_V3_CONFIG.SWAP_ROUTER_ADDRESS, abi: SWAP_ROUTER_ABI, functionName: 'exactInputSingle',
        args: [{ tokenIn: fromTokenData.address, tokenOut: toTokenData.address, fee: UNISWAP_V3_CONFIG.POOL_FEE, recipient: account, amountIn, amountOutMinimum: minAmountOut, sqrtPriceLimitX96: 0n }],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      setTransactionHistory(prev => [{ hash, from: fromToken, to: toToken, amount: inputAmount, timestamp: new Date().toLocaleString() }, ...prev.slice(0, 4)]);
      await loadBalances(account);
      setInputAmount('');
      setOutputAmount('');
      setExchangeRate(null);
      setPriceImpact(0);
      setError('');
    } catch (err) {
      console.error('交易失败:', err);
      setError('交易失败: ' + err.message);
    }
    setIsLoading(false);
  };

  const formatBalance = (balance) => {
    if (!balance) return '0.00';
    return parseFloat(balance).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 });
  };

  // ============================
  // RENDER
  // ============================

  return (
    <div className="w-full max-w-[440px] mx-auto">

      {/* ===== Header ===== */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight" style={{ color: '#1C1C1E' }}>
            Swap
          </h1>
          <p className="text-[13px] font-medium mt-0.5" style={{ color: '#4B5563' }}>
            USD24 &harr; USDC on Arbitrum
          </p>
        </div>

        {account ? (
          <div className="glass-panel-inner flex items-center gap-2.5 px-3 py-2 cursor-default">
            <div className="relative">
              <div className="w-2 h-2 rounded-full bg-[#34C759]"></div>
              <div className="absolute inset-0 w-2 h-2 rounded-full bg-[#34C759] animate-ping opacity-75"></div>
            </div>
            <span className="text-[13px] font-semibold font-mono" style={{ color: '#1C1C1E' }}>
              {account.slice(0, 6)}...{account.slice(-4)}
            </span>
          </div>
        ) : (
          <button
            onClick={connectWallet}
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-[13px] font-semibold text-white cursor-pointer transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
            style={{ background: '#007AFF', boxShadow: '0 4px 16px rgba(0,122,255,0.3)' }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
            连接钱包
          </button>
        )}
      </div>

      {/* ===== Error ===== */}
      {error && (
        <div className="mb-4 p-3.5 rounded-2xl flex items-start gap-3" style={{ background: 'rgba(255,59,48,0.08)', border: '1px solid rgba(255,59,48,0.15)' }}>
          <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: 'rgba(255,59,48,0.12)' }}>
            <svg className="w-3 h-3" fill="#FF3B30" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" /></svg>
          </div>
          <p className="text-[13px] leading-5" style={{ color: '#FF3B30' }}>{error}</p>
        </div>
      )}

      {/* ===== Main Swap Card ===== */}
      <div className="glass-panel p-1.5">
        <div className="space-y-1.5">

          {/* FROM token input */}
          <div className="rounded-[20px] p-4 transition-all duration-200" style={{ background: 'rgba(120,120,128,0.04)' }}>
            <div className="flex justify-between items-center mb-3">
              <span className="text-[12px] font-semibold tracking-wide uppercase" style={{ color: '#4B5563' }}>支付</span>
              <div className="flex items-center gap-2">
                <span className="text-[12px]" style={{ color: '#6B7280' }}>
                  余额: {formatBalance(balances[fromToken])}
                </span>
                <div className="flex gap-1">
                  {[25, 50, 75, 100].map((pct) => (
                    <button
                      key={pct}
                      onClick={() => {
                        const balance = balances[fromToken];
                        if (balance) setInputAmount((parseFloat(balance) * pct / 100).toFixed(fromTokenData.decimals));
                      }}
                      className="text-[11px] font-bold px-1.5 py-0.5 rounded-md cursor-pointer transition-colors duration-150 hover:opacity-80"
                      style={{ color: '#007AFF', background: 'rgba(0,122,255,0.08)' }}
                    >
                      {pct}%
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <input
                type="number"
                value={inputAmount}
                onChange={(e) => handleInputChange(e.target.value)}
                placeholder="0"
                className="flex-1 bg-transparent outline-none placeholder-[#9CA3AF] min-w-0"
                style={{
                  fontSize: '32px',
                  fontWeight: 600,
                  lineHeight: 1.1,
                  letterSpacing: '-0.02em',
                  color: hasInsufficientBalance() ? '#FF3B30' : '#1C1C1E',
                }}
              />
              <div className="glass-panel-inner flex items-center gap-2.5 pl-2.5 pr-3.5 py-2 cursor-default">
                <TokenIcon token={fromToken} size={28} />
                <div className="text-right">
                  <p className="text-[14px] font-bold" style={{ color: '#1C1C1E' }}>{fromToken}</p>
                  <p className="text-[10px]" style={{ color: '#6B7280' }}>{fromTokenData.label}</p>
                </div>
              </div>
            </div>

            {hasInsufficientBalance() && (
              <p className="text-[11px] mt-2 font-medium" style={{ color: '#FF3B30' }}>余额不足</p>
            )}
          </div>

          {/* SWITCH button */}
          <div className="flex justify-center -my-3 relative z-10">
            <button
              onClick={switchTokens}
              disabled={isLoading}
              className="w-10 h-10 rounded-[14px] flex items-center justify-center cursor-pointer transition-all duration-200 hover:scale-110 active:scale-95"
              style={{
                background: 'rgba(255,255,255,0.9)',
                backdropFilter: 'blur(20px)',
                border: '1px solid rgba(255,255,255,0.8)',
                boxShadow: '0 2px 12px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.04)',
              }}
            >
              <svg className="w-[18px] h-[18px]" fill="none" stroke="#6B7280" viewBox="0 0 24 24" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
              </svg>
            </button>
          </div>

          {/* TO token output */}
          <div className="rounded-[20px] p-4 transition-all duration-200" style={{ background: 'rgba(120,120,128,0.04)' }}>
            <div className="flex justify-between items-center mb-3">
              <span className="text-[12px] font-semibold tracking-wide uppercase" style={{ color: '#4B5563' }}>接收 (预估)</span>
              <span className="text-[12px]" style={{ color: '#6B7280' }}>
                余额: {formatBalance(balances[toToken])}
              </span>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex-1 relative min-w-0">
                <input
                  type="number"
                  value={outputAmount}
                  readOnly
                  placeholder="0"
                  className="w-full bg-transparent outline-none placeholder-[#9CA3AF]"
                  style={{
                    fontSize: '32px',
                    fontWeight: 600,
                    lineHeight: 1.1,
                    letterSpacing: '-0.02em',
                    color: '#1C1C1E',
                  }}
                />
                {isQuoting && inputAmount && (
                  <div className="absolute right-0 top-1/2 -translate-y-1/2">
                    <div className="w-5 h-5 rounded-full border-2 border-[#007AFF] border-t-transparent animate-spin"></div>
                  </div>
                )}
              </div>
              <div className="glass-panel-inner flex items-center gap-2.5 pl-2.5 pr-3.5 py-2 cursor-default">
                <TokenIcon token={toToken} size={28} />
                <div className="text-right">
                  <p className="text-[14px] font-bold" style={{ color: '#1C1C1E' }}>{toToken}</p>
                  <p className="text-[10px]" style={{ color: '#6B7280' }}>{toTokenData.label}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Exchange details */}
        {exchangeRate && inputAmount && (
          <div className="mx-1.5 mt-1.5 mb-0.5 p-3 rounded-[16px]" style={{ background: 'rgba(120,120,128,0.04)' }}>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-[12px] font-medium" style={{ color: '#4B5563' }}>汇率</span>
                <span className="text-[12px] font-semibold" style={{ color: '#1C1C1E' }}>
                  1 {fromToken} = {exchangeRate.toFixed(6)} {toToken}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[12px] font-medium" style={{ color: '#4B5563' }}>价格影响</span>
                <span className="text-[12px] font-semibold" style={{
                  color: priceImpact > 3 ? '#FF3B30' : priceImpact > 1 ? '#FF9500' : '#34C759'
                }}>
                  {priceImpact > 3 && (
                    <svg className="w-3 h-3 inline mr-0.5 -mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" />
                    </svg>
                  )}
                  {priceImpact.toFixed(2)}%
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[12px] font-medium" style={{ color: '#4B5563' }}>最小接收</span>
                <span className="text-[12px] font-semibold" style={{ color: '#1C1C1E' }}>
                  {outputAmount ? (parseFloat(outputAmount) * (1 - parseFloat(slippage) / 100)).toFixed(toTokenData.decimals) : '0'} {toToken}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Slippage settings */}
        <div className="mx-1.5 mt-1.5 mb-1 p-3 rounded-[16px] flex items-center justify-between" style={{ background: 'rgba(120,120,128,0.04)' }}>
          <span className="text-[12px] font-medium" style={{ color: '#4B5563' }}>滑点容差</span>
          <div className="flex gap-1 p-0.5 rounded-xl" style={{ background: 'rgba(120,120,128,0.08)' }}>
            {['0.1', '0.5', '1.0', '2.0'].map((value) => (
              <button
                key={value}
                onClick={() => setSlippage(value)}
                className="px-3 py-1 rounded-lg text-[12px] font-semibold transition-all duration-200 cursor-pointer"
                style={slippage === value ? {
                  background: 'white',
                  color: '#007AFF',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
                } : {
                  color: '#4B5563',
                }}
              >
                {value}%
              </button>
            ))}
          </div>
        </div>

        {/* Pool info - compact */}
        {account && currentPrice && (
          <div className="mx-1.5 mt-1 px-3 py-2 rounded-[12px] flex items-center justify-between" style={{ background: 'rgba(120,120,128,0.04)' }}>
            <div className="flex items-center gap-3 text-[11px]" style={{ color: '#6B7280' }}>
              <span>池子: <span className="font-semibold" style={{ color: '#4B5563' }}>{formatBalance(poolBalances.USD24)}</span> USD24</span>
              <span>/</span>
              <span><span className="font-semibold" style={{ color: '#4B5563' }}>{formatBalance(poolBalances.USDC)}</span> USDC</span>
            </div>
            <span className="text-[11px] font-semibold" style={{ color: '#007AFF' }}>{currentPrice.toFixed(4)}</span>
          </div>
        )}

        {/* Action Button */}
        <div className="p-1.5 pt-0.5">
          {!account ? (
            <button
              onClick={connectWallet}
              className="w-full py-4 rounded-[18px] text-[16px] font-semibold text-white cursor-pointer transition-all duration-200 hover:scale-[1.01] active:scale-[0.99]"
              style={{ background: '#007AFF', boxShadow: '0 6px 20px rgba(0,122,255,0.3)' }}
            >
              连接钱包
            </button>
          ) : hasInsufficientBalance() ? (
            <button disabled className="w-full py-4 rounded-[18px] text-[16px] font-semibold cursor-not-allowed"
              style={{ background: 'rgba(120,120,128,0.08)', color: '#6B7280' }}>
              余额不足
            </button>
          ) : needsApproval() ? (
            <button
              onClick={approve}
              disabled={isLoading || !inputAmount || parseFloat(inputAmount) === 0}
              className="w-full py-4 rounded-[18px] text-[16px] font-semibold text-white cursor-pointer transition-all duration-200 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
              style={{ background: '#FF9500', boxShadow: '0 6px 20px rgba(255,149,0,0.3)' }}
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="w-5 h-5 rounded-full border-2 border-white border-t-transparent animate-spin"></div>
                  授权中...
                </span>
              ) : `授权 ${fromToken}`}
            </button>
          ) : (
            <button
              onClick={swap}
              disabled={isLoading || !inputAmount || parseFloat(inputAmount) === 0 || !outputAmount}
              className="w-full py-4 rounded-[18px] text-[16px] font-semibold text-white cursor-pointer transition-all duration-200 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
              style={{ background: '#007AFF', boxShadow: '0 6px 20px rgba(0,122,255,0.25)' }}
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="w-5 h-5 rounded-full border-2 border-white border-t-transparent animate-spin"></div>
                  交换中...
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  交换 {fromToken} &rarr; {toToken}
                </span>
              )}
            </button>
          )}
        </div>
      </div>


      {/* ===== Transaction History ===== */}
      {transactionHistory.length > 0 && (
        <div className="glass-panel p-4 mt-4">
          <span className="text-[13px] font-semibold block mb-3" style={{ color: '#1C1C1E' }}>交易记录</span>
          <div className="space-y-2">
            {transactionHistory.map((tx, index) => (
              <div key={index} className="flex items-center justify-between p-3 rounded-2xl transition-colors duration-150 hover:bg-black/[0.02]">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-[12px] flex items-center justify-center" style={{ background: 'rgba(52,199,89,0.1)' }}>
                    <svg className="w-4 h-4" fill="none" stroke="#34C759" viewBox="0 0 24 24" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-[13px] font-semibold" style={{ color: '#1C1C1E' }}>
                      {tx.amount} {tx.from} &rarr; {tx.to}
                    </p>
                    <p className="text-[11px]" style={{ color: '#6B7280' }}>{tx.timestamp}</p>
                  </div>
                </div>
                <a
                  href={`https://arbiscan.io/tx/${tx.hash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer transition-colors duration-150 hover:bg-black/[0.04]"
                  aria-label="View on Arbiscan"
                >
                  <svg className="w-4 h-4" fill="none" stroke="#6B7280" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
