import React, { useState } from "react";
import type { Task } from "@/lib/types";

interface ProofReviewSectionProps {
  task: Task & { proofStatus?: string };
  onStatusChange?: (newStatus: string) => void;
}

export default function ProofReviewSection({ task, onStatusChange }: ProofReviewSectionProps) {
  // State for the proof status ('Pending', 'Accepted', 'Rejected', 'Re-upload')
  const [proofStatus, setProofStatus] = useState(
    task.proofStatus ||
      (task.status === "approved"
        ? "Accepted"
        : task.status === "rejected"
          ? "Rejected"
          : task.status === "revision_requested"
            ? "Re-upload"
            : "Pending"),
  );

  // Helper function to determine badge styling based on selected status
  const getStatusBadgeStyle = (status: string) => {
    switch (status) {
      case "Accepted":
        return "bg-emerald-500/10 text-emerald-600 border-emerald-500/30";
      case "Rejected":
        return "bg-rose-500/10 text-rose-600 border-rose-500/30";
      case "Re-upload":
        return "bg-amber-500/10 text-amber-600 border-amber-500/30";
      default:
        return "bg-purple-500/10 text-purple-600 border-purple-500/30";
    }
  };

  const handleStatusChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newStatus = e.target.value;
    setProofStatus(newStatus);
    onStatusChange?.(newStatus);
  };

  const proofCount = task.proofs?.length ?? 0;

  return (
    <div className="mt-4 p-4 bg-purple-50/50 dark:bg-purple-950/20 border border-purple-100 dark:border-purple-900/50 rounded-2xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Left: Proof Information */}
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-white dark:bg-purple-900/60 rounded-xl shadow-sm border border-purple-100 dark:border-purple-800">
            <svg
              className="w-5 h-5 text-purple-600 dark:text-purple-300"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          </div>
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400">
              Submitted Completion Proof ({proofCount})
            </span>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Review and update status for team member submission
            </p>
          </div>
        </div>

        {/* Right: Status Dropdown Selector */}
        <div className="flex items-center space-x-2">
          <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">Status:</span>
          <div className="relative">
            <select
              value={proofStatus}
              onChange={handleStatusChange}
              className={`text-xs font-bold px-3 py-1.5 rounded-xl border appearance-none pr-8 cursor-pointer focus:outline-none focus:ring-2 focus:ring-purple-500 transition-colors ${getStatusBadgeStyle(proofStatus)}`}
            >
              <option value="Pending" disabled>
                Pending Review
              </option>
              <option
                value="Accepted"
                className="bg-white dark:bg-purple-950 text-emerald-600 font-medium"
              >
                Accept
              </option>
              <option
                value="Rejected"
                className="bg-white dark:bg-purple-950 text-rose-600 font-medium"
              >
                Reject
              </option>
              <option
                value="Re-upload"
                className="bg-white dark:bg-purple-950 text-amber-600 font-medium"
              >
                Re-upload
              </option>
            </select>
            {/* Custom Arrow Icon */}
            <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-current opacity-70">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
