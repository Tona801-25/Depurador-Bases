import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart3, Clock, Filter, BookOpen, Scissors, Layers, Eye } from "lucide-react";

const tabs = [
  { value: "visual", label: "Tablero visual", icon: <Eye className="h-3.5 w-3.5" /> },
  { value: "turnos", label: "Turnos y prefijos", icon: <Clock className="h-3.5 w-3.5" /> },
  { value: "prefijos-hora", label: "Prefijos por hora", icon: <BarChart3 className="h-3.5 w-3.5" /> },
  { value: "depuracion", label: "Depuración sugerida", icon: <Layers className="h-3.5 w-3.5" /> },
  { value: "filtro", label: "Filtro detallado", icon: <Filter className="h-3.5 w-3.5" /> },
  { value: "catalogo", label: "Catálogo de prefijos", icon: <BookOpen className="h-3.5 w-3.5" /> },
  { value: "simulador", label: "Simulador de cortes", icon: <Scissors className="h-3.5 w-3.5" /> },
];

interface DashboardTabsProps {
  activeTab: string;
  onTabChange: (value: string) => void;
}

const DashboardTabs = ({ activeTab, onTabChange }: DashboardTabsProps) => {
  return (
    <Tabs value={activeTab} onValueChange={onTabChange} className="w-full">
      <TabsList className="w-full h-auto flex-wrap gap-1 bg-secondary/50 p-1.5 rounded-xl">
        {tabs.map((tab) => (
          <TabsTrigger
            key={tab.value}
            value={tab.value}
            className="flex items-center gap-1.5 text-xs px-3 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-lg transition-all"
          >
            {tab.icon}
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
};

export default DashboardTabs;
