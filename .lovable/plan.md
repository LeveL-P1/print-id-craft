
# PrintID Pro — Multi-School ID Card Management & Print Portal

## Overview
A production-grade SaaS application for ID card manufacturers to manage schools, collect student data, design ID templates, and manage print batches. Built with React, Tailwind CSS, and TypeScript.

## Design System
- **Palette**: Deep navy `#0F172A` primary, electric blue `#3B82F6` accent, slate-50 `#F8FAFC` background, white surfaces
- **Typography**: Inter variable font, `tabular-nums` for numbers, tight tracking on headings
- **Surfaces**: Matte ceramic — flat white cards with 1px borders, subtle layered shadows
- **Radius**: Outer `rounded-xl`, inner `rounded-lg`, buttons `rounded-md`
- **Motion**: Quart-out easing, 150ms hovers, 300ms transitions, `whileTap` scale on buttons

---

## Screens & Features

### 1. Landing / Login Page
- Split-screen: left navy panel with CSS-stacked ID card illustration, right login form
- Three role cards (Manufacturer Admin, School Teacher, Super Admin) with icons, accent colors, hover animations
- Clean form with email/password inputs

### 2. Manufacturer Dashboard
- Top navbar: logo, school selector dropdown, notification bell, profile avatar
- Collapsible left sidebar: Schools, Links Manager, Template Designer, Print Batches, Reports, Settings
- Dashboard home: 4 stat cards (Total Schools, Submissions Today, Pending Reviews, Print Jobs Queued), recent activity feed, school-wise submission progress bars

### 3. School Management
- Card grid of onboarded schools with logo, name, class count, progress ring, status badge
- "+ Add School" button → slide-over form (name, logo, address, board, primary color, template)
- School detail page with tabs: Overview, Classes, Templates, Submissions, Export
- Class list with shareable submission links

### 4. ID Card Template Designer
- Three-panel layout: left toolbox (text, photo, logo, QR, barcode, shape elements), center CR80 card canvas with front/back toggle, right layer panel
- Top toolbar: undo/redo, zoom, grid toggle, card size, DPI, orientation
- Draggable/resizable elements with snap guides
- Dynamic field chips: [Name], [Class], [Roll No], [Photo], [DOB], [Blood Group], [School Logo]
- Bottom bar: Save Draft, Preview with Sample Data, Publish Template
- Preview modal with realistic sample data

### 5. Student Data Collection Form (Public)
- School-branded header (logo, name, accent color)
- 3-step wizard with progress bar: Personal Details → Photo Upload (with circular crop guide) → Review & Submit (live ID preview)
- Mobile-first: large touch targets, camera access
- Success screen with QR token and animated checkmark
- Already-submitted guard screen

### 6. Teacher Dashboard
- School/class header with submission summary bar (Total, Submitted, Pending, Flagged)
- Data table: Student Name, Roll No, Submitted At, Status badge, Actions (Preview, Flag, Approve)
- Share submission link with copy/WhatsApp/Email buttons
- Preview modal: front + back ID card side by side
- Flag modal with correction note field

### 7. Print Batch Manager
- Two action cards: Generate Front Batch (blue), Generate Back Batch (green)
- Batch history table: Batch ID, School, Class, Cards Count, Generated At, Status, Download PDF, Download Manifest
- Confirmation modal before generation with card count, sort order, approval warning
- Download options: Front PDF, Back PDF, Print Manifest (Excel), QR Verification Sheet

### 8. Front-Back Matching Verification
- Dark mode UI (`bg-slate-950`) for print floor
- Large scan bar (`h-20 text-3xl font-mono`)
- After scan: student info, front/back thumbnails, match status with screen-border flash on match
- Batch verification table with scan timestamps
- Export mismatch report

### 9. Reports & Analytics
- School-wise cards with submission donut charts, timeline bar charts
- Top stats: Total IDs generated, Active Schools, Print Jobs completed
- Filterable/exportable data table (School, Class, Date Range, Status)

---

## Shared Components
- **Tables**: Search, filter, sort, pagination on all data tables
- **Status badges**: Color-coded (yellow=pending, blue=submitted, green=approved, red=flagged)
- **Toast notifications**: Success/error on all actions via Sonner
- **Loading skeletons**: On all data-fetched areas
- **Empty states**: Functional wireframe placeholders (no decorative illustrations)
- **Confirmation modals**: For all destructive actions
- **Sidebar**: Collapsible with icon-only mini mode

---

## Routing
- `/` — Landing/Login
- `/dashboard` — Manufacturer Dashboard
- `/schools` — School Management
- `/schools/:id` — School Detail
- `/templates` — Template Designer
- `/batches` — Print Batch Manager
- `/matcher` — Front-Back Matching
- `/reports` — Reports & Analytics
- `/submit/:schoolId/:classId` — Student Form (public)
- `/teacher` — Teacher Dashboard

## Technical Notes
- All data is mock/static for now (no backend)
- Recharts for charts and donut visualizations
- Framer Motion can be added later for drag-drop in template designer; initial build uses interactive but non-drag UI
- Fully responsive with mobile-first student form
