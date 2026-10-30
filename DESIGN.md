# TradeVault V1 — Design System & Anti-Slop Specification (`DESIGN.md`)

## 1. Design Read & Dials (R-37)

- **Design Read**:
  > *"TradeVault is a financial trading journal and risk analytics workspace. Its visual language is a precise, restrained, utilitarian ledger with disciplined blue accents, strong numerical legibility, and minimal decoration."*
- **Dials**:
  - `ENERGY: 1` — Restrained, high-precision financial atmosphere with flat neutral surfaces and zero decorative noise.
  - `RHYTHM: 2` — Structured grid spacing (`gap-4` / `gap-6`) and subtle `1px` surface dividers (`#252B34` dark / `#DDE3EA` light) that organize dense trade telemetry cleanly.
  - `MOTION: 1` — Instantaneous state transitions (`150ms`), zero decorative hover scaling (`scale-105`), and full `prefers-reduced-motion` compliance.

---

## 2. Written One-Line Design Rationale (R-31)

1. **Neutral Dark & Light Surfaces (`#080A0E` / `#F5F7FA`)**: Deep carbon-black and crisp neutral paper backgrounds maximize numerical contrast during long XAUUSD journaling sessions without eye strain.
2. **Single Primary Brand Accent (`#1769E8`)**: Consolidating interactive highlights to a single disciplined financial blue eliminates multi-accent visual competition and establishes an unambiguous action hierarchy.
3. **Strict Semantic Financial Colors on Text Only**: Reserving green (`#10B981` / `#059669`), red (`#F43F5E` / `#E11D48`), and amber (`#F59E0B` / `#D97706`) exclusively for profit/loss text, deltas, drawdown numbers, and risk status text on flat neutral surfaces—without colored borders, colored background containers, or neon glow—ensures color always carries calm quantitative meaning.
4. **Monochrome Outline Icons (`stroke-[1.75]`)**: Removing rainbow icon boxes (`bg-emerald-500/10`, `bg-purple-500/10`, `bg-cyan-500/10`) in favor of subtle monochrome outline icons keeps visual focus on the trader's numbers rather than decorative chrome.
5. **Global Sans-Serif Typography with Tabular Financial Numerals (`Arial, Helvetica, sans-serif` + `tabular-nums`)**: Standardizing the entire interface and `.font-mono-numbers` on `Arial, Helvetica, sans-serif` with `font-variant-numeric: tabular-nums` guarantees vertical digit alignment and crisp standard zero rendering without coding-font slashes or dotted zeros.
6. **Zero Truncation on Financial KPIs**: Allowing KPI labels and values to wrap cleanly (`break-words`) rather than clipping with `truncate` prevents misleading readings of negative signs, currency prefixes, or decimal places on mobile viewports.

---

## 3. Semantic Color Tokens

### Dark Theme (`.dark` — Default)
| Semantic Role | CSS Custom Property | Hex Value | Usage |
| :--- | :--- | :--- | :--- |
| Main App Background | `--tv-bg` | `#080A0E` | Root page canvas, table/input inset wells |
| Primary Card Surface | `--tv-surface` | `#11151B` | KPI cards, chart containers, table surface, sidebar, navbar |
| Elevated Surface | `--tv-surface-elevated` | `#171D26` | Modals, popovers, active filter pills, hover states |
| Subtle Border / Divider | `--tv-border` | `#252B34` | `1px` card borders, table row dividers, input outlines |
| Primary Text | `--tv-text-primary` | `#F2F5F9` | Headings, primary financial values, active labels |
| Secondary / Muted Text | `--tv-text-secondary` | `#929BA9` | KPI titles, timestamps, axis labels, helper text |
| Primary Interactive Accent | `--tv-accent` | `#1769E8` | Primary CTA buttons, active tabs/pills, focus rings, equity line |
| Profit / Positive | `--tv-profit` | `#10B981` | Positive PnL text, BUY label text, winning metric numbers (text only) |
| Loss / Negative | `--tv-loss` | `#F43F5E` | Negative PnL text, SELL label text, drawdown numbers (text only) |
| Warning / Caution | `--tv-warning` | `#F59E0B` | Risk limit text, demo mode notice text, validation warning text |

