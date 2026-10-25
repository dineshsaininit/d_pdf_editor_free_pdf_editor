import {
  PenTool, Signature, ClipboardList, EyeOff, Hash, Stamp, Crop, Tags, Combine, Scissors, LayoutGrid, FileMinus,
  FileOutput, RotateCw, Minimize2, Wrench, Contrast, Scaling, FileImage, FileType, FileSpreadsheet, Code, Type,
  FileText, Image, Sheet, Presentation, AlignLeft, Lock, LockOpen, Layers, ScanText, GitCompareArrows,
} from 'lucide-react';

const ICONS = {
  PenTool, Signature, ClipboardList, EyeOff, Hash, Stamp, Crop, Tags, Combine, Scissors, LayoutGrid, FileMinus,
  FileOutput, RotateCw, Minimize2, Wrench, Contrast, Scaling, FileImage, FileType, FileSpreadsheet, Code, Type,
  FileText, Image, Sheet, Presentation, AlignLeft, Lock, LockOpen, Layers, ScanText, GitCompareArrows,
};

export function ToolIcon({ tool, size = 22 }) {
  const C = ICONS[tool.icon] || FileText;
  return (
    <span className="tool-icon" style={{ '--c': tool.color }}>
      <C size={size} strokeWidth={2} />
    </span>
  );
}
