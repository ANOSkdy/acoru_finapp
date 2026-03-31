import type { ReactNode } from "react";

export default function GridToolbar({ children }: { children: ReactNode }) {
  return <div className="record-toolbar">{children}</div>;
}
