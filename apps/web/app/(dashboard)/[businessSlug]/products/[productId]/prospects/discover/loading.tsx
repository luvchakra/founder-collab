export default function Loading() {
  return (
    <div className="flex flex-col gap-4">
      <div className="h-4 w-32 animate-pulse rounded bg-muted" />
      <div className="h-20 animate-pulse rounded-md bg-muted" />
      <div className="h-20 animate-pulse rounded-md bg-muted" />
      <div className="h-20 animate-pulse rounded-md bg-muted" />
    </div>
  );
}
