import type { ReactNode } from "react";

type DataGridShellProps = {
  children: ReactNode;
  minWidth?: number;
};

export default function DataGridShell({ children, minWidth }: DataGridShellProps) {
  return (
    <div className="data-grid-shell">
      <div className="record-table-wrap">
        <div className="data-grid-inner" style={minWidth ? { minWidth } : undefined}>
          {children}
        </div>
      </div>
    </div>
  );
}
