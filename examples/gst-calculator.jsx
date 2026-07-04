/**
 * @stele-manifest
 * name: GST Calculator
 * version: 1.0.0
 * description: Enter a total dollar amount (GST inclusive) and see the pre-GST amount and GST component. Australian 10% GST.
 * archetype: self-contained
 */

import { useState } from "react";
import { DollarSign } from "lucide-react";

const GST_RATE = 0.1;

function formatAUD(n) {
  return n.toLocaleString("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function GstCalculator() {
  const [input, setInput] = useState("");

  const total = parseFloat(input);
  const valid = !isNaN(total) && total >= 0;
  const preGst = valid ? total / (1 + GST_RATE) : 0;
  const gst = valid ? total - preGst : 0;

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-8">
        <h1 className="text-2xl font-semibold text-slate-900 mb-1">GST Calculator</h1>
        <p className="text-sm text-slate-500 mb-6">Australian 10% GST — enter total to see pre-GST amount.</p>

        <label className="block text-sm font-medium text-slate-700 mb-2">
          Total amount (GST inclusive)
        </label>
        <div className="relative mb-6">
          <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="0.00"
            className="w-full pl-10 pr-4 py-3 text-lg border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            autoFocus
          />
        </div>

        <div className="space-y-3">
          <div className="flex justify-between items-baseline py-3 px-4 bg-blue-50 rounded-lg border border-blue-100">
            <span className="text-sm font-medium text-blue-900">Amount before GST</span>
            <span className="text-xl font-semibold text-blue-900 tabular-nums">
              {valid ? formatAUD(preGst) : "—"}
            </span>
          </div>
          <div className="flex justify-between items-baseline py-2 px-4 text-slate-600">
            <span className="text-sm">GST (10%)</span>
            <span className="tabular-nums">{valid ? formatAUD(gst) : "—"}</span>
          </div>
          <div className="flex justify-between items-baseline py-2 px-4 text-slate-600 border-t border-slate-100">
            <span className="text-sm">Total</span>
            <span className="tabular-nums">{valid ? formatAUD(total) : "—"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
