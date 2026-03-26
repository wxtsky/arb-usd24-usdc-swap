import EnhancedViemSwap from '../components/EnhancedViemSwap';

export default function Home() {
  return (
    <div className="min-h-screen relative overflow-hidden bg-[#F2F2F7]">

      <main className="relative container mx-auto px-4 py-8 sm:py-14 max-w-[440px]">
        <EnhancedViemSwap />
      </main>

      {/* 底部品牌 */}
      <div className="fixed bottom-4 left-0 right-0 text-center pointer-events-none">
        <span className="text-[11px] font-medium tracking-wide" style={{ color: 'rgba(60,60,67,0.5)' }}>
          Powered by Uniswap V3 · Arbitrum
        </span>
      </div>
    </div>
  );
}
