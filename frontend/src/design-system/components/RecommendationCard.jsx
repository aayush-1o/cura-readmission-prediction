import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp, Clock, User, Shield } from 'lucide-react';
import clsx from 'clsx';

const CATEGORY_ICONS = {
    medication_management: '💊',
    discharge_planning: '🏠',
    patient_education: '📋',
    social_support: '🤝',
    clinical_monitoring: '📊',
    specialist_referral: '⚕',
};
const CATEGORY_COLORS = {
    medication_management: '#00D4FF',
    discharge_planning: '#10B981',
    patient_education: '#3B82F6',
    social_support: '#8B5CF6',
    clinical_monitoring: '#F59E0B',
    specialist_referral: '#EF4444',
};
const TIME_LABELS = {
    before_discharge: 'Before discharge',
    within_48h: 'Within 48 hrs',
    within_7d: 'Within 7 days',
    ongoing: 'Ongoing',
};
const EVIDENCE_CONFIG = {
    A: { label: 'Grade A', color: '#10B981', bg: 'rgba(16,185,129,0.12)' },
    B: { label: 'Grade B', color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
    C: { label: 'Grade C', color: '#9CA3AF', bg: 'rgba(156,163,175,0.12)' },
};

/**
 * RecommendationCard — individual care pathway recommendation.
 * @param {object} rec - Recommendation object from /recommendations/care-plan
 * @param {number} index - Stagger index for animation
 */
export default function RecommendationCard({ rec, index = 0 }) {
    const [expanded, setExpanded] = useState(false);
    const categoryColor = CATEGORY_COLORS[rec.category] || '#9CA3AF';
    const evidenceConfig = EVIDENCE_CONFIG[rec.evidence_grade] || EVIDENCE_CONFIG.C;

    return (
        <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.08, duration: 0.3 }}
            className="group"
            style={{
                background: '#111827',
                border: `1px solid #1F2937`,
                borderRadius: '10px',
                overflow: 'hidden',
                transition: 'border-color 200ms ease, box-shadow 200ms ease',
            }}
            onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = `${categoryColor}40`;
                e.currentTarget.style.boxShadow = `0 0 0 1px ${categoryColor}20`;
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#1F2937';
                e.currentTarget.style.boxShadow = 'none';
            }}
        >
            {/* Colored left accent */}
            <div
                style={{
                    position: 'absolute',
                    left: 0, top: 0, bottom: 0, width: '3px',
                    background: categoryColor,
                    borderRadius: '10px 0 0 10px',
                }}
            />

            <button
                className="w-full text-left p-4 pl-5 flex items-start gap-3"
                onClick={() => setExpanded(!expanded)}
                aria-expanded={expanded}
            >
                {/* Priority badge */}
                <span
                    className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center font-mono font-medium text-xs"
                    style={{ background: `${categoryColor}20`, color: categoryColor, border: `1px solid ${categoryColor}40` }}
                >
                    {rec.priority}
                </span>

                <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1">
                        <p
                            style={{ fontSize: '13px', fontWeight: 600, color: '#F9FAFB', lineHeight: 1.4 }}
                            className="flex-1"
                        >
                            {rec.action}
                        </p>
                        <div className="flex items-center gap-1 flex-shrink-0 mt-0.5">
                            {expanded ? <ChevronUp size={14} color="#9CA3AF" /> : <ChevronDown size={14} color="#9CA3AF" />}
                        </div>
                    </div>

                    {/* Chips row */}
                    <div className="flex flex-wrap items-center gap-2">
                        {/* Category chip */}
                        <span style={{ fontSize: '11px', color: categoryColor }}>
                            {rec.category_label}
                        </span>

                        {/* Evidence grade */}
                        <span
                            style={{
                                fontSize: '10px', fontWeight: 600, padding: '1px 6px',
                                borderRadius: '4px', background: evidenceConfig.bg, color: evidenceConfig.color,
                            }}
                        >
                            {evidenceConfig.label}
                        </span>

                        {/* Time sensitivity */}
                        <span
                            className="flex items-center gap-1"
                            style={{ fontSize: '11px', color: '#9CA3AF' }}
                        >
                            <Clock size={10} />
                            {TIME_LABELS[rec.time_sensitivity] || rec.time_sensitivity}
                        </span>

                        {/* Impact */}
                        <span
                            style={{
                                fontSize: '11px', fontWeight: 500,
                                color: '#10B981',
                            }}
                        >
                            −{rec.reduces_readmission_by_pct}% readmission
                        </span>
                    </div>
                </div>
            </button>

            {/* Expanded content */}
            <AnimatePresence initial={false}>
                {expanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2, ease: 'easeInOut' }}
                        style={{ overflow: 'hidden' }}
                    >
                        <div
                            className="px-5 pb-4 space-y-3"
                            style={{ borderTop: '1px solid #1F2937', paddingTop: '12px' }}
                        >
                            {/* Rationale */}
                            <div>
                                <p
                                    style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#4B5563', marginBottom: '4px' }}
                                >
                                    Clinical Rationale
                                </p>
                                <p style={{ fontSize: '13px', color: '#9CA3AF', lineHeight: 1.6 }}>
                                    {rec.rationale}
                                </p>
                            </div>

                            {/* Source + Role row */}
                            <div className="flex items-center gap-4">
                                <div className="flex items-center gap-1.5">
                                    <Shield size={12} color="#4B5563" />
                                    <span style={{ fontSize: '11px', color: '#9CA3AF' }}>{rec.clinical_source || 'Evidence-based'}</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <User size={12} color="#4B5563" />
                                    <span style={{ fontSize: '11px', color: '#9CA3AF', textTransform: 'capitalize' }}>
                                        {rec.responsible_role?.replace('_', ' ')}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}
