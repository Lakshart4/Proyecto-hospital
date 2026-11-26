export interface TabItem<K extends string> {
  id: K;
  label: string;
  /** Contador opcional junto a la etiqueta (por ejemplo, Pacientes por estado). */
  count?: number;
}

export interface TabsProps<K extends string> {
  tabs: readonly TabItem<K>[];
  active: K;
  onChange: (id: K) => void;
  label: string;
}

/** Pestañas accesibles con contador opcional. */
export function Tabs<K extends string>({ tabs, active, onChange, label }: TabsProps<K>) {
  return (
    <div role="tablist" aria-label={label} className="flex gap-1 overflow-x-auto border-b border-border">
      {tabs.map((tab) => {
        const selected = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
            className={`whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium transition-colors duration-200 ${
              selected ? 'border-primary bg-active text-heading' : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            {tab.count !== undefined ? `${tab.label} (${tab.count})` : tab.label}
          </button>
        );
      })}
    </div>
  );
}
