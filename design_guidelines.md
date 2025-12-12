# Design Guidelines: Depurador de Bases - Data Analysis Platform

## Design Approach

**Selected Approach:** Design System (Utility-Focused Application)  
**Primary Reference:** Linear + Modern Analytics Dashboards (Mixpanel, Amplitude)  
**Justification:** This is a data-intensive productivity tool requiring clarity, efficiency, and professional polish over creative flourishes.

## Core Design Principles

1. **Data First:** Every design decision prioritizes data legibility and quick insights
2. **Professional Restraint:** Clean, minimal interface that doesn't compete with information density
3. **Efficient Navigation:** Multi-tab structure with persistent context
4. **Scannable Hierarchy:** Clear visual separation between sections, KPIs, and data tables

## Typography

**Font Stack:** 'Inter', system-ui, -apple-system, sans-serif  
**Hierarchy:**
- H1 (Page Title): text-2xl, font-bold (24px)
- H2 (Section Headers): text-xl, font-semibold (20px)
- H3 (Card Titles): text-base, font-semibold (16px)
- Body Text: text-sm (14px)
- Data/Numbers: text-lg, font-bold for KPIs (18px)
- Small Labels: text-xs (12px)

## Layout System

**Spacing Units:** Tailwind spacing of 2, 4, 6, 8, 12, 16  
**Container Strategy:**
- Main container: max-w-7xl with px-6
- Section spacing: py-8 between major sections
- Card padding: p-6
- Component gaps: gap-4 for grids, gap-6 for larger separations

**Grid Structure:**
- KPI Cards: grid-cols-1 md:grid-cols-2 lg:grid-cols-4
- Data Tables: Full-width within container
- Charts: grid-cols-1 lg:grid-cols-2 for side-by-side comparisons

## Component Library

### Header
- Fixed top navigation with shadow
- Logo/title on left, file upload button on right
- Subtitle text explaining purpose
- Height: h-16, with subtle border-b

### Tab Navigation
- Horizontal tabs below header
- Active state with bottom border and slightly bolder weight
- Icons prefix each tab label (📊, 📈, 🧹, 🎛, 📚, ⚙️)
- Smooth transition on tab switch

### KPI Cards
- White background with subtle border (border-gray-200)
- Rounded corners (rounded-lg)
- Shadow on hover (hover:shadow-md transition-shadow)
- Structure: Small label text-xs → Large number text-2xl font-bold → Optional percentage/change indicator
- Grid layout with consistent height

### Data Tables
- Sticky header row with bg-gray-50
- Alternating row colors (even:bg-gray-50)
- Cell padding: px-4 py-3
- Border between rows: border-b border-gray-200
- Sort indicators in headers
- Hover state: hover:bg-blue-50

### Filter Controls
- Grouped in cards above tables
- Dropdowns and range sliders inline
- "Apply Filters" primary button
- "Reset" secondary button adjacent

### Charts/Visualizations
- Clean axes without excessive gridlines
- Use established color palette consistently
- Tooltips on hover with white bg, shadow-lg
- Legend positioned top-right or bottom

### Action Buttons
**Primary (Upload, Export):**
- bg-[#042a51] hover:bg-[#07417c] text-white
- px-6 py-2.5 rounded-md
- Font weight: font-medium

**Secondary:**
- border border-gray-300 hover:border-gray-400 hover:bg-gray-50
- px-4 py-2 rounded-md

**Icon Buttons:** Minimal, text-gray-600 hover:text-gray-900

### File Upload Area
- Dashed border when empty: border-2 border-dashed border-gray-300
- Drag-over state: border-blue-500 bg-blue-50
- Drop zone with icon and instructional text
- Accepted formats listed below in text-xs text-gray-500

### Tag Badges
- Inline-flex items with rounded-full px-3 py-1
- Color-coded by category:
  - CONTACTADO: bg-green-100 text-green-800
  - INVALIDO: bg-red-100 text-red-800
  - SEGUIR_INTENTANDO: bg-blue-100 text-blue-800
  - SOLO_BUZON: bg-orange-100 text-orange-800
  - NO_ATIENDE: bg-gray-100 text-gray-800
  - RECHAZA: bg-pink-100 text-pink-800

### Loading States
- Skeleton screens for tables (gray pulse animation)
- Spinner for file processing (centered, subtle)
- Progress bar for long operations

## Page-Specific Layouts

### Main Dashboard (📊 Tablero Visual)
- Top: 4-column KPI grid showing: Total ANIs, ANIs to Discard, Contacted ANIs, Success Rate
- Middle: 2-column chart layout (Distribution pie + Contact curve line chart)
- Bottom: Tags distribution table

### Filters Tab (🎛 Filtro Detallado)
- Filter panel at top in card
- Large data table below with pagination
- Export button bottom-right

### Depuration Tab (🧹 Depuración Sugerida)
- Explanation card at top
- Two-column layout: Depurated ANIs table (left) + Discarded ANIs table (right)
- Export buttons for each section

### Turns & Prefixes Tab (📈)
- Morning vs Afternoon comparison charts
- Prefix analysis table with search
- Geographic distribution if applicable

### Catalog Tab (📚)
- Simple searchable/filterable table of prefix codes
- Clean, reference-focused design

### Simulator Tab (⚙️)
- Controls at top: Sliders for thresholds
- Real-time preview of impact below
- Side-by-side comparison cards showing before/after metrics

## Images

**No hero image required.** This is a data tool, not a marketing site. The interface should load directly to the functional dashboard.

## Animations

Minimal and purposeful:
- Tab transitions: fade content (duration-200)
- Table row hover: subtle background color shift
- Button hovers: slight scale or brightness change
- Chart tooltips: fade-in (duration-150)
- NO scroll animations or page transitions

## Accessibility

- All interactive elements keyboard navigable
- Proper ARIA labels on data tables
- Focus indicators on all controls (ring-2 ring-blue-500)
- Color-blind safe palette (never rely on color alone)
- Proper contrast ratios (WCAG AA minimum)