import { useEffect, useState } from "react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import {
  BarChart3,
  Clock,
  Filter,
  BookOpen,
  Scissors,
  Layers,
  Eye,
  Upload,
  Moon,
  Sun,
  Maximize2,
} from "lucide-react";
import { useTheme } from "@/lib/theme-provider";
import { toast } from "sonner";

interface CommandPaletteProps {
  onTabChange?: (value: string) => void;
  onPresentation?: () => void;
}

const CommandPalette = ({ onTabChange, onPresentation }: CommandPaletteProps) => {
  const [open, setOpen] = useState(false);
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const go = (tab: string, label: string) => {
    onTabChange?.(tab);
    setOpen(false);
    toast.success(`Abriendo: ${label}`);
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Buscar acción, vista, prefijo…" />
      <CommandList>
        <CommandEmpty>Sin resultados.</CommandEmpty>

        <CommandGroup heading="Vistas">
          <CommandItem onSelect={() => go("visual", "Tablero visual")}>
            <Eye className="mr-2 h-4 w-4" /> Tablero visual
            <CommandShortcut>⌘1</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => go("turnos", "Turnos y prefijos")}>
            <Clock className="mr-2 h-4 w-4" /> Turnos y prefijos
            <CommandShortcut>⌘2</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => go("prefijos-hora", "Prefijos por hora")}>
            <BarChart3 className="mr-2 h-4 w-4" /> Prefijos por hora
          </CommandItem>
          <CommandItem onSelect={() => go("depuracion", "Depuración sugerida")}>
            <Layers className="mr-2 h-4 w-4" /> Depuración sugerida
          </CommandItem>
          <CommandItem onSelect={() => go("filtro", "Filtro detallado")}>
            <Filter className="mr-2 h-4 w-4" /> Filtro detallado
          </CommandItem>
          <CommandItem onSelect={() => go("catalogo", "Catálogo de prefijos")}>
            <BookOpen className="mr-2 h-4 w-4" /> Catálogo de prefijos
          </CommandItem>
          <CommandItem onSelect={() => go("simulador", "Simulador de cortes")}>
            <Scissors className="mr-2 h-4 w-4" /> Simulador de cortes
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Acciones">
          <CommandItem
            onSelect={() => {
              setOpen(false);
              document.querySelector<HTMLInputElement>('input[type="file"]')?.click();
            }}
          >
            <Upload className="mr-2 h-4 w-4" /> Subir archivo
            <CommandShortcut>⌘U</CommandShortcut>
          </CommandItem>
          <CommandItem
            onSelect={() => {
              setOpen(false);
              onPresentation?.();
            }}
          >
            <Maximize2 className="mr-2 h-4 w-4" /> Modo presentación
            <CommandShortcut>⌘P</CommandShortcut>
          </CommandItem>
          <CommandItem
            onSelect={() => {
              setTheme(theme === "dark" ? "light" : "dark");
              setOpen(false);
              toast(`Tema: ${theme === "dark" ? "claro" : "oscuro"}`);
            }}
          >
            {theme === "dark" ? <Sun className="mr-2 h-4 w-4" /> : <Moon className="mr-2 h-4 w-4" />}
            Cambiar tema
            <CommandShortcut>⌘J</CommandShortcut>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
};

export default CommandPalette;
