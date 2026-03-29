"use client";

import Link from "next/link";

interface Props {
  href: string;
  className?: string;
  children: React.ReactNode;
}

export default function PaginationLink({ href, className, children }: Props) {
  return (
    <Link href={href} scroll={false} className={className}>
      {children}
    </Link>
  );
}
