import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  ChevronUp,
  ChevronDown,
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ArrowUpDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface Column<T> {
  key: keyof T | string;
  header: string;
  sortable?: boolean;
  render?: (item: T) => ReactNode;
  className?: string;
}

interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  searchable?: boolean;
  searchPlaceholder?: string;
  searchKeys?: (keyof T | string)[];
  pageSize?: number;
  className?: string;
  testId?: string;
}

export function DataTable<T extends Record<string, any>>({
  data,
  columns,
  searchable = true,
  searchPlaceholder = "Buscar...",
  searchKeys,
  pageSize = 10,
  className,
  testId,
}: DataTableProps<T>) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [currentPage, setCurrentPage] = useState(1);

  const filteredData = useMemo(() => {
    if (!search.trim()) return data;

    const lowerSearch = search.toLowerCase();
    const keys = searchKeys || columns.map((c) => c.key);

    return data.filter((item) =>
      keys.some((key) => {
        const value = item[key as keyof T];

        if (value == null) return false;

        return String(value).toLowerCase().includes(lowerSearch);
      })
    );
  }, [data, search, searchKeys, columns]);

  const sortedData = useMemo(() => {
    if (!sortKey) return filteredData;

    return [...filteredData].sort((a, b) => {
      const aVal = a[sortKey as keyof T];
      const bVal = b[sortKey as keyof T];

      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;

      if (typeof aVal === "number" && typeof bVal === "number") {
        return sortDirection === "asc" ? aVal - bVal : bVal - aVal;
      }

      const comparison = String(aVal).localeCompare(String(bVal), "es", {
        numeric: true,
        sensitivity: "base",
      });

      return sortDirection === "asc" ? comparison : -comparison;
    });
  }, [filteredData, sortKey, sortDirection]);

  const totalPages = Math.max(1, Math.ceil(sortedData.length / pageSize));

  useEffect(() => {
    setCurrentPage((prev) => Math.min(prev, totalPages));
  }, [totalPages]);

  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedData.slice(start, start + pageSize);
  }, [sortedData, currentPage, pageSize]);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDirection("asc");
    }

    setCurrentPage(1);
  };

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setCurrentPage(1);
  };

  const startItem =
    sortedData.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;

  const endItem = Math.min(currentPage * pageSize, sortedData.length);

  return (
    <div className={cn("space-y-4", className)} data-testid={testId}>
      {searchable && (
        <div className="relative group">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground transition-colors duration-300 group-focus-within:text-primary" />

          <Input
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className={cn(
              "h-10 pl-10",
              "border-border/70 bg-secondary/40 backdrop-blur-sm",
              "transition-all duration-300",
              "focus:border-primary/60 focus:bg-secondary/60",
              "focus:shadow-[0_0_0_3px_hsl(var(--primary)/0.1)]"
            )}
            data-testid="input-table-search"
          />
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-border/70 bg-card/70 shadow-lg backdrop-blur-sm">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="sticky top-0 z-10 border-b border-border/70 bg-secondary/70 backdrop-blur-md hover:bg-secondary/70">
                {columns.map((column) => {
                  const columnKey = String(column.key);
                  const isSorted = sortKey === columnKey;

                  return (
                    <TableHead
                      key={columnKey}
                      className={cn(
                        "py-3.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground",
                        column.sortable &&
                          "cursor-pointer select-none transition-colors duration-200 hover:text-primary",
                        column.className
                      )}
                      onClick={
                        column.sortable
                          ? () => handleSort(columnKey)
                          : undefined
                      }
                    >
                      <div className="flex items-center gap-1.5">
                        {column.header}

                        {column.sortable &&
                          (isSorted ? (
                            sortDirection === "asc" ? (
                              <ChevronUp className="h-3.5 w-3.5 text-primary" />
                            ) : (
                              <ChevronDown className="h-3.5 w-3.5 text-primary" />
                            )
                          ) : (
                            <ArrowUpDown className="h-3 w-3 opacity-30" />
                          ))}
                      </div>
                    </TableHead>
                  );
                })}
              </TableRow>
            </TableHeader>

            <TableBody>
              {paginatedData.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={columns.length}
                    className="h-32 text-center text-sm text-muted-foreground"
                  >
                    No hay datos para mostrar
                  </TableCell>
                </TableRow>
              ) : (
                paginatedData.map((item, index) => (
                  <TableRow
                    key={index}
                    className={cn(
                      "group border-b border-border/40",
                      "transition-all duration-200",
                      "hover:translate-x-[2px] hover:bg-primary/[0.04]"
                    )}
                    data-testid={`table-row-${index}`}
                  >
                    {columns.map((column) => (
                      <TableCell
                        key={String(column.key)}
                        className={cn(
                          "py-3 text-sm tabular-nums transition-colors group-hover:text-foreground",
                          column.className
                        )}
                      >
                        {column.render
                          ? column.render(item)
                          : String(item[column.key as keyof T] ?? "-")}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-2 px-1 text-sm">
          <p className="text-xs tabular-nums text-muted-foreground">
            Mostrando{" "}
            <span className="font-semibold text-foreground">{startItem}</span>{" "}
            –{" "}
            <span className="font-semibold text-foreground">{endItem}</span>{" "}
            de{" "}
            <span className="font-semibold text-foreground">
              {sortedData.length}
            </span>
          </p>

          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className={cn(
                "h-8 w-8 border-border/70 bg-secondary/40",
                "transition-all hover:scale-105 hover:border-primary/50 hover:bg-primary/10"
              )}
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              data-testid="button-first-page"
            >
              <ChevronsLeft className="h-4 w-4" />
            </Button>

            <Button
              variant="outline"
              size="icon"
              className={cn(
                "h-8 w-8 border-border/70 bg-secondary/40",
                "transition-all hover:scale-105 hover:border-primary/50 hover:bg-primary/10"
              )}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              data-testid="button-prev-page"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>

            <span className="min-w-[70px] px-3 text-center text-xs font-semibold tabular-nums text-muted-foreground">
              {currentPage} / {totalPages}
            </span>

            <Button
              variant="outline"
              size="icon"
              className={cn(
                "h-8 w-8 border-border/70 bg-secondary/40",
                "transition-all hover:scale-105 hover:border-primary/50 hover:bg-primary/10"
              )}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              data-testid="button-next-page"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>

            <Button
              variant="outline"
              size="icon"
              className={cn(
                "h-8 w-8 border-border/70 bg-secondary/40",
                "transition-all hover:scale-105 hover:border-primary/50 hover:bg-primary/10"
              )}
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
              data-testid="button-last-page"
            >
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}