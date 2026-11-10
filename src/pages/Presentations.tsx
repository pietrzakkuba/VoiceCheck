import { CalibrationPrompt } from '@/components/CalibrationPrompt';
import { PresentationList } from '@/components/PresentationList';

export default function Presentations() {
  return (
    <div className="space-y-6">
      <CalibrationPrompt />
      <PresentationList />
    </div>
  );
}
