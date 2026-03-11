import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { ChevronUp, ChevronDown, Search, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import RiskBadge from '../design-system/components/RiskBadge.jsx';

/**
 * DataTable — sortable, searchable, paginated data table.
 * Conforms to the CareIQ dark zebra table design spec.
 * @param {Array} columns - [{ key, label, render?, sortable?, width? }]
 * @param {Array} data    - Row objects
 * @param {string} onRowLink - Key to use as /patients/:id navigation target (optional)
 * @param {boolean} isLoading
 * @param {number} pageSize
 */
export default function DataTable({
    columns = [],
    data = [],
    onRowLink,
    isLoading = false,
    pageSize = 15,
    searchable = true,
    emptyMessage = 'No records found.',
}) {
    const [sortKey, setSortKey] = useState(null);
    const [sortDir, setSortDir] = useState('asc');
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const navigate = useNavigate();

    const handleSort = (key) => {
        if (sortKey === key) {
            setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
        } else {
            setSortKey(key);
            setSortDir('asc');
        }
        setPage(1);
    };

    const filtered = useMemo(() => {
        if (!search) return data;
        const q = search.toLowerCase();
        return data.filter((row) =>
            Object.values(row).some((v) => String(v).toLowerCase().includes(q))
        );
    }, [data, search]);

    const sorted = useMemo(() => {
        if (!sortKey) return filtered;
        return [...filtered].sort((a, b) => {
            const av = a[sortKey]; const bv = b[sortKey];
            if (av == null) return 1;
            if (bv == null) return -1;
            const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true });
            return sortDir === 'asc' ? cmp : -cmp;
        });
    }, [filtered, sortKey, sortDir]);

    const totalPages = Math.ceil(sorted.length / pageSize);
    const paged = sorted.slice((page - 1) * pageSize, page * pageSize);

    if (isLoading) return <TableSkeleton columns={columns} />;

    return (
        <div
            style={{
                background: '#111827',
                border: '1px solid #1F2937',
                borderRadius: '12px',
                overflow: 'hidden',
            }}
        >
            {/* Search bar */}
            {searchable && (
                <div
                    className="flex items-center gap-2 px-4 py-3"
                    style={{ borderBottom: '1px solid #1F2937' }}
                >
                    <Search size={14} color="#4B5563" />
                    <input
                        className="bg-transparent border-none outline-none w-full text-sm placeholder-text-muted"
                        style={{ color: '#F9FAFB', fontSize: '13px', fontFamily: '"Inter", system-ui, sans-serif' }}
                        placeholder="Search…"
                        value={search}
                        onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                    />
                </div>
            )}

            {/* Table */}
            <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                    <thead>
                        <tr style={{ background: '#0A0F1C' }}>
                            {columns.map((col) => (
                                <th
                                    key={col.key}
                                    scope="col"
                                    className={clsx('px-4 py-3 text-left', col.sortable !== false && 'cursor-pointer select-none')}
                                    style={{
                                        fontSize: '11px',
                                        fontWeight: 600,
                                        letterSpacing: '0.05em',
                                        textTransform: 'uppercase',
                                        color: '#9CA3AF',
                                        whiteSpace: 'nowrap',
                                        width: col.width,
                                    }}
                                    onClick={() => col.sortable !== false && handleSort(col.key)}
                                >
                                    <span className="flex items-center gap-1">
                                        {col.label}
                                        {col.sortable !== false && sortKey === col.key && (
                                            sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />
                                        )}
                                    </span>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {paged.length === 0 ? (
                            <tr>
                                <td colSpan={columns.length} className="text-center py-12" style={{ color: '#4B5563', fontSize: '13px' }}>
                                    {emptyMessage}
                                </td>
                            </tr>
                        ) : (
                            paged.map((row, ri) => (
                                <motion.tr
                                    key={ri}
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ delay: ri * 0.03 }}
                                    style={{
                                        background: ri % 2 === 0 ? '#111827' : '#0D1321',
                                        cursor: onRowLink ? 'pointer' : 'default',
                                        transition: 'background 150ms ease',
                                    }}
                                    onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0,212,255,0.05)'; }}
                                    onMouseLeave={(e) => { e.currentTarget.style.background = ri % 2 === 0 ? '#111827' : '#0D1321'; }}
                                    onClick={() => {
                                        if (onRowLink && row[onRowLink]) {
                                            navigate(`/patients/${row[onRowLink]}`);
                                        }
                                    }}
                                >
                                    {columns.map((col) => (
                                        <td
                                            key={col.key}
                                            className="px-4 py-3"
                                            style={{ fontSize: '13px', color: '#F9FAFB', borderBottom: '1px solid rgba(31,41,55,0.5)', whiteSpace: 'nowrap' }}
                                        >
                                            {col.render
                                                ? col.render(row[col.key], row)
                                                : row[col.key] ?? '—'}
                                        </td>
                                    ))}
                                </motion.tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <div
                    className="flex items-center justify-between px-4 py-3"
                    style={{ borderTop: '1px solid #1F2937' }}
                >
                    <p style={{ fontSize: '12px', color: '#9CA3AF' }}>
                        {sorted.length} records · Page {page} of {totalPages}
                    </p>
                    <div className="flex items-center gap-2">
                        <button
                            className="btn-ghost py-1 px-2 text-xs"
                            disabled={page === 1}
                            onClick={() => setPage(1)}
                        >
                            <ChevronsLeft size={14} />
                        </button>
                        <button
                            className="btn-ghost py-1 px-2 text-xs"
                            disabled={page === 1}
                            onClick={() => setPage((p) => p - 1)}
                        >
                            Prev
                        </button>
                        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                            const pg = Math.max(1, Math.min(page - 2, totalPages - 4)) + i;
                            return (
                                <button
                                    key={pg}
                                    className={clsx(
                                        'w-7 h-7 rounded-md text-xs font-medium',
                                        pg === page ? 'btn-primary' : 'btn-ghost'
                                    )}
                                    onClick={() => setPage(pg)}
                                >
                                    {pg}
                                </button>
                            );
                        })}
                        <button
                            className="btn-ghost py-1 px-2 text-xs"
                            disabled={page === totalPages}
                            onClick={() => setPage((p) => p + 1)}
                        >
                            Next
                        </button>
                        <button
                            className="btn-ghost py-1 px-2 text-xs"
                            disabled={page === totalPages}
                            onClick={() => setPage(totalPages)}
                        >
                            <ChevronsRight size={14} />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

function TableSkeleton({ columns }) {
    return (
        <div className="rounded-lg overflow-hidden" style={{ border: '1px solid #1F2937' }}>
            <div className="skeleton h-10 w-full" style={{ borderRadius: 0 }} />
            {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex gap-4 px-4 py-3" style={{ borderBottom: '1px solid rgba(31,41,55,0.5)' }}>
                    {columns.map((_, j) => (
                        <div key={j} className="skeleton h-4 flex-1" />
                    ))}
                </div>
            ))}
        </div>
    );
}
