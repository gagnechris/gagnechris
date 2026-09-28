/** Shared NavLink className helper for admin (and similar) nav. */
export function navLinkClass({ isActive }: { isActive: boolean }): string {
  return isActive
    ? 'admin-nav__link admin-nav__link--active'
    : 'admin-nav__link'
}
