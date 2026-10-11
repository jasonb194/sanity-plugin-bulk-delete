import * as SanityUI from '@sanity/ui'
import React from 'react'

type CompatibleComponent = React.ComponentType<Record<string, unknown>>

// UI 5 introduced a new Button/Card API and rebuilt Dialog around the native
// modal element. Detect that API at runtime so this package can continue to run
// with UI 2–4 while being typechecked against the UI 5 alpha.
const ui = SanityUI as unknown as Record<string, CompatibleComponent | undefined>
const DialogComponent = ui.Dialog
const hasUi5DialogApi = Boolean(
  (DialogComponent as unknown as {Content?: unknown} | undefined)?.Content,
)

export function CompatibleButton({
  text,
  onClick,
  tone,
  mode,
  padding,
  loading,
  disabled,
  title,
  style,
}: {
  text: string
  onClick: () => void
  tone?: 'primary' | 'critical'
  mode?: 'bleed' | 'ghost'
  padding?: number
  loading?: boolean
  disabled?: boolean
  title?: string
  style?: React.CSSProperties
}): React.ReactElement {
  const props = hasUi5DialogApi
    ? {
        text,
        onClick,
        tone: tone === 'critical' ? 'critical' : 'neutral',
        // UI 5 replaced the legacy mode prop with an importance level.
        // Bleed and ghost buttons were subdued actions; critical delete stays primary.
        level: tone === 'critical' || !mode ? 'primary' : 'tertiary',
        ...(padding ? {density: 'regular'} : {}),
        loading,
        disabled,
        title,
        style,
      }
    : {
        text,
        onClick,
        ...(tone ? {tone} : {}),
        ...(mode ? {mode} : {}),
        ...(padding ? {padding} : {}),
        loading,
        disabled,
        title,
        style,
      }
  return React.createElement(ui.Button as CompatibleComponent, props)
}

export function CompatibleCard({
  children,
  style,
  padding,
  radius,
  shadow,
  tone,
  role,
}: {
  children: React.ReactNode
  style?: React.CSSProperties
  padding?: number
  radius?: number
  shadow?: number
  tone?: 'critical' | 'positive' | 'caution'
  role?: string
}): React.ReactElement {
  const props = hasUi5DialogApi
    ? {
        style,
        // UI 5 combines the old numeric padding and radius into a density.
        // Its compact preset uses space 3/radius 2; regular uses space 4/radius 3.
        density: padding && padding <= 3 ? 'compact' : 'regular',
        tone: tone === 'critical' ? 'critical' : 'neutral',
        role,
      }
    : {style, padding, radius, shadow, tone, role}
  return React.createElement(ui.Card as CompatibleComponent, props, children)
}

export function CompatibleFlex(
  props: Record<string, unknown> & {children?: React.ReactNode},
): React.ReactElement {
  const {align, justify, ...rest} = props
  const compatibleProps = hasUi5DialogApi
    ? {...rest, alignItems: align, justifyContent: justify}
    : {...rest, align, justify}
  return React.createElement(ui.Flex as CompatibleComponent, compatibleProps)
}

export function CompatibleBox(
  props: Record<string, unknown> & {children?: React.ReactNode},
): React.ReactElement {
  const {flex, style, ...rest} = props
  const compatibleProps = hasUi5DialogApi
    ? {...rest, style: {...(style as React.CSSProperties), ...(flex ? {flex: `${flex} 1 0%`} : {})}}
    : {...rest, flex, style}
  return React.createElement(ui.Box as CompatibleComponent, compatibleProps)
}

export function CompatibleStack({
  children,
  ...props
}: Record<string, unknown> & {children?: React.ReactNode}): React.ReactElement {
  const Component = ui.Stack ?? ui.VStack
  return React.createElement(Component as CompatibleComponent, props, children)
}

export function CompatibleSelect(
  props: Record<string, unknown> & {children?: React.ReactNode},
): React.ReactElement {
  const {fontSize, style, ...rest} = props
  const compatibleProps = hasUi5DialogApi ? {...rest, style} : {...rest, fontSize, style}
  return React.createElement(ui.Select as CompatibleComponent, compatibleProps)
}

export function CompatibleCheckbox(props: Record<string, unknown>): React.ReactElement {
  if (hasUi5DialogApi) {
    return React.createElement(ui.Checkbox as CompatibleComponent, props)
  }

  // UI 2–4 Checkbox has no label prop. Keep aria-label on its underlying input,
  // and only pass the required nested label to UI 5.
  const legacyProps = {...props}
  delete legacyProps.label
  return React.createElement(ui.Checkbox as CompatibleComponent, legacyProps)
}

export function CompatibleSpinner(props: Record<string, unknown>): React.ReactElement {
  const compatibleProps = hasUi5DialogApi ? {...props} : props
  if (hasUi5DialogApi) delete compatibleProps.muted
  return React.createElement(ui.Spinner as CompatibleComponent, compatibleProps)
}

export function CompatibleDialog({
  children,
  footer,
  onClose,
}: {
  children: React.ReactNode
  footer: React.ReactNode
  onClose: () => void
}): React.ReactElement {
  if (hasUi5DialogApi) {
    const DialogWithParts = DialogComponent as unknown as CompatibleComponent & {
      Content: React.ComponentType<{children?: React.ReactNode}>
      Footer: React.ComponentType<{children?: React.ReactNode}>
    }
    return React.createElement(
      DialogWithParts,
      {id: 'confirm-delete-dialog', header: 'Confirm Deletion', onClose, open: true, size: 1},
      React.createElement(DialogWithParts.Content, null, children),
      React.createElement(DialogWithParts.Footer, null, footer),
    )
  }

  return React.createElement(
    DialogComponent as CompatibleComponent,
    {
      id: 'confirm-delete-dialog',
      header: 'Confirm Deletion',
      onClose,
      width: 1,
      zOffset: 1000,
      footer,
    },
    children,
  )
}
