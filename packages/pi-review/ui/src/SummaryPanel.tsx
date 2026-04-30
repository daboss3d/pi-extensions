import { marked } from "marked";

interface SummaryPanelProps {
  summary: string;
  onClose: () => void;
}

export function SummaryPanel({ summary, onClose }: SummaryPanelProps) {
  return (
    <div className="summary-panel">
        <div className="summary-panel-hdr">
          <span className="summary-panel-title">Overview</span>
          <button className="icon-btn" onClick={onClose} title="Close">
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block" }}>
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div className="summary-panel-body md" dangerouslySetInnerHTML={{ __html: marked(summary) as string }} />
      </div>
  );
}
