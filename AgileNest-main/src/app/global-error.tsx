"use client";

import ErrorPage from "./error";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="zh-CN">
      <body className="min-h-full flex flex-col bg-background font-sans text-foreground antialiased">
        <ErrorPage error={error} reset={reset} />
      </body>
    </html>
  );
}
