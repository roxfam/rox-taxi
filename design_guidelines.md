# Rox Taxi Design Guidelines

## Z-index Scale (single source of truth)

We use an explicit Tailwind arbitrary-value scale to avoid the ad-hoc `z-50`
collisions that happen when overlays live in different components.

| Layer                       | Class     | Notes                                                            |
| --------------------------- | --------- | ---------------------------------------------------------------- |
| Sticky nav / page headers   | `z-[80]`  | Layout nav bar, AdminManage sticky header, AdminGroups header.  |
| Floating helpers            | `z-[85]`  | ChatWidget FAB + panel — must sit **below** booking modals.      |
| Mobile menu drawer          | `z-[95]` (backdrop) / `z-[96]` (drawer) | Layout mobile menu overlay. |
| Modal overlays              | `z-[100]` | Dialog, AlertDialog, Sheet, Drawer, BookingModal, DepositActionModal, AdminManage image-edit modal. |
| Popovers / dropdowns        | `z-[110]` | Popover, Select, DropdownMenu, ContextMenu, HoverCard, Menubar. Popovers must render **above** modals so date-pickers work inside dialogs. |
| Tooltips                    | `z-[120]` | Tooltip content.                                                 |
| Toasts                      | `z-[130]` | Sonner toast viewport — highest priority so notifications always win. |

**Rule of thumb:** never introduce a new `z-*` value that isn't in this table.
If you need something in-between, edit this doc and the base primitive at the
same time.

## Text hierarchy

- H1 (hero): `serif text-6xl sm:text-7xl lg:text-8xl leading-[0.9] tracking-tight`
- H2 (section titles): `serif text-3xl sm:text-4xl lg:text-5xl`
- Body: `text-base leading-relaxed text-[#0B192C]`
- Small caps eyebrow: `text-xs tracking-[0.3em] uppercase text-[#64748B]`

## Palette

- Navy: `#0B3B5C` — primary text on light, primary surface on dark.
- Ink: `#0B192C` — body text on light backgrounds.
- Gold: `#D4A94A` — accents, badges, primary highlights.
- Champagne (italic emphasis): `#F5E1A4` — hero italic accents.
- Coral: `#E86A3C` — primary CTA background.
- Sand (surface): `#FBF7EF` — muted surface panels.
- Slate mist: `#F1F5F9` — chat message surfaces.
- Border grey: `#E2E8F0`.
- Copy grey: `#64748B`.
