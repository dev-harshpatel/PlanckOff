'use client';

import Link from 'next/link';
import { useNavigationLoading } from '@/context/NavigationLoadingContext';
import type { ComponentProps } from 'react';

type NavLinkProps = ComponentProps<typeof Link>;

export function NavLink({ href, onClick, children, ...props }: NavLinkProps) {
  const { startNavigation } = useNavigationLoading();

  return (
    <Link
      href={href}
      onClick={(e) => {
        startNavigation(href.toString());
        onClick?.(e);
      }}
      {...props}
    >
      {children}
    </Link>
  );
}
