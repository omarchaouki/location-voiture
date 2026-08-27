import { Slot } from '@radix-ui/react-slot'
import { ChevronRight } from 'lucide-react'
import type * as React from 'react'

import { cn } from './utils'

/**
 * Fil d'Ariane.
 *
 * Le chevron porte `icon-directional` : c'est une icône de DIRECTION, elle se
 * retourne en arabe. Les icônes d'objet (voiture, clé) ne portent jamais cette classe
 * — une voiture retournée est une voiture cassée (docs/DESIGN.md §3).
 */
export function Breadcrumb({ ...props }: React.ComponentProps<'nav'>) {
  return <nav data-slot="breadcrumb" {...props} />
}

export function BreadcrumbList({ className, ...props }: React.ComponentProps<'ol'>) {
  return (
    <ol
      data-slot="breadcrumb-list"
      className={cn('flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground', className)}
      {...props}
    />
  )
}

export function BreadcrumbItem({ className, ...props }: React.ComponentProps<'li'>) {
  return (
    <li
      data-slot="breadcrumb-item"
      className={cn('inline-flex items-center gap-1.5', className)}
      {...props}
    />
  )
}

export function BreadcrumbLink({
  asChild,
  className,
  ...props
}: React.ComponentProps<'a'> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'a'
  return (
    <Comp
      data-slot="breadcrumb-link"
      className={cn('rounded-sm transition-colors hover:text-foreground', className)}
      {...props}
    />
  )
}

export function BreadcrumbPage({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      data-slot="breadcrumb-page"
      role="link"
      aria-disabled="true"
      aria-current="page"
      className={cn('font-medium text-foreground', className)}
      {...props}
    />
  )
}

export function BreadcrumbSeparator({ children, className, ...props }: React.ComponentProps<'li'>) {
  return (
    <li
      data-slot="breadcrumb-separator"
      role="presentation"
      aria-hidden="true"
      className={cn('[&>svg]:size-3.5', className)}
      {...props}
    >
      {children ?? <ChevronRight className="icon-directional" />}
    </li>
  )
}
