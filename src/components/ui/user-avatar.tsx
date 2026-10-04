import Image from "next/image";
import { cn } from "@/lib/utils";

export function UserAvatar({
  name,
  src,
  className,
}: {
  name: string;
  src?: string | null;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "relative inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-soft font-semibold text-brand ring-1 ring-border",
        className,
      )}
    >
      {src ? (
        <Image
          src={src}
          alt={`${name}的头像`}
          fill
          sizes="80px"
          unoptimized
          className="object-cover"
        />
      ) : (
        <span aria-hidden="true">{name.slice(0, 1).toUpperCase() || "我"}</span>
      )}
    </span>
  );
}
