/**
 * LineageExplorer.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Interactive DAG visualization of data flow: sources → staging → warehouse
 * → mart → ML models → output, built with ReactFlow.
 *
 * Features:
 *  - Custom nodes with layer-based color coding (green/blue/indigo/violet/amber/emerald)
 *  - Animated edges with transformation labels on hover
 *  - Click-to-open right detail panel: schema, sample rows, upstream/downstream,
 *    and "if this breaks" impact analysis
 *  - Minimap, zoom controls, dot-grid background (ReactFlow built-ins)
 *  - Dagre auto-layout (left-to-right)
 */

import { useState, useCallback, useMemo } from 'react';
import ReactFlow, {
    Background,
    Controls,
    MiniMap,
    Handle,
    Position,
    MarkerType,
    useNodesState,
    useEdgesState,
    getBezierPath,
    EdgeLabelRenderer,
    BaseEdge,
} from 'reactflow';
import 'reactflow/dist/style.css';
import dagre from 'dagre';
import RAW_GRAPH from '../../data/lineage_graph.json';

// ─── Layer styling ────────────────────────────────────────────────────────────
const LAYER_COLOR = {
    source:    '#16a34a',  // green-600
    staging:   '#2563eb',  // blue-600
    warehouse: '#7c3aed',  // violet-600
    mart:      '#9333ea',  // purple-600
    ml:        '#d97706',  // amber-600
    output:    '#059669',  // emerald-600
};

const LAYER_BG = {
    source:    '#f0fdf4',
    staging:   '#eff6ff',
    warehouse: '#f5f3ff',
    mart:      '#faf5ff',
    ml:        '#fffbeb',
    output:    '#ecfdf5',
};

const LAYER_LABEL = {
    source:    'SOURCE',
    staging:   'STAGING',
    warehouse: 'WAREHOUSE',
    mart:      'DATA MART',
    ml:        'ML / AI',
    output:    'OUTPUT',
};

// ─── Custom node ─────────────────────────────────────────────────────────────
function LineageNode({ data, selected }) {
    const color = LAYER_COLOR[data.layer] || 'var(--accent-primary)';
    const bg    = LAYER_BG[data.layer]    || 'var(--bg-elevated)';

    return (
        <>
            <Handle type="target" position={Position.Left}
                style={{ background: color, width: 8, height: 8, border: `2px solid ${color}` }} />

            <div
                style={{
                    background: selected ? bg : 'var(--bg-elevated)',
                    border: `1px solid ${selected ? color : 'var(--border-default)'}`,
                    borderTop: `3px solid ${color}`,
                    borderRadius: 'var(--radius-md)',
                    padding: '10px 14px',
                    minWidth: 180,
                    maxWidth: 210,
                    boxShadow: selected ? `0 0 0 2px ${color}33, var(--shadow-md)` : 'var(--shadow-sm)',
                    cursor: 'pointer',
                    transition: 'box-shadow 0.15s, border-color 0.15s',
                    fontFamily: "'Instrument Sans', sans-serif",
                }}
            >
                {/* Layer badge */}
                <div style={{
                    fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
                    color, marginBottom: 5, textTransform: 'uppercase',
                    fontFamily: "'DM Mono', monospace",
                }}>
                    {LAYER_LABEL[data.layer]}
                </div>

                {/* Node name */}
                <div style={{
                    fontSize: 12, fontWeight: 600,
                    color: 'var(--text-primary)',
                    marginBottom: data.rowCount ? 4 : 0,
                    fontFamily: "'DM Mono', monospace",
                    wordBreak: 'break-all',
                }}>
                    {data.name}
                </div>

                {/* Row count */}
                {data.rowCount != null && (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {typeof data.rowCount === 'number'
                            ? data.rowCount.toLocaleString() + ' rows'
                            : data.rowCount}
                    </div>
                )}

                {/* Dropped rows warning */}
                {data.droppedRows > 0 && (
                    <div style={{
                        fontSize: 10, color: '#d97706',
                        fontFamily: "'DM Mono', monospace",
                        marginTop: 3,
                        display: 'flex', alignItems: 'center', gap: 4,
                    }}>
                        <span>⚠</span>
                        <span>{data.droppedRows.toLocaleString()} dropped</span>
                    </div>
                )}

                {/* Note / last updated */}
                {data.note && (
                    <div style={{
                        fontSize: 10, color: 'var(--text-muted)',
                        marginTop: 4, lineHeight: 1.4,
                        fontStyle: 'italic',
                    }}>
                        {data.note}
                    </div>
                )}
                {!data.note && data.lastUpdated && (
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>
                        {data.lastUpdated}
                    </div>
                )}
            </div>

            <Handle type="source" position={Position.Right}
                style={{ background: color, width: 8, height: 8, border: `2px solid ${color}` }} />
        </>
    );
}

