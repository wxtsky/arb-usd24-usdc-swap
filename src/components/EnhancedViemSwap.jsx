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
  },
  USDC: {
    address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    symbol: 'USDC',
    decimals: 6,
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

export default function EnhancedViemSwap() {
  const [account, setAccount] = useState(null);
  const [balances, setBalances] = useState({});
  const [allowances, setAllowances] = useState({});
  const [fromToken, setFromToken] = useState('USD24');
  const [toToken, setToToken] = useState('USDC');
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

      const accounts = await window.ethereum.request({
        method: 'eth_requestAccounts'
      });

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
        usd24Balance, 
        usdcBalance, 
        usd24Allowance, 
        usdcAllowance,
        poolUsd24Balance,
        poolUsdcBalance,
        slot0Data,
        liquidity
      ] = await Promise.all([
        // 用户余额
        publicClient.readContract({
          address: TOKENS.USD24.address,
          abi: ERC20_ABI,
          functionName: 'balanceOf',
          args: [address],
        }),
        publicClient.readContract({
          address: TOKENS.USDC.address,
          abi: ERC20_ABI,
          functionName: 'balanceOf',
          args: [address],
        }),
        // 用户授权
        publicClient.readContract({
          address: TOKENS.USD24.address,
          abi: ERC20_ABI,
          functionName: 'allowance',
          args: [address, UNISWAP_V3_CONFIG.SWAP_ROUTER_ADDRESS],
        }),
        publicClient.readContract({
          address: TOKENS.USDC.address,
          abi: ERC20_ABI,
          functionName: 'allowance',
          args: [address, UNISWAP_V3_CONFIG.SWAP_ROUTER_ADDRESS],
        }),
        // 池子余额
        publicClient.readContract({
          address: TOKENS.USD24.address,
          abi: ERC20_ABI,
          functionName: 'balanceOf',
          args: [UNISWAP_V3_CONFIG.POOL_ADDRESS],
        }),
        publicClient.readContract({
          address: TOKENS.USDC.address,
          abi: ERC20_ABI,
          functionName: 'balanceOf',
          args: [UNISWAP_V3_CONFIG.POOL_ADDRESS],
        }),
        // 池子价格信息
        publicClient.readContract({
          address: UNISWAP_V3_CONFIG.POOL_ADDRESS,
          abi: POOL_ABI,
          functionName: 'slot0',
        }),
        publicClient.readContract({
          address: UNISWAP_V3_CONFIG.POOL_ADDRESS,
          abi: POOL_ABI,
          functionName: 'liquidity',
        })
      ]);

      setBalances({
        USD24: formatUnits(usd24Balance, TOKENS.USD24.decimals),
        USDC: formatUnits(usdcBalance, TOKENS.USDC.decimals),
      });

      setAllowances({
        USD24: usd24Allowance.toString(),
        USDC: usdcAllowance.toString(),
      });

      setPoolBalances({
        USD24: formatUnits(poolUsd24Balance, TOKENS.USD24.decimals),
        USDC: formatUnits(poolUsdcBalance, TOKENS.USDC.decimals),
      });

      // 计算当前价格 (sqrtPriceX96 -> price)
      const sqrtPriceX96 = slot0Data[0];
      const price = calculatePriceFromSqrtX96(sqrtPriceX96);
      setCurrentPrice(price);
      
    } catch (err) {
      console.error('加载余额失败:', err);
      setError('加载余额失败: ' + err.message);
    }
  };

  // 从 sqrtPriceX96 计算实际价格
  const calculatePriceFromSqrtX96 = (sqrtPriceX96) => {
    const Q96 = 2n ** 96n;
    
    // 计算价格：price = (sqrtPriceX96 / 2^96)^2
    const sqrtPrice = Number(sqrtPriceX96) / Math.pow(2, 96);
    const rawPrice = sqrtPrice * sqrtPrice;
    
    // Uniswap V3 的价格是 token1/token0 的比例
    // 由于我们需要 USDC/USD24 的价格，需要调整精度
    // USD24 是 2 位小数，USDC 是 6 位小数
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
        address: UNISWAP_V3_CONFIG.QUOTER_ADDRESS,
        abi: QUOTER_ABI,
        functionName: 'quoteExactInputSingle',
        args: [
          fromTokenInfo.address,
          toTokenInfo.address,
          UNISWAP_V3_CONFIG.POOL_FEE,
          amountIn,
          0n
        ],
      });

      const formattedOutput = formatUnits(quote, toTokenInfo.decimals);
      setOutputAmount(formattedOutput);

      const rate = parseFloat(formattedOutput) / parseFloat(amount);
      setExchangeRate(rate);

      // 计算实际价格影响
      if (currentPrice) {
        // currentPrice 是 USDC/USD24 的价格（从池子的 sqrtPriceX96 计算得出）
        let marketPrice, actualRate;
        
        if (from === 'USD24') {
          // 从 USD24 换到 USDC
          marketPrice = currentPrice; // USDC/USD24
          actualRate = rate; // 实际得到的 USDC/USD24 比例
        } else {
          // 从 USDC 换到 USD24  
          marketPrice = 1 / currentPrice; // USD24/USDC
          actualRate = rate; // 实际得到的 USD24/USDC 比例
        }
        
        const impact = Math.abs((actualRate - marketPrice) / marketPrice * 100);
        setPriceImpact(impact);
      } else {
        // 如果没有池子价格，使用1:1作为参考
        const expectedRate = 1;
        const impact = Math.abs((rate - expectedRate) / expectedRate * 100);
        setPriceImpact(impact);
      }

    } catch (err) {
      console.error('获取报价失败:', err);
      // 使用池子价格作为后备，如果没有则使用默认价格
      let fallbackRate;
      if (currentPrice) {
        fallbackRate = from === 'USD24' ? currentPrice * 0.999 : (1 / currentPrice) * 0.999; // 假设0.1%的滑点
      } else {
        fallbackRate = from === 'USD24' ? 0.998 : 1.002;
      }
      
      const fallbackOutput = (parseFloat(amount) * fallbackRate).toFixed(toTokenData.decimals);
      setOutputAmount(fallbackOutput);
      setExchangeRate(fallbackRate);
      
      // 使用池子价格计算价格影响
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
    const debounceTimer = setTimeout(() => {
      getQuote(inputAmount, fromToken, toToken);
    }, 1000);

    return () => clearTimeout(debounceTimer);
  }, [inputAmount, fromToken, toToken, getQuote]);

  const handleInputChange = (value) => {
    setInputAmount(value);
  };

  const switchTokens = () => {
    setFromToken(toToken);
    setToToken(fromToken);
    setInputAmount('');
    setOutputAmount('');
    setExchangeRate(null);
    setPriceImpact(0);
    setError('');
  };

  const handleMaxClick = () => {
    const balance = balances[fromToken];
    if (balance) {
      setInputAmount(balance);
    }
  };

  const needsApproval = () => {
    if (!inputAmount || !allowances[fromToken]) return false;
    try {
      const amount = parseUnits(inputAmount, fromTokenData.decimals);
      const currentAllowance = BigInt(allowances[fromToken]);
      return currentAllowance < amount;
    } catch {
      return false;
    }
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
      const walletClient = createWalletClient({
        chain: arbitrum,
        transport: custom(window.ethereum),
        account
      });

      // 使用各代币的最大合理授权数量
      const maxAmount = fromTokenData.decimals === 2 
        ? parseUnits('10000000', 2)  // USD24: 1000万，2位精度
        : parseUnits('10000000', 6); // USDC: 1000万，6位精度
      
      const hash = await walletClient.writeContract({
        address: fromTokenData.address,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [UNISWAP_V3_CONFIG.SWAP_ROUTER_ADDRESS, maxAmount],
      });

      console.log('授权交易哈希:', hash);

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
      const walletClient = createWalletClient({
        chain: arbitrum,
        transport: custom(window.ethereum),
        account
      });

      const amountIn = parseUnits(inputAmount, fromTokenData.decimals);
      const minAmountOut = parseUnits(
        (parseFloat(outputAmount) * (1 - parseFloat(slippage) / 100)).toFixed(toTokenData.decimals),
        toTokenData.decimals
      );

      const params = {
        tokenIn: fromTokenData.address,
        tokenOut: toTokenData.address,
        fee: UNISWAP_V3_CONFIG.POOL_FEE,
        recipient: account,
        amountIn,
        amountOutMinimum: minAmountOut,
        sqrtPriceLimitX96: 0n,
      };

      const hash = await walletClient.writeContract({
        address: UNISWAP_V3_CONFIG.SWAP_ROUTER_ADDRESS,
        abi: SWAP_ROUTER_ABI,
        functionName: 'exactInputSingle',
        args: [params],
      });

      console.log('交易哈希:', hash);

      await publicClient.waitForTransactionReceipt({ hash });

      // 添加到交易历史
      const newTransaction = {
        hash,
        from: fromToken,
        to: toToken,
        amount: inputAmount,
        timestamp: new Date().toLocaleString(),
      };
      setTransactionHistory(prev => [newTransaction, ...prev.slice(0, 4)]);

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
    return parseFloat(balance).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 6,
    });
  };

  return (
    <div className="w-full max-w-md mx-auto px-4 sm:px-0">
      <div className="text-center mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">
          {fromToken} ⇄ {toToken}
        </h1>
      </div>

      {!account ? (
        <div className="bg-white rounded-2xl shadow-xl p-6 sm:p-8">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-gradient-to-r from-blue-500 to-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-gray-800 mb-2">连接钱包</h3>
          </div>
          <button
            onClick={connectWallet}
            className="w-full py-4 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl font-semibold text-lg hover:shadow-lg transition-all active:scale-95 touch-manipulation"
          >
            连接 MetaMask
          </button>
        </div>
      ) : (
        <div className="space-y-4 sm:space-y-6">
          {/* 钱包信息卡片 - 手机端可折叠 */}
          <div className="bg-white rounded-2xl shadow-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-r from-green-400 to-blue-500 rounded-full flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <div>
                  <p className="font-medium text-gray-800 text-sm">已连接</p>
                  <p className="text-xs text-gray-500">{account.slice(0, 6)}...{account.slice(-4)}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-500">Arbitrum</p>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                  <span className="text-xs text-green-600">已连接</span>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-blue-50 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-4 h-4 rounded-full bg-gradient-to-r from-blue-400 to-blue-600"></div>
                    <span className="text-xs font-medium text-blue-800">{fromToken}</span>
                  </div>
                  <p className="text-sm font-semibold text-blue-900">{formatBalance(balances[fromToken])}</p>
                </div>

                <div className="bg-green-50 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-4 h-4 rounded-full bg-gradient-to-r from-green-400 to-green-600"></div>
                    <span className="text-xs font-medium text-green-800">{toToken}</span>
                  </div>
                  <p className="text-sm font-semibold text-green-900">{formatBalance(balances[toToken])}</p>
                </div>
              </div>

              {/* 池子信息 */}
              {(poolBalances.USD24 || poolBalances.USDC) && (
                <div className="bg-purple-50 rounded-lg p-3 border border-purple-100">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-4 h-4 rounded-full bg-gradient-to-r from-purple-400 to-purple-600"></div>
                    <span className="text-xs font-medium text-purple-800">池子流动性</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-purple-600">{fromToken}: </span>
                      <span className="font-semibold text-purple-900">{formatBalance(poolBalances[fromToken])}</span>
                    </div>
                    <div>
                      <span className="text-purple-600">{toToken}: </span>
                      <span className="font-semibold text-purple-900">{formatBalance(poolBalances[toToken])}</span>
                    </div>
                  </div>
                  {currentPrice && (
                    <div className="mt-2 pt-2 border-t border-purple-200">
                      <span className="text-xs text-purple-600">
                        池子价格: {currentPrice.toFixed(6)} USDC/USD24
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border-l-4 border-red-400 p-4 rounded-r-lg">
              <div className="flex items-start">
                <svg className="w-5 h-5 text-red-400 mt-0.5 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <p className="text-sm font-medium text-red-800">操作失败</p>
                  <p className="text-sm text-red-700 mt-1">{error}</p>
                </div>
              </div>
            </div>
          )}

          <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
            {/* 头部 */}
            <div className="bg-gradient-to-r from-blue-500 to-blue-600 p-4 sm:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl sm:text-2xl font-bold text-white">交换</h2>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-blue-100 text-sm">滑点:</span>
                  <div className="flex gap-1 bg-white bg-opacity-20 rounded-lg p-1">
                    {['0.1', '0.5', '1.0', '2.0'].map((value) => (
                      <button
                        key={value}
                        onClick={() => setSlippage(value)}
                        className={`px-3 py-1 rounded text-sm font-medium transition-all ${slippage === value
                          ? 'bg-white text-blue-600'
                          : 'text-white hover:bg-white hover:bg-opacity-20'
                          }`}
                      >
                        {value}%
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4 sm:p-6">

              {/* From Token */}
              <div className="bg-gray-50 rounded-2xl p-4 mb-4 border-2 border-transparent focus-within:border-blue-200 transition-colors">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-sm font-medium text-gray-700">支付</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-600">
                      余额: {formatBalance(balances[fromToken])}
                    </span>
                    <button
                      onClick={handleMaxClick}
                      className="text-xs bg-blue-500 text-white px-3 py-1.5 rounded-lg hover:bg-blue-600 active:scale-95 transition-all font-medium"
                    >
                      MAX
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <input
                      type="number"
                      value={inputAmount}
                      onChange={(e) => handleInputChange(e.target.value)}
                      placeholder="0.00"
                      className={`w-full bg-transparent text-2xl sm:text-3xl font-semibold outline-none placeholder-gray-400 ${hasInsufficientBalance() ? 'text-red-500' : 'text-gray-900'
                        }`}
                      style={{ fontSize: 'clamp(1.5rem, 5vw, 2rem)' }}
                    />
                    {hasInsufficientBalance() && (
                      <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" />
                        </svg>
                        余额不足
                      </p>
                    )}
                  </div>

                  <div className="bg-white rounded-xl px-4 py-3 shadow-sm border border-gray-200 min-w-fit">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-r from-blue-400 to-blue-600 flex-shrink-0"></div>
                      <div className="text-right">
                        <p className="font-bold text-gray-900 text-lg">{fromToken}</p>
                        <p className="text-xs text-gray-500">
                          {fromToken === 'USD24' ? 'Fiat24 USD' : 'USD Coin'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Switch Button */}
              <div className="flex justify-center mb-4 relative">
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-full border-t border-gray-200"></div>
                </div>
                <button
                  onClick={switchTokens}
                  className="relative z-10 p-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-full hover:from-blue-600 hover:to-blue-700 active:scale-95 transition-all duration-300 shadow-lg hover:shadow-xl"
                  disabled={isLoading}
                >
                  <svg className="w-5 h-5 transition-transform duration-300 hover:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                  </svg>
                </button>
              </div>

              {/* To Token */}
              <div className="bg-green-50 rounded-2xl p-4 mb-6 border-2 border-transparent">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-sm font-medium text-gray-700">接收 (预估)</span>
                  <span className="text-sm text-gray-600">
                    余额: {formatBalance(balances[toToken])}
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex-1 relative">
                    <input
                      type="number"
                      value={outputAmount}
                      readOnly
                      placeholder="0.00"
                      className="w-full bg-transparent text-2xl sm:text-3xl font-semibold outline-none text-gray-900 placeholder-gray-400"
                      style={{ fontSize: 'clamp(1.5rem, 5vw, 2rem)' }}
                    />
                    {isQuoting && inputAmount && (
                      <div className="absolute right-0 top-1/2 -translate-y-1/2">
                        <div className="animate-spin h-5 w-5 border-2 border-green-500 border-t-transparent rounded-full"></div>
                      </div>
                    )}
                  </div>

                  <div className="bg-white rounded-xl px-4 py-3 shadow-sm border border-gray-200 min-w-fit">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-r from-green-400 to-green-600 flex-shrink-0"></div>
                      <div className="text-right">
                        <p className="font-bold text-gray-900 text-lg">{toToken}</p>
                        <p className="text-xs text-gray-500">
                          {toToken === 'USD24' ? 'Fiat24 USD' : 'USD Coin'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* 价格信息 */}
              {exchangeRate && inputAmount && (
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl p-4 mb-6 border border-blue-100">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="font-semibold text-blue-900">交换详情</span>
                  </div>

                  <div className="space-y-3">
                    <div className="flex justify-between items-center py-2 px-3 bg-white bg-opacity-50 rounded-lg">
                      <span className="text-sm text-gray-700 font-medium">汇率</span>
                      <span className="font-semibold text-gray-900">
                        1 {fromToken} = {exchangeRate.toFixed(6)} {toToken}
                      </span>
                    </div>

                    <div className="flex justify-between items-center py-2 px-3 bg-white bg-opacity-50 rounded-lg">
                      <span className="text-sm text-gray-700 font-medium">价格影响</span>
                      <div className="flex items-center gap-2">
                        <span className={`font-semibold ${priceImpact > 3 ? 'text-red-600' :
                          priceImpact > 1 ? 'text-yellow-600' : 'text-green-600'
                          }`}>
                          {priceImpact.toFixed(2)}%
                        </span>
                        {priceImpact > 3 && (
                          <svg className="w-4 h-4 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" />
                          </svg>
                        )}
                      </div>
                    </div>

                    <div className="flex justify-between items-center py-2 px-3 bg-white bg-opacity-50 rounded-lg">
                      <span className="text-sm text-gray-700 font-medium">最小接收</span>
                      <span className="font-semibold text-gray-900">
                        {outputAmount ?
                          (parseFloat(outputAmount) * (1 - parseFloat(slippage) / 100)).toFixed(toTokenData.decimals)
                          : '0'
                        } {toToken}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Action Button */}
              {hasInsufficientBalance() ? (
                <button
                  disabled
                  className="w-full py-4 sm:py-5 bg-gray-200 text-gray-500 rounded-2xl font-bold text-lg sm:text-xl cursor-not-allowed flex items-center justify-center gap-2 touch-manipulation"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" />
                  </svg>
                  余额不足
                </button>
              ) : needsApproval() ? (
                <button
                  onClick={approve}
                  disabled={isLoading || !inputAmount || parseFloat(inputAmount) === 0}
                  className="w-full py-4 sm:py-5 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-2xl font-bold text-lg sm:text-xl
                           disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-xl active:scale-98 transition-all duration-200 touch-manipulation"
                >
                  {isLoading ? (
                    <span className="flex items-center justify-center gap-3">
                      <div className="animate-spin h-6 w-6 border-3 border-white border-t-transparent rounded-full"></div>
                      <span>授权中...</span>
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      授权 {fromToken}
                    </span>
                  )}
                </button>
              ) : (
                <button
                  onClick={swap}
                  disabled={isLoading || !inputAmount || parseFloat(inputAmount) === 0 || !outputAmount}
                  className="w-full py-4 sm:py-5 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-2xl font-bold text-lg sm:text-xl
                           disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-xl active:scale-98 transition-all duration-200 touch-manipulation"
                >
                  {isLoading ? (
                    <span className="flex items-center justify-center gap-3">
                      <div className="animate-spin h-6 w-6 border-3 border-white border-t-transparent rounded-full"></div>
                      <span>交换中...</span>
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      交换 {fromToken} → {toToken}
                    </span>
                  )}
                </button>
              )}
            </div>
          </div>

          {/* 交易历史 */}
          {transactionHistory.length > 0 && (
            <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
              <div className="bg-gradient-to-r from-green-500 to-emerald-600 p-4">
                <h3 className="text-lg font-bold text-white">交易记录</h3>
              </div>

              <div className="p-4">
                <div className="space-y-3">
                  {transactionHistory.map((tx, index) => (
                    <div key={index} className="flex items-center justify-between p-4 bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl border border-green-100 hover:shadow-md transition-all">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-gradient-to-r from-green-400 to-emerald-500 rounded-full flex items-center justify-center shadow-lg">
                          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                        <div>
                          <p className="font-semibold text-gray-900 text-sm sm:text-base">
                            {tx.amount} {tx.from} → {tx.to}
                          </p>
                          <p className="text-xs text-gray-500 mt-1">{tx.timestamp}</p>
                        </div>
                      </div>

                      <a
                        href={`https://arbiscan.io/tx/${tx.hash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 bg-white rounded-lg text-blue-500 hover:text-blue-600 hover:bg-blue-50 transition-all active:scale-95 touch-manipulation"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}