import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu'
import { Check, ChevronRight } from 'lucide-react'
import type * as React from 'react'

import { cn } from './utils'

/**
 * MENU DÉROULANT — thème, langue, compte.
 *
 * Les entrées font 40 px de haut au lieu des 32 px du catalogue : un menu s'ouvre
 * aussi au doigt, et « Déconnexion » voisine « Réglages ». Une cible trop courte y
 * coûte une déconnexion involontaire en pleine saisie de contrat.
 *
 * `--overlay-shadow` est légitime ici : le menu appartient à la couche flottante, la
 * seule famille de surfaces du produit autorisée à décoller du papier.
 */
export const DropdownMenu = DropdownMenuPrimitive.Root
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger
export const DropdownMenuGroup = DropdownMenuPrimitive.Group
export const DropdownMenuPortal = DropdownMenuPrimitive.Portal
export const DropdownMenuSub = DropdownMenuPrimitive.Sub
export const DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup

export function DropdownMenuContent({
  className,
  sideOffset = 6,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        data-slot="dropdown-menu-content"
        sideOffset={sideOffset}
        className={cn(
          'z-50 max-h-(--radix-dropdown-menu-content-available-height) min-w-[11rem]',
          'origin-(--radix-dropdown-menu-content-transform-origin) overflow-y-auto overflow-x-hidden',
          'rounded-lg border border-rule bg-surface p-1 text-ink',
          'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
          'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
          className,
        )}
        style={{ boxShadow: 'var(--overlay-shadow)' }}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  )
}

export function DropdownMenuItem({
  className,
  inset,
  variant = 'default',
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Item> & {
  inset?: boolean
  variant?: 'default' | 'destructive'
}) {
  return (
    <DropdownMenuPrimitive.Item
      data-slot="dropdown-menu-item"
      data-inset={inset}
      data-variant={variant}
      className={cn(
        'relative flex min-h-10 cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-2 text-sm outline-hidden',
        'focus:bg-surface-sunken focus:text-ink',
        'data-[disabled]:pointer-events-none data-[disabled]:opacity-45',
        'data-[variant=destructive]:text-danger data-[variant=destructive]:focus:bg-danger-wash',
        'data-[inset]:ps-8',
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    />
  )
}

export function DropdownMenuCheckboxItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.CheckboxItem>) {
  return (
    <DropdownMenuPrimitive.CheckboxItem
      data-slot="dropdown-menu-checkbox-item"
      className={cn(
        'relative flex min-h-10 cursor-pointer select-none items-center gap-2 rounded-sm py-2 pe-2 ps-8 text-sm outline-hidden',
        'focus:bg-surface-sunken data-[disabled]:pointer-events-none data-[disabled]:opacity-45',
        className,
      )}
      {...props}
    >
      {/* La coche dit « c'est celui-ci » sans dépendre de la couleur. */}
      <span className="pointer-events-none absolute start-2 flex size-3.5 items-center justify-center">
        <DropdownMenuPrimitive.ItemIndicator>
          <Check className="size-4" aria-hidden="true" />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.CheckboxItem>
  )
}

export function DropdownMenuLabel({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Label>) {
  return (
    <DropdownMenuPrimitive.Label
      data-slot="dropdown-menu-label"
      className={cn('px-2 py-1.5 text-2xs font-medium uppercase tracking-wide text-muted', className)}
      {...props}
    />
  )
}

export function DropdownMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
  return (
    <DropdownMenuPrimitive.Separator
      data-slot="dropdown-menu-separator"
      className={cn('-mx-1 my-1 h-px bg-rule', className)}
      {...props}
    />
  )
}

export function DropdownMenuShortcut({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      data-slot="dropdown-menu-shortcut"
      className={cn('numeric ms-auto text-2xs tracking-widest text-muted', className)}
      {...props}
    />
  )
}

export function DropdownMenuSubTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.SubTrigger>) {
  return (
    <DropdownMenuPrimitive.SubTrigger
      data-slot="dropdown-menu-sub-trigger"
      className={cn(
        'flex min-h-10 cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-2 text-sm outline-hidden',
        'focus:bg-surface-sunken data-[state=open]:bg-surface-sunken',
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      {children}
      {/* Chevron DIRECTIONNEL : il se retourne en arabe (docs/DESIGN.md §3). */}
      <ChevronRight className="icon-directional ms-auto size-4" aria-hidden="true" />
    </DropdownMenuPrimitive.SubTrigger>
  )
}

export function DropdownMenuSubContent({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.SubContent>) {
  return (
    <DropdownMenuPrimitive.SubContent
      data-slot="dropdown-menu-sub-content"
      className={cn(
        'z-50 min-w-[8rem] origin-(--radix-dropdown-menu-content-transform-origin) overflow-hidden rounded-md border border-rule bg-surface p-1',
        'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
        className,
      )}
      style={{ boxShadow: 'var(--overlay-shadow)' }}
      {...props}
    />
  )
}
