"use client";

import React, { useState, useEffect } from 'react';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { RawData, ColumnMapping, guessMapping, normalizeData, ColumnType, detectStartRow } from '@/lib/importer';

interface ImportConfirmationProps {
    rawData: RawData;
    onConfirm: (data: any[]) => void;
    onCancel: () => void;
    onDelimiterChange: (delimiter: string) => void;
}

export const ImportConfirmation: React.FC<ImportConfirmationProps> = ({ rawData, onConfirm, onCancel, onDelimiterChange }) => {
    const [mapping, setMapping] = useState<ColumnMapping>({
        dateIndex: null,
        amountIndex: null,
        merchantIndex: null,
        ignoreIndices: []
    });

    const [headerOverride, setHeaderOverride] = useState(rawData.hasHeader);
    const [startRow, setStartRow] = useState(() => detectStartRow(rawData.rows));

    const columnCount = rawData.columnCount;

    useEffect(() => {
        // When rawData or startRow changes, we re-guess mapping starting from that row
        const rowsToGuess = rawData.rows.slice(startRow);
        setMapping(guessMapping(rowsToGuess, headerOverride));

        // Auto-scroll to start row for better visibility
        const rowEl = document.getElementById(`mapping-row-${startRow}`);
        if (rowEl) {
            rowEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, [rawData, startRow, headerOverride]);

    const previewRows = rawData.rows.slice(0, 50); // Increased slice to ensure we can scroll far enough if needed

    const handleColumnChange = (colIndex: number, type: ColumnType) => {
        const newMapping = { ...mapping };

        // Clear existing
        if (newMapping.dateIndex === colIndex) newMapping.dateIndex = null;
        if (newMapping.amountIndex === colIndex) newMapping.amountIndex = null;
        if (newMapping.merchantIndex === colIndex) newMapping.merchantIndex = null;
        newMapping.ignoreIndices = newMapping.ignoreIndices.filter(i => i !== colIndex);

        if (type === 'date') newMapping.dateIndex = colIndex;
        else if (type === 'amount') newMapping.amountIndex = colIndex;
        else if (type === 'merchant') newMapping.merchantIndex = colIndex;
        else if (type === 'date_merchant') {
            newMapping.dateIndex = colIndex;
            newMapping.merchantIndex = colIndex;
        }
        else newMapping.ignoreIndices.push(colIndex);

        setMapping(newMapping);
    };

    const currentType = (idx: number): ColumnType => {
        if (mapping.dateIndex === idx && mapping.merchantIndex === idx) return 'date_merchant';
        if (mapping.dateIndex === idx) return 'date';
        if (mapping.amountIndex === idx) return 'amount';
        if (mapping.merchantIndex === idx) return 'merchant';
        return 'ignore';
    };

    const canConfirm = mapping.amountIndex !== null && (
        (mapping.dateIndex !== null && mapping.merchantIndex !== null) ||
        (mapping.dateIndex === mapping.merchantIndex && mapping.dateIndex !== null)
    );

    return (
        <Card glass className="mt-5 p-6 border border-slate-200 shadow-2xl bg-white backdrop-blur-xl rounded-[2.5rem]">
            <div className="mb-6">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-extrabold text-slate-900">Confirm Column Mapping</h3>
                    <div className="flex items-center gap-4 text-xs">
                        <span className="text-slate-400 font-bold uppercase tracking-wider">Delimiter:</span>
                        <select
                            value={rawData.delimiter}
                            onChange={(e) => onDelimiterChange(e.target.value)}
                            className="bg-white border border-slate-200 text-slate-700 rounded-lg px-3 py-1.5 font-semibold outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all shadow-sm"
                        >
                            <option value=",">Comma (,)</option>
                            <option value=";">Semicolon (;)</option>
                            <option value="|">Pipe (|)</option>
                            <option value="&#9;">Tab</option>
                        </select>
                        <span className="text-slate-400 font-medium">Encoding: <strong className="text-slate-900">{rawData.encoding}</strong></span>
                    </div>
                </div>

                <div className="mt-3 px-4 py-3 bg-blue-50 border border-blue-100 rounded-xl text-sm flex items-center gap-3 text-blue-900">
                    <span className="text-blue-500 text-lg">💡</span>
                    <span>Click a row below to set it as the <strong className="text-blue-900">Starting Point</strong>. Use the checkbox to indicate if it is a header row.</span>
                </div>
                {columnCount > 5 && (
                    <div className="mt-3 text-emerald-600 text-xs font-bold flex items-center gap-1">
                        <span>→</span> Scroll right to see all {columnCount} columns
                    </div>
                )}
            </div>

            <div className="overflow-x-auto mb-6 max-h-[500px] border border-slate-200 rounded-2xl custom-scrollbar shadow-inner bg-slate-50/50">
                <table className="w-full border-collapse text-xs table-auto">
                    <thead>
                        <tr className="sticky top-0 z-10 bg-white border-b-2 border-slate-100">
                            <th className="w-10 p-3 text-center border-r border-slate-100"></th>
                            {Array.from({ length: columnCount }).map((_, i) => (
                                <th key={i} className="p-2 text-left border-r border-slate-100 last:border-0 min-w-[140px]">
                                    <select
                                        value={currentType(i)}
                                        onChange={(e) => handleColumnChange(i, e.target.value as ColumnType)}
                                        className={`w-full p-2.5 rounded-xl text-[11px] font-bold border outline-none transition-all shadow-sm ${currentType(i) !== 'ignore'
                                            ? 'bg-emerald-500 border-emerald-600 text-white'
                                            : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                                            }`}
                                    >
                                        <option value="ignore">Ignore Column</option>
                                        <option value="date">📅 Date</option>
                                        <option value="amount">💰 Amount</option>
                                        <option value="merchant">🏢 Merchant</option>
                                        <option value="date_merchant">📅 Date & Merchant</option>
                                    </select>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {previewRows.map((row, rIdx) => {
                            const isSelected = rIdx === startRow;
                            const isHeader = isSelected && headerOverride;
                            const isDataStart = rIdx === (headerOverride ? startRow + 1 : startRow);
                            const isSkipped = rIdx < startRow;

                            return (
                                <tr
                                    key={rIdx}
                                    id={`mapping-row-${rIdx}`}
                                    onClick={() => setStartRow(rIdx)}
                                    className={`cursor-pointer transition-colors border-b border-slate-100 last:border-0 ${isSelected ? 'bg-blue-500/10 hover:bg-blue-500/20' :
                                        isDataStart ? 'bg-emerald-500/5' :
                                            'hover:bg-slate-50'
                                        } ${isSkipped ? 'opacity-40 grayscale' : 'opacity-100'}`}
                                >
                                    <td className={`p-2 text-center text-[10px] font-bold border-r border-slate-100 ${isSelected ? 'text-blue-600' : 'text-slate-400'
                                        }`}>
                                        {isSelected ? (headerOverride ? 'HDR' : 'DATA') : rIdx + 1}
                                    </td>
                                    {Array.from({ length: columnCount }).map((_, cIdx) => {
                                        const cell = row[cIdx] || '';
                                        const isMapped = !isSkipped && currentType(cIdx) !== 'ignore';

                                        return (
                                            <td key={cIdx} className={`p-2.5 whitespace-nowrap max-w-[250px] overflow-hidden text-ellipsis border-r border-slate-100 last:border-0 ${isMapped ? 'bg-emerald-500/5 text-emerald-900 font-bold' : 'text-slate-500'
                                                }`}>
                                                {cell}
                                            </td>
                                        );
                                    })}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            <div className="flex justify-between items-center pt-4 border-t border-slate-100">
                <div className="flex items-center gap-6">
                    <label className="flex items-center gap-2 cursor-pointer text-sm font-semibold text-slate-600 hover:text-slate-900 transition-colors">
                        <input
                            type="checkbox"
                            checked={headerOverride}
                            onChange={e => setHeaderOverride(e.target.checked)}
                            className="rounded-md border-slate-300 bg-white text-emerald-500 focus:ring-emerald-500/50 w-4 h-4"
                        />
                        <span>Row {startRow + 1} contains headers</span>
                    </label>
                </div>
                <div className="flex gap-3">
                    <Button variant="secondary" onClick={onCancel} className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-6 py-3 rounded-xl">Cancel</Button>
                    <Button
                        variant="primary"
                        disabled={!canConfirm}
                        onClick={() => {
                            const normalized = normalizeData(rawData.rows, headerOverride, mapping, startRow);
                            onConfirm(normalized);
                        }}
                        className={`transition-all px-10 py-3 text-base rounded-xl font-bold border-0 ${canConfirm ? 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-xl shadow-emerald-500/20' : 'opacity-50 cursor-not-allowed bg-slate-200 text-slate-500'}`}
                    >
                        Import {Math.max(0, rawData.rows.length - startRow - (headerOverride ? 1 : 0))} rows
                    </Button>
                </div>
            </div>
            {!canConfirm && (
                <p className="text-right text-[11px] font-black uppercase tracking-tight text-red-500 mt-3 animate-pulse">
                    Missing: {mapping.dateIndex === null ? 'Date ' : ''} {mapping.amountIndex === null ? 'Amount ' : ''} {mapping.merchantIndex === null ? 'Merchant' : ''}
                </p>
            )}
        </Card>
    );
};
