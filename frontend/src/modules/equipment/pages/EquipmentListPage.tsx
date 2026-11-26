import { useState } from 'react';
import { Tabs, type TabItem } from '../../../shared/components/Tabs';
import { EquipmentPanel } from '../components/EquipmentPanel';
import { MaintenancePanel } from '../components/MaintenancePanel';
import { SummaryPanel } from '../components/SummaryPanel';

type EquipmentTab = 'equipment' | 'maintenance' | 'summary';

const TABS: readonly TabItem<EquipmentTab>[] = [
  { id: 'equipment', label: 'Equipos' },
  { id: 'maintenance', label: 'Mantenimiento' },
  { id: 'summary', label: 'Resumen' },
];

export function EquipmentListPage() {
  const [activeTab, setActiveTab] = useState<EquipmentTab>('equipment');

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold text-heading">Equipos médicos</h1>
        <p className="mt-1 text-sm text-muted">Inventario, estado operativo, mantenimiento y resumen de equipamiento.</p>
      </header>
      <Tabs tabs={TABS} active={activeTab} onChange={setActiveTab} label="Secciones de equipos médicos" />
      <div role="tabpanel" aria-label={TABS.find((tab) => tab.id === activeTab)?.label}>
        {activeTab === 'equipment' && <EquipmentPanel />}
        {activeTab === 'maintenance' && <MaintenancePanel />}
        {activeTab === 'summary' && <SummaryPanel />}
      </div>
    </div>
  );
}

export const EquipmentPage = EquipmentListPage;
export default EquipmentListPage;
