import React, { useMemo, useRef, useState } from 'react';
import {
  CumulativeCurveSpec,
  CurvePoint,
  HistogramSpec,
  TableSpec,
  VisualSpec,
} from '../types/exercise';

interface DiagramRendererProps {
  visual: VisualSpec;
  alternateVisual?: CumulativeCurveSpec;
  visualNote?: string;
  showSolution?: boolean;
}

/**
 * Monotone cubic interpolation (Fritsch-Carlson) to generate smooth SVG path
 * segments through cumulative frequency points without any overshoot.
 */
function buildMonotoneSplinePath(
  pts: { sx: number; sy: number }[]
): string {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M ${pts[0].sx.toFixed(2)} ${pts[0].sy.toFixed(2)}`;
  if (pts.length === 2) {
    return `M ${pts[0].sx.toFixed(2)} ${pts[0].sy.toFixed(2)} L ${pts[1].sx.toFixed(2)} ${pts[1].sy.toFixed(2)}`;
  }

  const n = pts.length;
  const dx: number[] = [];
  const dy: number[] = [];
  const m: number[] = new Array(n).fill(0);

  for (let i = 0; i < n - 1; i++) {
    dx.push(pts[i + 1].sx - pts[i].sx);
    dy.push(pts[i + 1].sy - pts[i].sy);
  }

  const slopes = dx.map((d, i) => (d === 0 ? 0 : dy[i] / d));
  m[0] = slopes[0];
  m[n - 1] = slopes[n - 2];

  for (let i = 1; i < n - 1; i++) {
    if (slopes[i - 1] * slopes[i] <= 0) {
      m[i] = 0;
    } else {
      m[i] = (slopes[i - 1] + slopes[i]) / 2;
    }
  }

  for (let i = 0; i < n - 1; i++) {
    if (slopes[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
    } else {
      const a = m[i] / slopes[i];
      const b = m[i + 1] / slopes[i];
      const h = Math.hypot(a, b);
      if (h > 3) {
        const t = 3 / h;
        m[i] = t * a * slopes[i];
        m[i + 1] = t * b * slopes[i];
      }
    }
  }

  let d = `M ${pts[0].sx.toFixed(2)} ${pts[0].sy.toFixed(2)}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    const cp1x = pts[i].sx + h;
    const cp1y = pts[i].sy + m[i] * h;
    const cp2x = pts[i + 1].sx - h;
    const cp2y = pts[i + 1].sy - m[i + 1] * h;
    d += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${pts[i + 1].sx.toFixed(2)} ${pts[i + 1].sy.toFixed(2)}`;
  }
  return d;
}

function formatTick(val: number): string {
  if (Math.abs(val - Math.round(val)) < 1e-6) return String(Math.round(val));
  return Number(val.toFixed(2)).toString();
}

const HistogramChart: React.FC<{
  spec: HistogramSpec;
  showSolution?: boolean;
}> = ({ spec, showSolution }) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const W = 560;
  const H = 360;
  const pad = { top: spec.title ? 40 : 22, right: 24, bottom: 54, left: 62 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;

  const xScale = (x: number) =>
    pad.left + ((x - spec.xMin) / (spec.xMax - spec.xMin)) * plotW;
  const yScale = (y: number) =>
    pad.top + plotH - ((y - spec.yMin) / (spec.yMax - spec.yMin)) * plotH;

  const xMajorTicks = useMemo(() => {
    const ticks: number[] = [];
    for (let x = spec.xMin; x <= spec.xMax + 1e-6; x += spec.xTickStep) {
      ticks.push(Number(x.toFixed(4)));
    }
    return ticks;
  }, [spec.xMin, spec.xMax, spec.xTickStep]);

  const xMinorTicks = useMemo(() => {
    if (spec.xMinorSubdivisions <= 1) return [];
    const step = spec.xTickStep / spec.xMinorSubdivisions;
    const ticks: number[] = [];
    for (let x = spec.xMin; x <= spec.xMax + 1e-6; x += step) {
      ticks.push(Number(x.toFixed(4)));
    }
    return ticks;
  }, [spec.xMin, spec.xMax, spec.xTickStep, spec.xMinorSubdivisions]);

  const yMajorTicks = useMemo(() => {
    const ticks: number[] = [];
    for (let y = spec.yMin; y <= spec.yMax + 1e-6; y += spec.yTickStep) {
      ticks.push(Number(y.toFixed(4)));
    }
    return ticks;
  }, [spec.yMin, spec.yMax, spec.yTickStep]);

  const yMinorTicks = useMemo(() => {
    if (spec.yMinorSubdivisions <= 1) return [];
    const step = spec.yTickStep / spec.yMinorSubdivisions;
    const ticks: number[] = [];
    for (let y = spec.yMin; y <= spec.yMax + 1e-6; y += step) {
      ticks.push(Number(y.toFixed(4)));
    }
    return ticks;
  }, [spec.yMin, spec.yMax, spec.yTickStep, spec.yMinorSubdivisions]);

  const hoveredBar = hoveredIdx !== null ? spec.bars[hoveredIdx] : null;

  return (
    <div className="w-full">
      <div className="flex items-center justify-between min-h-[24px] mb-2 px-1">
        <span className="text-xs text-slate-500">
          Hover over bars to inspect axis readings
        </span>
        <span className="text-xs font-mono-num text-slate-700">
          {hoveredBar
            ? `${hoveredBar.label ?? `${hoveredBar.x0}–${hoveredBar.x1}`} · Height: ${formatTick(hoveredBar.y)}`
            : ' '}
        </span>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto select-none bg-white rounded-lg border border-slate-200"
        role="img"
        aria-label={spec.title ?? `${spec.yLabel} vs ${spec.xLabel}`}
      >
        {spec.title && (
          <text
            x={pad.left + plotW / 2}
            y={24}
            textAnchor="middle"
            className="fill-slate-900 font-semibold"
            style={{ fontSize: '14px', fontFamily: 'var(--font-display)' }}
          >
            {spec.title}
          </text>
        )}

        {/* Minor Grid */}
        {xMinorTicks.map((x, idx) => (
          <line
            key={`xmin-${idx}`}
            x1={xScale(x)}
            y1={pad.top}
            x2={xScale(x)}
            y2={pad.top + plotH}
            stroke="#F1F5F9"
            strokeWidth={1}
          />
        ))}
        {yMinorTicks.map((y, idx) => (
          <line
            key={`ymin-${idx}`}
            x1={pad.left}
            y1={yScale(y)}
            x2={pad.left + plotW}
            y2={yScale(y)}
            stroke="#F1F5F9"
            strokeWidth={1}
          />
        ))}

        {/* Major Grid */}
        {!spec.discreteLabels &&
          xMajorTicks.map((x, idx) => (
            <line
              key={`xmaj-${idx}`}
              x1={xScale(x)}
              y1={pad.top}
              x2={xScale(x)}
              y2={pad.top + plotH}
              stroke="#CBD5E1"
              strokeWidth={1}
            />
          ))}
        {yMajorTicks.map((y, idx) => (
          <line
            key={`ymaj-${idx}`}
            x1={pad.left}
            y1={yScale(y)}
            x2={pad.left + plotW}
            y2={yScale(y)}
            stroke="#CBD5E1"
            strokeWidth={1}
          />
        ))}

        {/* Bars */}
        {spec.bars.map((bar, idx) => {
          const bx = xScale(bar.x0);
          const bw = xScale(bar.x1) - bx;
          const by = yScale(bar.y);
          const bh = yScale(spec.yMin) - by;
          const isHovered = hoveredIdx === idx;
          const isSolvedFocus = Boolean(showSolution && bar.highlightOnSolve);

          const baseFill = bar.color ?? '#E2E8F0';
          const fill = isSolvedFocus
            ? '#059669'
            : bar.color
            ? baseFill
            : isHovered
            ? '#CBD5E1'
            : '#E2E8F0';
          const fillOpacity = bar.color ? (isHovered || isSolvedFocus ? 0.92 : 0.78) : 0.85;
          const stroke = isSolvedFocus
            ? '#065F46'
            : isHovered
            ? '#0F172A'
            : '#334155';

          return (
            <g
              key={idx}
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
              className="cursor-pointer"
            >
              <rect
                x={bx}
                y={by}
                width={Math.max(bw, 0)}
                height={Math.max(bh, 0)}
                fill={fill}
                fillOpacity={fillOpacity}
                stroke={stroke}
                strokeWidth={isHovered || isSolvedFocus ? 2 : 1.25}
              />
            </g>
          );
        })}

        {/* Axes */}
        <line
          x1={pad.left}
          y1={pad.top}
          x2={pad.left}
          y2={pad.top + plotH}
          stroke="#0F172A"
          strokeWidth={1.75}
        />
        <line
          x1={pad.left}
          y1={pad.top + plotH}
          x2={pad.left + plotW}
          y2={pad.top + plotH}
          stroke="#0F172A"
          strokeWidth={1.75}
        />

        {/* X Ticks & Labels */}
        {spec.discreteLabels
          ? spec.discreteLabels.map((lbl, idx) => (
              <text
                key={lbl}
                x={xScale(idx + 0.5)}
                y={pad.top + plotH + 18}
                textAnchor="middle"
                className="fill-slate-700 font-mono-num"
                style={{ fontSize: '11px' }}
              >
                {lbl}
              </text>
            ))
          : xMajorTicks.map((x, idx) => (
              <g key={`xt-${idx}`}>
                <line
                  x1={xScale(x)}
                  y1={pad.top + plotH}
                  x2={xScale(x)}
                  y2={pad.top + plotH + 5}
                  stroke="#0F172A"
                  strokeWidth={1.25}
                />
                <text
                  x={xScale(x)}
                  y={pad.top + plotH + 18}
                  textAnchor="middle"
                  className="fill-slate-700 font-mono-num"
                  style={{ fontSize: '11px' }}
                >
                  {formatTick(x)}
                </text>
              </g>
            ))}

        {/* Y Ticks & Labels */}
        {yMajorTicks.map((y, idx) => (
          <g key={`yt-${idx}`}>
            <line
              x1={pad.left - 5}
              y1={yScale(y)}
              x2={pad.left}
              y2={yScale(y)}
              stroke="#0F172A"
              strokeWidth={1.25}
            />
            <text
              x={pad.left - 9}
              y={yScale(y) + 4}
              textAnchor="end"
              className="fill-slate-700 font-mono-num"
              style={{ fontSize: '11px' }}
            >
              {formatTick(y)}
            </text>
          </g>
        ))}

        {/* Axis Titles */}
        <text
          x={pad.left + plotW / 2}
          y={H - 12}
          textAnchor="middle"
          className="fill-slate-800 font-medium"
          style={{ fontSize: '12px' }}
        >
          {spec.xLabel}
        </text>
        <text
          x={18}
          y={pad.top + plotH / 2}
          textAnchor="middle"
          transform={`rotate(-90 18 ${pad.top + plotH / 2})`}
          className="fill-slate-800 font-medium"
          style={{ fontSize: '12px' }}
        >
          {spec.yLabel}
        </text>
      </svg>
    </div>
  );
};

const CumulativeChart: React.FC<{
  spec: CumulativeCurveSpec;
  showSolution?: boolean;
}> = ({ spec, showSolution }) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number; sx: number; sy: number } | null>(
    null
  );

  const W = 560;
  const H = 360;
  const pad = { top: spec.title ? 40 : 22, right: 24, bottom: 54, left: 62 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;

  const xScale = (x: number) =>
    pad.left + ((x - spec.xMin) / (spec.xMax - spec.xMin)) * plotW;
  const yScale = (y: number) =>
    pad.top + plotH - ((y - spec.yMin) / (spec.yMax - spec.yMin)) * plotH;

  const gridStartX = spec.xDisplayStart ?? spec.xMin;

  const xMajorTicks = useMemo(() => {
    const ticks: number[] = [];
    for (let x = gridStartX; x <= spec.xMax + 1e-6; x += spec.xTickStep) {
      ticks.push(Number(x.toFixed(4)));
    }
    return ticks;
  }, [gridStartX, spec.xMax, spec.xTickStep]);

  const xMinorTicks = useMemo(() => {
    const step = spec.xTickStep / spec.xMinorSubdivisions;
    const ticks: number[] = [];
    for (let x = gridStartX; x <= spec.xMax + 1e-6; x += step) {
      ticks.push(Number(x.toFixed(4)));
    }
    return ticks;
  }, [gridStartX, spec.xMax, spec.xTickStep, spec.xMinorSubdivisions]);

  const yMajorTicks = useMemo(() => {
    const ticks: number[] = [];
    for (let y = spec.yMin; y <= spec.yMax + 1e-6; y += spec.yTickStep) {
      ticks.push(Number(y.toFixed(4)));
    }
    return ticks;
  }, [spec.yMin, spec.yMax, spec.yTickStep]);

  const yMinorTicks = useMemo(() => {
    const step = spec.yTickStep / spec.yMinorSubdivisions;
    const ticks: number[] = [];
    for (let y = spec.yMin; y <= spec.yMax + 1e-6; y += step) {
      ticks.push(Number(y.toFixed(4)));
    }
    return ticks;
  }, [spec.yMin, spec.yMax, spec.yTickStep, spec.yMinorSubdivisions]);

  const screenPoints = useMemo(
    () =>
      spec.points.map((p: CurvePoint) => ({
        ...p,
        sx: xScale(p.x),
        sy: yScale(p.y),
      })),
    [spec.points, spec.xMin, spec.xMax, spec.yMin, spec.yMax]
  );

  const curvePath = useMemo(() => buildMonotoneSplinePath(screenPoints), [screenPoints]);

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const sx = ((e.clientX - rect.left) / rect.width) * W;
    const sy = ((e.clientY - rect.top) / rect.height) * H;
    if (
      sx >= pad.left &&
      sx <= pad.left + plotW &&
      sy >= pad.top &&
      sy <= pad.top + plotH
    ) {
      const dataX = spec.xMin + ((sx - pad.left) / plotW) * (spec.xMax - spec.xMin);
      const dataY = spec.yMin + ((pad.top + plotH - sy) / plotH) * (spec.yMax - spec.yMin);
      setCursor({ x: dataX, y: dataY, sx, sy });
    } else {
      setCursor(null);
    }
  };

  const breakStart = xScale(spec.xMin);
  const breakEnd = xScale(gridStartX);
  const breakMid = (breakStart + breakEnd) / 2;
  const axisY = pad.top + plotH;

  return (
    <div className="w-full">
      <div className="flex items-center justify-between min-h-[24px] mb-2 px-1">
        <span className="text-xs text-slate-500">
          Move cursor across the grid to read exact coordinates
        </span>
        <span className="text-xs font-mono-num text-slate-700">
          {cursor && cursor.x >= gridStartX
            ? `x = ${cursor.x.toFixed(1)}, y = ${cursor.y.toFixed(1)}`
            : ' '}
        </span>
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setCursor(null)}
        className="w-full h-auto select-none bg-white rounded-lg border border-slate-200 cursor-crosshair"
        role="img"
        aria-label={spec.title ?? `${spec.yLabel} vs ${spec.xLabel}`}
      >
        {spec.title && (
          <text
            x={pad.left + plotW / 2}
            y={24}
            textAnchor="middle"
            className="fill-slate-900 font-semibold"
            style={{ fontSize: '14px', fontFamily: 'var(--font-display)' }}
          >
            {spec.title}
          </text>
        )}

        {/* Minor Grid */}
        {xMinorTicks.map((x, idx) => (
          <line
            key={`xmin-${idx}`}
            x1={xScale(x)}
            y1={pad.top}
            x2={xScale(x)}
            y2={axisY}
            stroke="#F1F5F9"
            strokeWidth={1}
          />
        ))}
        {yMinorTicks.map((y, idx) => (
          <line
            key={`ymin-${idx}`}
            x1={pad.left}
            y1={yScale(y)}
            x2={pad.left + plotW}
            y2={yScale(y)}
            stroke="#F1F5F9"
            strokeWidth={1}
          />
        ))}

        {/* Major Grid */}
        {xMajorTicks.map((x, idx) => (
          <line
            key={`xmaj-${idx}`}
            x1={xScale(x)}
            y1={pad.top}
            x2={xScale(x)}
            y2={axisY}
            stroke="#CBD5E1"
            strokeWidth={1}
          />
        ))}
        {yMajorTicks.map((y, idx) => (
          <line
            key={`ymaj-${idx}`}
            x1={pad.left}
            y1={yScale(y)}
            x2={pad.left + plotW}
            y2={yScale(y)}
            stroke="#CBD5E1"
            strokeWidth={1}
          />
        ))}

        {/* Static worksheet guide lines (e.g. Q8 & Q10) */}
        {spec.staticGuides?.map((g, idx) => (
          <g key={`sg-${idx}`} opacity={0.65}>
            <line
              x1={pad.left}
              y1={yScale(g.y)}
              x2={xScale(g.x)}
              y2={yScale(g.y)}
              stroke={g.color}
              strokeWidth={1.35}
              strokeDasharray="4 4"
            />
            <line
              x1={xScale(g.x)}
              y1={yScale(g.y)}
              x2={xScale(g.x)}
              y2={axisY}
              stroke={g.color}
              strokeWidth={1.35}
              strokeDasharray="4 4"
            />
          </g>
        ))}

        {/* Cumulative Curve */}
        <path
          d={curvePath}
          fill="none"
          stroke={spec.curveColor}
          strokeWidth={2.5}
          strokeLinecap="round"
        />

        {/* Plotted Data Dots */}
        {screenPoints.map((p, idx) =>
          p.showDot ? (
            <circle
              key={`dot-${idx}`}
              cx={p.sx}
              cy={p.sy}
              r={3.5}
              fill={spec.curveColor}
              stroke="#FFFFFF"
              strokeWidth={1}
            />
          ) : null
        )}

        {/* Solution Trace Overlay when solved/revealed */}
        {showSolution && spec.solveGuide && (
          <g>
            <line
              x1={pad.left}
              y1={yScale(spec.solveGuide.y)}
              x2={xScale(spec.solveGuide.x)}
              y2={yScale(spec.solveGuide.y)}
              stroke="#059669"
              strokeWidth={2}
              strokeDasharray="5 3"
            />
            <line
              x1={xScale(spec.solveGuide.x)}
              y1={yScale(spec.solveGuide.y)}
              x2={xScale(spec.solveGuide.x)}
              y2={axisY}
              stroke="#059669"
              strokeWidth={2}
              strokeDasharray="5 3"
            />
            <circle
              cx={xScale(spec.solveGuide.x)}
              cy={yScale(spec.solveGuide.y)}
              r={5}
              fill="#059669"
              stroke="#FFFFFF"
              strokeWidth={1.5}
            />
            {spec.solveGuide.label && (
              <g>
                <rect
                  x={Math.min(xScale(spec.solveGuide.x) + 8, W - 210)}
                  y={Math.max(yScale(spec.solveGuide.y) - 28, pad.top + 4)}
                  width={198}
                  height={22}
                  rx={4}
                  fill="#065F46"
                />
                <text
                  x={Math.min(xScale(spec.solveGuide.x) + 15, W - 203)}
                  y={Math.max(yScale(spec.solveGuide.y) - 13, pad.top + 19)}
                  className="fill-white font-mono-num"
                  style={{ fontSize: '10.5px' }}
                >
                  {spec.solveGuide.label}
                </text>
              </g>
            )}
          </g>
        )}

        {/* Interactive Hover Crosshair */}
        {cursor && cursor.x >= gridStartX && (
          <g pointerEvents="none">
            <line
              x1={pad.left}
              y1={cursor.sy}
              x2={pad.left + plotW}
              y2={cursor.sy}
              stroke="#0284C7"
              strokeWidth={1}
              strokeDasharray="3 3"
              opacity={0.7}
            />
            <line
              x1={cursor.sx}
              y1={pad.top}
              x2={cursor.sx}
              y2={axisY}
              stroke="#0284C7"
              strokeWidth={1}
              strokeDasharray="3 3"
              opacity={0.7}
            />
          </g>
        )}

        {/* Axes */}
        <line
          x1={pad.left}
          y1={pad.top}
          x2={pad.left}
          y2={axisY}
          stroke="#0F172A"
          strokeWidth={1.75}
        />
        {spec.hasAxisBreak ? (
          <>
            <line
              x1={pad.left}
              y1={axisY}
              x2={breakMid - 8}
              y2={axisY}
              stroke="#0F172A"
              strokeWidth={1.75}
            />
            <polyline
              points={`${breakMid - 8},${axisY} ${breakMid - 4},${axisY - 6} ${breakMid},${axisY + 6} ${breakMid + 4},${axisY - 6} ${breakMid + 8},${axisY}`}
              fill="none"
              stroke="#0F172A"
              strokeWidth={1.75}
            />
            <line
              x1={breakMid + 8}
              y1={axisY}
              x2={pad.left + plotW}
              y2={axisY}
              stroke="#0F172A"
              strokeWidth={1.75}
            />
            <text
              x={pad.left}
              y={axisY + 18}
              textAnchor="middle"
              className="fill-slate-700 font-mono-num"
              style={{ fontSize: '11px' }}
            >
              0
            </text>
          </>
        ) : (
          <line
            x1={pad.left}
            y1={axisY}
            x2={pad.left + plotW}
            y2={axisY}
            stroke="#0F172A"
            strokeWidth={1.75}
          />
        )}

        {/* X Ticks & Labels */}
        {xMajorTicks.map((x, idx) => (
          <g key={`xt-${idx}`}>
            <line
              x1={xScale(x)}
              y1={axisY}
              x2={xScale(x)}
              y2={axisY + 5}
              stroke="#0F172A"
              strokeWidth={1.25}
            />
            <text
              x={xScale(x)}
              y={axisY + 18}
              textAnchor="middle"
              className="fill-slate-700 font-mono-num"
              style={{ fontSize: '11px' }}
            >
              {formatTick(x)}
            </text>
          </g>
        ))}

        {/* Y Ticks & Labels */}
        {yMajorTicks.map((y, idx) => (
          <g key={`yt-${idx}`}>
            <line
              x1={pad.left - 5}
              y1={yScale(y)}
              x2={pad.left}
              y2={yScale(y)}
              stroke="#0F172A"
              strokeWidth={1.25}
            />
            <text
              x={pad.left - 9}
              y={yScale(y) + 4}
              textAnchor="end"
              className="fill-slate-700 font-mono-num"
              style={{ fontSize: '11px' }}
            >
              {formatTick(y)}
            </text>
          </g>
        ))}

        {/* Axis Titles */}
        <text
          x={pad.left + plotW / 2}
          y={H - 12}
          textAnchor="middle"
          className="fill-slate-800 font-medium"
          style={{ fontSize: '12px' }}
        >
          {spec.xLabel}
        </text>
        <text
          x={18}
          y={pad.top + plotH / 2}
          textAnchor="middle"
          transform={`rotate(-90 18 ${pad.top + plotH / 2})`}
          className="fill-slate-800 font-medium"
          style={{ fontSize: '12px' }}
        >
          {spec.yLabel}
        </text>
      </svg>
    </div>
  );
};

const DataTableView: React.FC<{ spec: TableSpec; showSolution?: boolean }> = ({
  spec,
  showSolution,
}) => {
  return (
    <div className="w-full overflow-x-auto bg-white rounded-lg border border-slate-200">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200">
            {spec.headers.map((h, idx) => (
              <th
                key={idx}
                className="px-4 py-3 text-xs font-semibold text-slate-700 tracking-wide border-r last:border-r-0 border-slate-200"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {spec.rows.map((row, rIdx) => {
            const isHighlighted = showSolution && spec.highlightRowIndex === rIdx;
            return (
              <tr
                key={rIdx}
                className={`border-b last:border-b-0 border-slate-200 transition-colors ${
                  isHighlighted ? 'bg-emerald-50/80' : 'hover:bg-slate-50/70'
                }`}
              >
                {row.map((cell, cIdx) => (
                  <td
                    key={cIdx}
                    className={`px-4 py-3 text-sm font-mono-num border-r last:border-r-0 border-slate-200 ${
                      isHighlighted
                        ? 'text-emerald-900 font-semibold'
                        : 'text-slate-800'
                    }`}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            );
          })}
          {spec.footerRow && (
            <tr className="bg-slate-50 border-t border-slate-300 font-semibold">
              {spec.footerRow.map((cell, cIdx) => (
                <td
                  key={cIdx}
                  className="px-4 py-3 text-sm font-mono-num text-slate-900 border-r last:border-r-0 border-slate-200"
                >
                  {cell}
                </td>
              ))}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};

export const DiagramRenderer: React.FC<DiagramRendererProps> = ({
  visual,
  alternateVisual,
  visualNote,
  showSolution,
}) => {
  const [useAlternate, setUseAlternate] = useState(false);

  const activeVisual = useAlternate && alternateVisual ? alternateVisual : visual;

  return (
    <div className="space-y-3">
      {alternateVisual && (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg border border-slate-200">
            <button
              type="button"
              onClick={() => setUseAlternate(false)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                !useAlternate
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Printed Worksheet Graph
            </button>
            <button
              type="button"
              onClick={() => setUseAlternate(true)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                useAlternate
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Height Curve (120–220 cm)
            </button>
          </div>
        </div>
      )}

      {activeVisual.kind === 'histogram' && (
        <HistogramChart spec={activeVisual} showSolution={showSolution} />
      )}
      {activeVisual.kind === 'cumulative' && (
        <CumulativeChart spec={activeVisual} showSolution={showSolution} />
      )}
      {activeVisual.kind === 'table' && (
        <DataTableView spec={activeVisual} showSolution={showSolution} />
      )}

      {visualNote && (
        <p className="text-xs text-slate-500 leading-relaxed">{visualNote}</p>
      )}
    </div>
  );
};
