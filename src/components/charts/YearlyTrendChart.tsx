"use client";

import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import type { YearlyAggregation } from "@/lib/types";
import { formatCompactNumber } from "@/lib/utils";

const HISTORIC_CUTOFF = 2017; // data from legacy platform, lower quality
const COLOR_HISTORIC = "#93a8c4"; // muted blue for pre-2017
const COLOR_NOTE = "#6b7280";

interface Props {
  data: YearlyAggregation[];
  dataKey?: "total" | "num_contracts";
  label?: string;
  color?: string;
}

export default function YearlyTrendChart({
  data,
  dataKey = "total",
  label = "Import total",
  color = "#1e3a5f",
}: Props) {
  const currentYear = new Date().getFullYear();
  const chartData = data
    .filter((d) => parseInt(d.year, 10) <= currentYear)
    .map((d) => ({
      year: d.year,
      total: parseFloat(d.total),
      num_contracts: parseInt(d.num_contracts, 10),
      isHistoric: parseInt(d.year, 10) < HISTORIC_CUTOFF,
    }));

  const hasHistoric = chartData.some((d) => d.isHistoric);

  return (
    <div>
      <ResponsiveContainer width="100%" height={380}>
        <BarChart
          data={chartData}
          margin={{ top: 20, right: 12, left: 12, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="year" fontSize={12} />
          <YAxis
            tickFormatter={(v) => formatCompactNumber(v)}
            fontSize={12}
          />
          <Tooltip
            formatter={(value, _name, props) => {
              const note = props.payload?.isHistoric
                ? " (cobertura parcial, import estimat)"
                : "";
              return [formatCompactNumber(value as number) + note, label];
            }}
            contentStyle={{ borderRadius: "8px", border: "1px solid #e5e7eb", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.07)" }}
          />
          <Bar dataKey={dataKey} radius={[4, 4, 0, 0]}>
            {chartData.map((entry) => (
              <Cell
                key={entry.year}
                fill={entry.isHistoric ? COLOR_HISTORIC : color}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {hasHistoric && (
        <div className="mt-3 flex flex-wrap items-start gap-x-5 gap-y-1 text-xs" style={{ color: COLOR_NOTE }}>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm flex-shrink-0" style={{ background: color }} />
            Dades oficials (CSV CAIB, 2017–present)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm flex-shrink-0" style={{ background: COLOR_HISTORIC }} />
            Dades históriques (plataforma llegada, 2008–2016)
          </span>
          <span className="mt-0.5 w-full leading-snug">
            ⚠️ Les dades anteriors al 2017 tenen cobertura parcial (no tots els òrgans publicaven digitalment)
            i l&apos;import mostrat és el pressupost de licitació quan no es va publicar l&apos;import adjudicat.
            No són comparables directament amb les dades posteriors.
          </span>
        </div>
      )}
    </div>
  );
}