### Light Theme (`:root` / `.light`)
| Semantic Role | CSS Custom Property | Hex Value | Usage |
| :--- | :--- | :--- | :--- |
| Main App Background | `--tv-bg` | `#F5F7FA` | Root page canvas, subtle inset wells |
| Primary Card Surface | `--tv-surface` | `#FFFFFF` | KPI cards, chart containers, table surface, sidebar, navbar |
| Elevated Surface | `--tv-surface-elevated` | `#EEF2F6` | Secondary panels, active filter pills, subtle hover states |
| Subtle Border / Divider | `--tv-border` | `#DDE3EA` | `1px` card borders, table row dividers, input outlines |
| Primary Text | `--tv-text-primary` | `#151D2A` | Headings, primary financial values, active labels |
| Secondary / Muted Text | `--tv-text-secondary` | `#697586` | KPI titles, timestamps, axis labels, helper text |
| Primary Interactive Accent | `--tv-accent` | `#1769E8` | Primary CTA buttons, active tabs/pills, focus rings, equity line |
| Profit / Positive | `--tv-profit` | `#059669` | Positive PnL text, BUY label text, winning metric numbers (text only) |
| Loss / Negative | `--tv-loss` | `#E11D48` | Negative PnL text, SELL label text, drawdown numbers (text only) |
| Warning / Caution | `--tv-warning` | `#D97706` | Risk limit text, demo mode notice text, validation warning text |

---

## 4. Typography & Numerical Hierarchy

- **Global UI & Financial Font Stack**: `Arial, Helvetica, sans-serif`
  - Page Titles: `text-lg sm:text-xl font-bold tracking-tight`
  - Section Headers: `text-sm font-semibold`
  - Card / Metric Labels: `text-[11px] font-medium uppercase tracking-wider`
  - Body / Table Controls: `text-xs` (`12px`) to `text-sm` (`14px`)
- **Tabular Financial Numerals (`.font-mono-numbers`)**: `Arial, Helvetica, sans-serif` with `font-variant-numeric: tabular-nums`
  - Primary KPI Values: `text-lg sm:text-xl font-bold font-mono-numbers tabular-nums`
  - Secondary KPI / Table Values: `text-xs sm:text-sm font-semibold font-mono-numbers tabular-nums`
  - Zero-Digit Rule: Financial numbers render in clean sans-serif glyphs without coding-font slashed or dotted zeros.
  - Mobile Safety Rule: Financial KPI cards must never apply `truncate` to metric labels or numerical values.

---

## 5. Component & Surface Architecture

1. **KPI Cards (`StatCard.tsx`)**:
   - Flat neutral card (`bg-white dark:bg-[#11151B]`) with `1px` border (`border-[#DDE3EA] dark:border-[#252B34]`) and `rounded-xl` (`12px`) radius.
   - Header displays the uppercase metric label on the left and a subtle `16px` monochrome outline icon (`stroke-[1.75] text-[#697586] dark:text-[#929BA9]`) on the right—no colored icon boxes and no hover scale animations.
   - Positive/negative trend indicators render as flat muted semantic text without colored borders or tinted pill backgrounds.
2. **Charts (`EquityChart`, `DrawdownChart`, `RadarChart`, `AnalyticsView`, `CompoundingCalculatorTab`, `TradeSimulationTab`)**:
   - Equity curve and radar polygon use `#1769E8` stroke with subtle low-opacity fill (`0.16` to `0.0`).
   - Drawdown curve uses semantic rose (`#F43F5E`) with subtle low-opacity fill.
   - Grid lines use theme-aware neutral borders (`#DDE3EA` light / `#252B34` dark), tooltips use solid neutral elevated surfaces, and all SVG axis/legend labels use `Arial, Helvetica, sans-serif` with `tabular-nums`.
3. **Navigation & Theme Controls (`Navbar`, `Sidebar`, `MobileNav`, `SettingsView`)**:
   - Solid neutral surfaces with `1px` border separation.
   - Active navigation item uses `#1769E8` indicator/text on a neutral elevated pill (`bg-[#EEF2F6] dark:bg-[#171D26]`) with a neutral border.
   - Dark Mode / Light Mode switching is canonically housed in **Settings → Appearance** (`#settings-appearance` in `SettingsView.tsx`), with direct navigation access provided in the left-side navigation (`Sidebar.tsx` and `MobileNav.tsx`) rather than a standalone toggle on the Dashboard top bar.
4. **Modals & Forms**:
   - Every modal, table, form input, and calculator tab supports both Light Mode and Dark Mode using the semantic surface tokens above, with `Escape` key dismissal and visible `#1769E8` `:focus-visible` outlines.