// ─── Custom edge with label on hover ─────────────────────────────────────────
function LineageEdge({
    id, sourceX, sourceY, targetX, targetY,
    sourcePosition, targetPosition,
    data, markerEnd, style,
}) {
    const [hovered, setHovered] = useState(false);
    const [edgePath, labelX, labelY] = getBezierPath({
        sourceX, sourceY, sourcePosition,
        targetX, targetY, targetPosition,
    });

    return (
        <>
            <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={style} />

            {/* Invisible wide hit-area for hover */}
            <path
                d={edgePath}
                fill="none"
                stroke="transparent"
                strokeWidth={20}
                onMouseEnter={() => setHovered(true)}
                onMouseLeave={() => setHovered(false)}
                style={{ cursor: 'crosshair' }}
            />

            {/* Edge label */}
            {hovered && data?.label && (
                <EdgeLabelRenderer>
                    <div
                        style={{
                            position: 'absolute',
                            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
                            pointerEvents: 'none',
                            background: 'var(--bg-elevated)',
                            border: '1px solid var(--border-default)',
                            borderRadius: 'var(--radius-md)',
                            padding: '4px 10px',
                            fontSize: 10.5,
                            fontWeight: 600,
                            color: 'var(--text-secondary)',
                            boxShadow: 'var(--shadow-md)',
                            whiteSpace: 'nowrap',
                            fontFamily: "'DM Mono', monospace",
                            zIndex: 100,
                        }}
                        className="nodrag nopan"
                    >
                        {data.label}
                    </div>
                </EdgeLabelRenderer>
            )}
        </>
    );
}

const nodeTypes  = { lineageNode:  LineageNode  };
const edgeTypes  = { lineageEdge:  LineageEdge  };

// ─── Dagre auto-layout ───────────────────────────────────────────────────────
const NODE_WIDTH  = 210;
const NODE_HEIGHT = 110;

function layoutGraph(nodes, edges) {
    const g = new dagre.graphlib.Graph();
    g.setDefaultEdgeLabel(() => ({}));
    g.setGraph({ rankdir: 'LR', nodesep: 40, ranksep: 80, edgesep: 20 });

    nodes.forEach((n) => g.setNode(n.id, { width: NODE_WIDTH, height: NODE_HEIGHT }));
    edges.forEach((e) => g.setEdge(e.source, e.target));

    dagre.layout(g);

    return nodes.map((n) => {
        const pos = g.node(n.id);
        return {
            ...n,
            position: {
                x: pos.x - NODE_WIDTH / 2,
                y: pos.y - NODE_HEIGHT / 2,
            },
        };
    });
}

// ─── Build ReactFlow nodes + edges from JSON ─────────────────────────────────
function buildGraph(graphData) {
    const rawNodes = graphData.nodes.map((n) => ({
        id:   n.id,
        type: 'lineageNode',
        data: {
            ...n,
        },
        position: { x: 0, y: 0 },
    }));

    const rawEdges = graphData.edges.map((e) => {
        const srcLayer = graphData.nodes.find((n) => n.id === e.source)?.layer || 'source';
        const color    = LAYER_COLOR[srcLayer] || '#94a3b8';
        return {
            id:        e.id,
            source:    e.source,
            target:    e.target,
            type:      'lineageEdge',
            animated:  true,
            data:      { label: e.label, transformationType: e.type },
            markerEnd: { type: MarkerType.ArrowClosed, color, width: 14, height: 14 },
            style:     { stroke: color, strokeWidth: 1.5, opacity: 0.75 },
        };
    });

    const laidOut = layoutGraph(rawNodes, rawEdges);
    return { nodes: laidOut, edges: rawEdges };
}

