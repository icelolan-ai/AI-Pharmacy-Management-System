import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/** Shows the backend's Thai message as-is; never rewrites it. */
export function ErrorState({
  message,
  onRetry,
  retrying = false,
}: {
  message: string;
  onRetry?: () => void;
  retrying?: boolean;
}) {
  return (
    <Alert variant="destructive" role="alert">
      <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
        <span>{message}</span>
        {onRetry ? (
          <Button variant="outline" size="sm" onClick={onRetry} disabled={retrying}>
            {retrying ? "กำลังลองใหม่..." : "ลองใหม่"}
          </Button>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}
