import { Skeleton } from "@/components/ui/skeleton";
interface ChartSkeletonProps {
  height?: number;
  title?: string;
}
const ChartSkeleton = ({ height = 240, title }: ChartSkeletonProps) => (
  <div className="glass-card p-5 animate-slide-up">
    <div className="flex items-center gap-2 mb-4">
      <Skeleton className="h-2 w-2 rounded-full" />
      <Skeleton className="h-4 w-48" />
    </div>
    {title && <Skeleton className="h-3 w-32 mb-4" />}
    <div className="flex items-end gap-2" style={{ height }}>
      {Array.from({ length: 8 }).map((_, i) => (
        <Skeleton
          key={i}
          className="flex-1 rounded-t-md"
          style={{ height: `${30 + ((i * 37) % 60)}%` }}
        />
      ))}
    </div>
  </div>
);
export default ChartSkeleton;