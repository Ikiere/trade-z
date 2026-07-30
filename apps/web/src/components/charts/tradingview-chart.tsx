'use client';

import { useEffect, useRef } from 'react';
import { createChart, ColorType, IChartApi, CandlestickSeries, HistogramSeries } from 'lightweight-charts';
import { theme } from '@trade-z/config';

interface TradingViewChartProps {
  data?: { time: string; open: number; high: number; low: number; close: number; volume?: number }[];
  pair?: string;
  orderBlocks?: { type: 'bullish' | 'bearish'; high: number; low: number; startIdx: number; endIdx: number }[];
  fvgs?: { type: 'bullish' | 'bearish'; high: number; low: number; startIdx: number; endIdx: number }[];
}

// Generate high quality mock candles if no data is provided
const generateMockCandles = () => {
  const data = [];
  let basePrice = 1.08000;
  const startDay = new Date(2026, 6, 1);

  for (let i = 0; i < 100; i++) {
    const d = new Date(startDay);
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().split('T')[0];

    const open = basePrice;
    const close = basePrice + (Math.random() - 0.48) * 0.003;
    const high = Math.max(open, close) + Math.random() * 0.001;
    const low = Math.min(open, close) - Math.random() * 0.001;
    const volume = Math.floor(Math.random() * 8000) + 2000;

    data.push({ time: dateStr, open, high, low, close, volume });
    basePrice = close;
  }
  return data;
};

export default function TradingViewChart({
  data = generateMockCandles(),
  pair = 'EURUSD',
  orderBlocks = [
    { type: 'bullish', high: 1.0775, low: 1.0750, startIdx: 20, endIdx: 45 },
    { type: 'bearish', high: 1.0890, low: 1.0870, startIdx: 60, endIdx: 85 }
  ],
  fvgs = [
    { type: 'bullish', high: 1.0820, low: 1.0805, startIdx: 40, endIdx: 50 }
  ]
}: TradingViewChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    // Create container-responsive chart
    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: theme.colors.bg.secondary },
        textColor: theme.colors.text.secondary,
        fontFamily: theme.fonts.sans,
      },
      grid: {
        vertLines: { color: 'rgba(30, 41, 59, 0.5)' },
        horzLines: { color: 'rgba(30, 41, 59, 0.5)' },
      },
      width: chartContainerRef.current.clientWidth,
      height: 400,
      timeScale: {
        borderVisible: false,
        timeVisible: true,
        secondsVisible: false,
      },
    });

    chartRef.current = chart;

    // Set Candlestick series style parameters
    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: theme.colors.profit.DEFAULT,
      downColor: theme.colors.loss.DEFAULT,
      borderVisible: false,
      wickUpColor: theme.colors.profit.light,
      wickDownColor: theme.colors.loss.light,
    });

    candlestickSeries.setData(data.map(d => ({
      time: d.time,
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close
    })));

    // Set Volume series
    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: 'rgba(139, 92, 246, 0.15)',
      priceFormat: { type: 'volume' },
      priceScaleId: '', // overlay
    });

    volumeSeries.setData(data.map(d => ({
      time: d.time,
      value: d.volume || 1000,
      color: d.close >= d.open ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)'
    })));

    // Custom drawings: Render Order Blocks and Fair Value Gaps using baseline markers or price lines
    // For lightweight charts we can draw FVG and Order blocks using PriceLines to showcase bounds
    orderBlocks.forEach((ob) => {
      candlestickSeries.createPriceLine({
        price: ob.high,
        color: ob.type === 'bullish' ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)',
        lineWidth: 1,
        lineStyle: 1, // Dotted
        axisLabelVisible: false,
        title: `${ob.type.toUpperCase()} OB (HIGH)`,
      });
      candlestickSeries.createPriceLine({
        price: ob.low,
        color: ob.type === 'bullish' ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)',
        lineWidth: 1,
        lineStyle: 1, // Dotted
        axisLabelVisible: false,
        title: `${ob.type.toUpperCase()} OB (LOW)`,
      });
    });

    fvgs.forEach((fvg) => {
      candlestickSeries.createPriceLine({
        price: fvg.high,
        color: 'rgba(139, 92, 246, 0.3)',
        lineWidth: 1,
        lineStyle: 2, // Dashed
        axisLabelVisible: false,
        title: 'FVG HIGH',
      });
      candlestickSeries.createPriceLine({
        price: fvg.low,
        color: 'rgba(139, 92, 246, 0.3)',
        lineWidth: 1,
        lineStyle: 2, // Dashed
        axisLabelVisible: false,
        title: 'FVG LOW',
      });
    });

    chart.timeScale().fitContent();

    // Handle viewport resizing events
    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [data, orderBlocks, fvgs]);

  return (
    <div className="relative w-full rounded-xl bg-bg-secondary p-4 border border-[#1e293b] overflow-hidden">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-white font-mono">{pair} — Dynamic Chart</h3>
        <span className="text-[10px] bg-brand-600/20 text-brand-400 px-2 py-0.5 rounded font-mono font-bold uppercase tracking-wider">
          Interactive TV chart
        </span>
      </div>
      <div ref={chartContainerRef} className="w-full" />
    </div>
  );
}