// ─── Detail panel ─────────────────────────────────────────────────────────────
function DetailPanel({ node, onClose }) {
    if (!node) return null;
    const d     = node.data;
    const color = LAYER_COLOR[d.layer] || 'var(--accent-primary)';

    // Build upstream/downstream display names from graph
    const nameMap  = {};
    RAW_GRAPH.nodes.forEach((n) => { nameMap[n.id] = n.name; });

    return (
        <div
            style={{
                position: 'absolute',
                top: 0, right: 0,
                width: 320,
                height: '100%',
                background: 'var(--bg-elevated)',
                borderLeft: `3px solid ${color}`,
                boxShadow: '-4px 0 24px rgba(0,0,0,0.08)',
                display: 'flex', flexDirection: 'column',
                zIndex: 10,
                overflowY: 'auto',
                animation: 'slideIn 200ms cubic-bezier(0.16, 1, 0.3, 1)',
                fontFamily: "'Instrument Sans', sans-serif",
            }}
        >
            <style>{`
                @keyframes slideIn {
                    from { transform: translateX(20px); opacity: 0; }
                    to   { transform: translateX(0);    opacity: 1; }
                }
            `}</style>

            {/* Header */}
            <div style={{
                padding: '16px',
                borderBottom: '1px solid var(--border-subtle)',
                flexShrink: 0,
            }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                    <div>
                        <div style={{
                            fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
                            color, textTransform: 'uppercase', marginBottom: 4,
                            fontFamily: "'DM Mono', monospace",
                        }}>
                            {LAYER_LABEL[d.layer]} · {d.layer === 'source' ? 'Source File' :
                             d.layer === 'staging' ? 'Staging Table' :
                             d.layer === 'warehouse' ? 'Warehouse Table' :
                             d.layer === 'mart' ? 'Data Mart' :
                             d.layer === 'ml' ? 'ML Artifact' : 'Output'}
                        </div>
                        <div style={{
                            fontSize: 14, fontWeight: 700, color: 'var(--text-primary)',
                            fontFamily: "'DM Mono', monospace",
                        }}>
                            {d.name}
                        </div>
                        {d.rowCount != null && (
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                                {typeof d.rowCount === 'number'
                                    ? d.rowCount.toLocaleString() + ' rows'
                                    : d.rowCount}
                                {d.lastUpdated && ` · Updated ${d.lastUpdated}`}
                            </div>
                        )}
                        {d.droppedRows > 0 && (
                            <div style={{
                                marginTop: 6,
                                padding: '4px 10px',
                                background: '#fffbeb',
                                border: '1px solid #fde68a',
                                borderRadius: 'var(--radius-md)',
                                fontSize: 11, color: '#92400e', fontWeight: 600,
                            }}>
                                ⚠ {d.droppedRows.toLocaleString()} rows dropped — {d.droppedReason}
                            </div>
                        )}
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            width: 24, height: 24,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: 'var(--bg-sunken)', border: '1px solid var(--border-subtle)',
                            borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                            color: 'var(--text-muted)', fontSize: 12, flexShrink: 0,
                        }}
                    >
                        ×
                    </button>
                </div>
            </div>

            <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>

                {/* Schema */}
                {d.schema && d.schema.length > 0 && (
                    <section>
                        <SectionHeader label="SCHEMA" />
                        <div style={{
                            background: 'var(--bg-base)',
                            border: '1px solid var(--border-subtle)',
                            borderRadius: 'var(--radius-md)',
                            overflow: 'hidden',
                        }}>
                            {d.schema.slice(0, 6).map((col, i) => (
                                <div key={col.col} style={{
                                    display: 'grid', gridTemplateColumns: '1fr auto',
                                    gap: 8, padding: '6px 10px',
                                    borderBottom: i < Math.min(d.schema.length, 6) - 1
                                        ? '1px solid var(--border-subtle)' : 'none',
                                    alignItems: 'baseline',
                                }}>
                                    <span style={{
                                        fontSize: 11.5, fontWeight: 600,
                                        color: 'var(--text-primary)',
                                        fontFamily: "'DM Mono', monospace",
                                    }}>
                                        {col.col}
                                        {col.note && (
                                            <span style={{ fontSize: 9.5, color: 'var(--text-muted)', marginLeft: 5, fontWeight: 400 }}>
                                                {col.note}
                                            </span>
                                        )}
                                    </span>
                                    <span style={{
                                        fontSize: 10, color: color, fontWeight: 600,
                                        fontFamily: "'DM Mono', monospace",
                                        background: LAYER_BG[d.layer],
                                        padding: '1px 6px', borderRadius: 'var(--radius-pill)',
                                    }}>
                                        {col.type}
                                    </span>
                                </div>
                            ))}
                            {d.schema.length > 6 && (
                                <div style={{
                                    padding: '5px 10px', fontSize: 10.5,
                                    color: 'var(--text-muted)', fontStyle: 'italic',
                                    borderTop: '1px solid var(--border-subtle)',
                                }}>
                                    +{d.schema.length - 6} more columns
                                </div>
                            )}
                        </div>
                    </section>
                )}

                {/* Sample rows */}
                {d.sampleRows && d.sampleRows.length > 0 && (
                    <section>
                        <SectionHeader label="SAMPLE DATA (3 rows)" />
                        <div style={{
                            background: 'var(--bg-base)',
                            border: '1px solid var(--border-subtle)',
                            borderRadius: 'var(--radius-md)',
                            padding: '8px 10px',
                            fontSize: 10.5,
                            fontFamily: "'DM Mono', monospace",
                            color: 'var(--text-secondary)',
                            lineHeight: 1.7,
                            overflowX: 'auto',
                        }}>
                            {d.sampleRows.slice(0, 3).map((row, i) => (
                                <div key={i} style={{ marginBottom: i < 2 ? 4 : 0 }}>
                                    {Object.entries(row).slice(0, 4).map(([k, v], j) => (
                                        <span key={k}>
                                            <span style={{ color }}>{k}</span>
                                            <span style={{ color: 'var(--text-muted)' }}>:</span>
                                            <span style={{ color: 'var(--text-primary)', marginLeft: 2, marginRight: 8 }}>
                                                {typeof v === 'boolean' ? String(v) : String(v)}
                                            </span>
                                        </span>
                                    ))}
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {/* Transformation SQL */}
                {d.transformationSQL && (
                    <section>
                        <SectionHeader label="TRANSFORMATION SQL" />
                        <pre style={{
                            margin: 0,
                            background: 'var(--bg-base)',
                            border: '1px solid var(--border-subtle)',
                            borderRadius: 'var(--radius-md)',
                            padding: '10px 12px',
                            fontSize: 10,
                            fontFamily: "'DM Mono', monospace",
                            color: 'var(--text-secondary)',
                            lineHeight: 1.6,
                            overflowX: 'auto',
                            whiteSpace: 'pre',
                        }}>
                            {d.transformationSQL}
                        </pre>
                    </section>
                )}

                {/* Upstream */}
                {d.upstream && d.upstream.length > 0 && (
                    <section>
                        <SectionHeader label={`UPSTREAM (${d.upstream.length})`} />
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {d.upstream.map((id) => (
                                <div key={id} style={{
                                    fontSize: 11.5, fontFamily: "'DM Mono', monospace",
                                    color: 'var(--text-secondary)',
                                    display: 'flex', alignItems: 'center', gap: 6,
                                }}>
                                    <span style={{ color: LAYER_COLOR['staging'], fontSize: 10 }}>←</span>
                                    {nameMap[id] || id}
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {/* Downstream */}
                {d.downstream && d.downstream.length > 0 && (
                    <section>
                        <SectionHeader label={`DOWNSTREAM (${d.downstream.length})`} />
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {d.downstream.map((id) => (
                                <div key={id} style={{
                                    fontSize: 11.5, fontFamily: "'DM Mono', monospace",
                                    color: 'var(--text-secondary)',
                                    display: 'flex', alignItems: 'center', gap: 6,
                                }}>
                                    <span style={{ color, fontSize: 10 }}>→</span>
                                    {nameMap[id] || id}
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {/* Impact analysis */}
                {d.impact && d.impact.length > 0 && (
                    <section>
                        <SectionHeader label="IF THIS BREAKS…" danger />
                        <div style={{
                            background: '#fff7ed',
                            border: '1px solid #fed7aa',
                            borderRadius: 'var(--radius-md)',
                            padding: '10px 12px',
                            display: 'flex', flexDirection: 'column', gap: 6,
                        }}>
                            {d.impact.map((item, i) => (
                                <div key={i} style={{
                                    fontSize: 11.5, color: '#92400e',
                                    display: 'flex', gap: 8,
                                }}>
                                    <span style={{ flexShrink: 0 }}>⚠</span>
                                    <span>{item}</span>
                                </div>
                            ))}
                        </div>
                    </section>
                )}
            </div>
        </div>
    );
}

function SectionHeader({ label, danger }) {
    return (
        <div style={{
            fontSize: 9.5, fontWeight: 700, letterSpacing: '0.08em',
            color: danger ? '#92400e' : 'var(--text-muted)',
            textTransform: 'uppercase',
            fontFamily: "'DM Mono', monospace",
            marginBottom: 8,
        }}>
            {label}
        </div>
    );
}

// ─── Layer legend ─────────────────────────────────────────────────────────────
function LayerLegend() {
    return (
        <div style={{
            position: 'absolute', bottom: 12, left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center',
            background: 'rgba(255,255,255,0.92)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-pill)',
            padding: '6px 16px',
            boxShadow: 'var(--shadow-sm)',
            backdropFilter: 'blur(8px)',
            zIndex: 5,
            pointerEvents: 'none',
        }}>
            {Object.entries(LAYER_LABEL).map(([layer, label]) => (
                <span key={layer} style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    fontSize: 10, fontWeight: 600,
                    fontFamily: "'DM Mono', monospace",
                }}>
                    <span style={{
                        width: 8, height: 8, borderRadius: '50%',
                        background: LAYER_COLOR[layer], flexShrink: 0,
                    }} />
                    <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
                </span>
            ))}
        </div>
    );
}

// ─── Main component ───────────────────────────────────────────────────────────
const { nodes: INIT_NODES, edges: INIT_EDGES } = buildGraph(RAW_GRAPH);

export default function LineageExplorer() {
    const [nodes, setNodes, onNodesChange] = useNodesState(INIT_NODES);
    const [edges, setEdges, onEdgesChange] = useEdgesState(INIT_EDGES);
    const [selectedNode, setSelectedNode]  = useState(null);

    const onNodeClick = useCallback((_, node) => {
        setSelectedNode(node);
        // Highlight edges connected to this node
        setEdges((prev) =>
            prev.map((e) => ({
                ...e,
                style: {
                    ...e.style,
                    opacity: (e.source === node.id || e.target === node.id) ? 1 : 0.2,
                    strokeWidth: (e.source === node.id || e.target === node.id) ? 2.5 : 1,
                },
            }))
        );
    }, [setEdges]);

    const onPaneClick = useCallback(() => {
        setSelectedNode(null);
        // Reset edge opacity
        setEdges((prev) =>
            prev.map((e) => ({
                ...e,
                style: { ...e.style, opacity: 0.75, strokeWidth: 1.5 },
            }))
        );
    }, [setEdges]);

    const closePanel = useCallback(() => {
        setSelectedNode(null);
        setEdges((prev) =>
            prev.map((e) => ({
                ...e,
                style: { ...e.style, opacity: 0.75, strokeWidth: 1.5 },
            }))
        );
    }, [setEdges]);

    return (
        <div style={{ position: 'relative', height: 680, background: 'var(--bg-base)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', border: '1px solid var(--border-default)' }}>
            <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onNodeClick={onNodeClick}
                onPaneClick={onPaneClick}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                fitView
                fitViewOptions={{ padding: 0.2 }}
                minZoom={0.15}
                maxZoom={1.8}
                attributionPosition="bottom-left"
            >
                <Background
                    variant="dots"
                    gap={18}
                    size={1.2}
                    color="var(--border-subtle)"
                />
                <Controls
                    position="bottom-left"
                    style={{ marginBottom: 48 }}
                />
                <MiniMap
                    position="bottom-right"
                    style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', marginBottom: 4 }}
                    nodeColor={(n) => LAYER_COLOR[n.data?.layer] || '#94a3b8'}
                    maskColor="rgba(255,255,255,0.6)"
                />
            </ReactFlow>

            <LayerLegend />

            {/* Detail panel slides in from the right */}
            {selectedNode && (
                <DetailPanel node={selectedNode} onClose={closePanel} />
            )}
        </div>
    );
}
